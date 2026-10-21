import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createApp, Hub } from '../src/app.js';
import { openDb } from '../src/db.js';
import { Service } from '../src/service.js';
import { normalizeCode } from '../src/util.js';

async function boot() {
  const hub = new Hub();
  const service = new Service(openDb(':memory:'), hub);
  const server = createApp({ service, hub });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (who, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(who && { 'x-device-id': who.id, 'x-device-secret': who.secret }) },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const reg = async (name) => (await call(null, 'POST', '/api/register', { name })).body;
  const ws = (who) =>
    new Promise((resolve) => {
      const s = new WebSocket(base.replace('http', 'ws') + '/ws');
      const msgs = [];
      s.on('message', (d) => msgs.push(JSON.parse(d)));
      s.on('open', () => s.send(JSON.stringify({ id: who.id, secret: who.secret })));
      const wait = async (pred) => {
        for (let i = 0; i < 100; i++) {
          const m = msgs.find(pred);
          if (m) return m;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error('timeout; got ' + JSON.stringify(msgs));
      };
      s.once('message', () => resolve({ s, msgs, wait }));
    });
  return { server, call, reg, ws, close: () => server.close() };
}

test('normalizeCode aceita minúsculas e espaços', () => {
  assert.equal(normalizeCode('k7m4 qx2p'), 'K7M4-QX2P');
  assert.equal(normalizeCode('K7M4QX2'), null);
  assert.equal(normalizeCode('K7M4-QX20'), null); // 0 não existe no alfabeto
});

test('pareamento + localização em tempo real + histórico', async () => {
  const t = await boot();
  const eu = await t.reg('Junin');
  const esposa = await t.reg('Maria');
  assert.match(eu.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  assert.equal((await t.call(null, 'GET', '/api/me')).status, 401);
  assert.equal((await t.call(eu, 'POST', '/api/follow', { code: 'ZZZZ-ZZZZ' })).status, 404);
  assert.equal((await t.call(eu, 'POST', '/api/follow', { code: eu.code })).status, 400);

  const ws = await t.ws(eu);
  const f = await t.call(eu, 'POST', '/api/follow', { code: esposa.code.toLowerCase() });
  assert.equal(f.status, 201);
  assert.equal(f.body.name, 'Maria');
  assert.equal(f.body.pos, null);

  const loc = await t.call(esposa, 'POST', '/api/location', { lat: -20.5386, lng: -47.4009, acc: 8, speed: 3, battery: 0.8 });
  assert.equal(loc.status, 200);
  const live = await ws.wait((m) => m.t === 'pos');
  assert.equal(live.code, esposa.code);
  assert.equal(live.pos.lat, -20.5386);

  const me = (await t.call(eu, 'GET', '/api/me')).body;
  assert.equal(me.following[0].pos.battery, 0.8);
  assert.equal(me.following[0].moving, true);
  assert.equal((await t.call(esposa, 'GET', '/api/me')).body.watchers[0].name, 'Junin');

  assert.equal((await t.call(esposa, 'POST', '/api/location', { lat: 999, lng: 0 })).status, 400);
  assert.equal((await t.call(eu, 'GET', `/api/history/${esposa.code}?hours=1`)).body.length, 1);
  ws.s.close();
  t.close();
});

test('pausar compartilhamento esconde a posição', async () => {
  const t = await boot();
  const a = await t.reg('A');
  const b = await t.reg('B');
  await t.call(a, 'POST', '/api/follow', { code: b.code });
  await t.call(b, 'POST', '/api/location', { lat: 1, lng: 1 });
  await t.call(b, 'PATCH', '/api/me', { sharing: false });
  const p = (await t.call(a, 'GET', '/api/me')).body.following[0];
  assert.equal(p.sharing, false);
  assert.equal(p.pos, null);
  t.close();
});

test('rotacionar código revoga quem acompanhava', async () => {
  const t = await boot();
  const a = await t.reg('A');
  const b = await t.reg('B');
  await t.call(a, 'POST', '/api/follow', { code: b.code });
  const rotated = (await t.call(b, 'POST', '/api/me/rotate-code')).body;
  assert.notEqual(rotated.code, b.code);
  assert.equal((await t.call(a, 'GET', '/api/me')).body.following.length, 0);
  t.close();
});

test('lugares: chegada e saída geram eventos; SOS notifica', async () => {
  const t = await boot();
  const a = await t.reg('Junin');
  const b = await t.reg('Maria');
  await t.call(a, 'POST', '/api/follow', { code: b.code });
  await t.call(a, 'POST', '/api/places', { name: 'Casa', emoji: '🏠', lat: -20.5386, lng: -47.4009, radius: 100 });
  const ws = await t.ws(a);
  await t.call(b, 'POST', '/api/location', { lat: -20.55, lng: -47.4 }); // fora
  await t.call(b, 'POST', '/api/location', { lat: -20.5386, lng: -47.4009 }); // dentro
  const ev = await ws.wait((m) => m.t === 'event' && m.event.type === 'arrive');
  assert.match(ev.event.text, /Maria chegou em 🏠 Casa/);
  await t.call(b, 'POST', '/api/sos', {});
  await ws.wait((m) => m.t === 'event' && m.event.type === 'sos');
  assert.equal((await t.call(a, 'GET', '/api/events')).body.length, 2);
  ws.s.close();
  t.close();
});
