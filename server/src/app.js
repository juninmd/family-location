import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { HttpError } from './service.js';
import { reverseGeocode } from './geocode.js';
import { validLat, validLng } from './geo.js';
import { networkKey, rateLimiter } from './util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.apk': 'application/vnd.android.package-archive',
};

/** Conexões WebSocket por aparelho. Implementa a interface `hub` usada pelo Service. */
export class Hub {
  constructor() {
    this.sockets = new Map(); // deviceId -> Set<ws>
  }
  add(id, ws) {
    if (!this.sockets.has(id)) this.sockets.set(id, new Set());
    this.sockets.get(id).add(ws);
  }
  remove(id, ws) {
    const set = this.sockets.get(id);
    set?.delete(ws);
    if (set && !set.size) this.sockets.delete(id);
  }
  isOnline(id) {
    return this.sockets.has(id);
  }
  publish(id, message) {
    const set = this.sockets.get(id);
    if (!set) return;
    const data = JSON.stringify(message);
    for (const ws of set) if (ws.readyState === 1) ws.send(data);
  }
}

export function createApp({ service, hub, publicDir }) {
  const registerLimit = rateLimiter(20, 3600e3);
  const lookupLimit = rateLimiter(30, 600e3);
  const geoLimit = rateLimiter(120, 600e3);
  const discoverLimit = rateLimiter(20, 600e3);

  const send = (res, status, body) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(data);
  };

  const readBody = (req, limit = 64 * 1024) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(new HttpError(413, 'Corpo muito grande'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new HttpError(400, 'JSON inválido'));
        }
      });
      req.on('error', reject);
    });

  const ipOf = (req) => (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').trim();

  async function api(req, res, url) {
    const path = url.pathname;
    const method = req.method;
    const ip = ipOf(req);

    if (path === '/api/register' && method === 'POST') {
      if (!registerLimit(ip)) throw new HttpError(429, 'Muitas tentativas. Aguarde um pouco.');
      return send(res, 201, service.register(await readBody(req)));
    }

    const device = service.authenticate(req.headers['x-device-id'], req.headers['x-device-secret']);
    if (!device) throw new HttpError(401, 'Aparelho não autenticado.');

    if (path === '/api/me' && method === 'GET') return send(res, 200, service.me(device));
    if (path === '/api/me' && method === 'PATCH') return send(res, 200, service.updateProfile(device, await readBody(req)));
    if (path === '/api/me' && method === 'DELETE') return service.deleteAccount(device), send(res, 204);
    if (path === '/api/me/rotate-code' && method === 'POST') return send(res, 200, service.rotateCode(device));

    if (path === '/api/follow' && method === 'POST') {
      if (!lookupLimit(ip + device.id)) throw new HttpError(429, 'Muitas tentativas de código. Aguarde alguns minutos.');
      const body = await readBody(req);
      return send(res, 201, service.follow(device, body.code, body.alias));
    }
    const follow = path.match(/^\/api\/follow\/([^/]+)$/);
    if (follow && method === 'DELETE') return service.unfollow(device, decodeURIComponent(follow[1])), send(res, 204);
    if (follow && method === 'PATCH') {
      service.setFollowMeta(device, decodeURIComponent(follow[1]), await readBody(req));
      return send(res, 204);
    }
    const watcher = path.match(/^\/api\/watchers\/([^/]+)$/);
    if (watcher && method === 'DELETE') return service.removeWatcher(device, decodeURIComponent(watcher[1])), send(res, 204);

    if (path === '/api/location/batch' && method === 'POST')
      return send(res, 200, service.ingestBatch(device, (await readBody(req, 256 * 1024)).points));
    if (path === '/api/me/invite' && method === 'POST') {
      const b = await readBody(req);
      return send(res, 201, service.createInvite(device, b.permanent ? null : b.hours, b.label));
    }
    if (path === '/api/discover' && method === 'GET')
      return send(res, 200, service.discover(device, networkKey(ip), url.searchParams.get('visible') !== '0'));
    if (path === '/api/discover' && method === 'DELETE') return service.stopDiscovering(device), send(res, 204);
    if (path === '/api/discover/request' && method === 'POST') {
      if (!discoverLimit(device.id)) throw new HttpError(429, 'Muitos pedidos. Aguarde alguns minutos.');
      return send(res, 200, service.requestViaDiscovery(device, networkKey(ip), (await readBody(req)).ref));
    }
    const invite = path.match(/^\/api\/me\/invite\/([^/]+)$/);
    if (invite && method === 'DELETE') return service.revokeInvite(device, decodeURIComponent(invite[1])), send(res, 204);
    const request = path.match(/^\/api\/requests\/([^/]+)$/);
    if (request && method === 'POST') {
      service.answerRequest(device, decodeURIComponent(request[1]), (await readBody(req)).accept === true);
      return send(res, 204);
    }
    if (path === '/api/push/register' && method === 'POST') return service.registerPush(device, await readBody(req)), send(res, 204);
    if (path === '/api/push/unregister' && method === 'POST') return service.unregisterPush((await readBody(req)).token), send(res, 204);
    const report = path.match(/^\/api\/report\/([^/]+)$/);
    if (report && method === 'GET')
      return send(res, 200, service.report(device, decodeURIComponent(report[1]), url.searchParams.get('hours')));
    if (path === '/api/location' && method === 'POST') return send(res, 200, service.ingest(device, await readBody(req)));
    const hist = path.match(/^\/api\/history\/([^/]+)$/);
    if (hist && method === 'GET')
      return send(res, 200, service.history(device, decodeURIComponent(hist[1]), url.searchParams.get('hours')));

    if (path === '/api/places' && method === 'POST') return send(res, 201, service.addPlace(device, await readBody(req)));
    const place = path.match(/^\/api\/places\/([^/]+)$/);
    if (place && method === 'DELETE') return service.removePlace(device, place[1]), send(res, 204);

    if (path === '/api/geocode' && method === 'GET') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      if (!validLat(lat) || !validLng(lng)) throw new HttpError(400, 'Coordenadas inválidas.');
      if (!geoLimit(device.id)) throw new HttpError(429, 'Muitas consultas de endereço.');
      return send(res, 200, { address: await reverseGeocode(lat, lng) });
    }
    if (path === '/api/events' && method === 'GET') return send(res, 200, service.events(device, url.searchParams.get('limit')));
    if (path === '/api/sos' && method === 'POST') return send(res, 200, service.sos(device, await readBody(req)));
    if (path === '/api/checkin' && method === 'POST') return send(res, 200, service.checkin(device, await readBody(req)));

    throw new HttpError(404, 'Rota não encontrada.');
  }

  function serveStatic(req, res, url) {
    if (!publicDir || !existsSync(publicDir)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Family Location API');
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(publicDir, rel);
    if (!file.startsWith(publicDir + sep) && file !== publicDir) file = join(publicDir, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, 'index.html');
    const ext = extname(file);
    const hashed = /\/assets\//.test(file);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type,x-device-id,x-device-secret');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    try {
      if (url.pathname === '/health') return send(res, 200, { ok: true, online: hub.sockets.size });
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Erro interno.' });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws, req) => {
    let device = null;
    const authTimer = setTimeout(() => !device && ws.close(4401, 'auth timeout'), 8000);
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!device) {
        device = service.authenticate(m.id, m.secret);
        if (!device) return ws.close(4401, 'unauthorized');
        clearTimeout(authTimer);
        hub.add(device.id, ws);
        ws.send(JSON.stringify({ t: 'ready', me: service.me(device) }));
        service.broadcastPerson(device.id);
        return;
      }
      try {
        if (m.t === 'loc') service.ingest(device, m);
        else if (m.t === 'ping') ws.send('{"t":"pong"}');
      } catch (e) {
        if (!(e instanceof HttpError)) console.error(e);
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (device) {
        hub.remove(device.id, ws);
        service.broadcastPerson(device.id);
      }
    });
    void req;
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));

  return server;
}
