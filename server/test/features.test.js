import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackup } from '../src/backup.js';
import { openDb } from '../src/db.js';
import { createPush } from '../src/push.js';
import { HttpError, Service } from '../src/service.js';
import { networkKey } from '../src/util.js';

function setup(push) {
  const published = [];
  const online = new Set();
  const hub = { publish: (id, m) => published.push([id, m]), isOnline: (id) => online.has(id) };
  const db = openDb(':memory:');
  const svc = new Service(db, hub, push);
  const reg = (name) => {
    const r = svc.register({ name });
    return { ...r, ...svc.q.byId.get(r.id) , code: r.code };
  };
  const events = (id) => published.filter(([to, m]) => to === id && m.t === 'event').map(([, m]) => m.event);
  return { svc, db, reg, published, online, events };
}
const raw = (d) => ({ ...d });

test('aprovação: pedido pendente, aprovar libera a posição', () => {
  const { svc, reg, events } = setup();
  const a = reg('Junin');
  const b = reg('Maria');
  svc.updateProfile(b, { approval: true });
  svc.ingest(b, { lat: -20.5, lng: -47.4 });
  const p = svc.follow(a, b.code);
  assert.equal(p.pending, true);
  assert.equal(p.pos, null);
  assert.equal(svc.me(b).requests.length, 1);
  assert.match(events(b.id)[0].text, /quer acompanhar/);
  assert.equal(svc.me(b).watchers.length, 0);
  svc.answerRequest(b, a.id, true);
  const f = svc.me(a).following[0];
  assert.equal(f.pending, false);
  assert.equal(f.pos.lat, -20.5);
  assert.match(events(a.id).at(-1).text, /aceitou/);
});

test('aprovação: recusar remove o pedido', () => {
  const { svc, reg } = setup();
  const a = reg('A');
  const b = reg('B');
  svc.updateProfile(b, { approval: true });
  svc.follow(a, b.code);
  svc.answerRequest(b, a.id, false);
  assert.equal(svc.me(a).following.length, 0);
  assert.throws(() => svc.answerRequest(b, a.id, true), HttpError);
});

test('convite temporário: dá acesso até expirar e dispensa aprovação', () => {
  const { svc, db, reg } = setup();
  const a = reg('A');
  const b = reg('B');
  svc.updateProfile(b, { approval: true });
  const inv = svc.createInvite(b, 1);
  assert.notEqual(inv.code, b.code);
  const p = svc.follow(a, inv.code);
  assert.equal(p.pending, false);
  assert.equal(p.code, b.code);
  assert.ok(p.expiresAt > Date.now());
  // expira
  db.prepare('UPDATE follows SET expires_at = ?').run(Date.now() - 1000);
  assert.equal(svc.me(a).following.length, 0);
  db.prepare('UPDATE invites SET expires_at = ?').run(Date.now() - 1000);
  assert.throws(() => svc.follow(a, inv.code), /Nenhum aparelho/);
});

test('lote offline grava histórico em ordem e atualiza a posição mais recente', () => {
  const { svc, reg } = setup();
  const a = reg('A');
  const b = reg('B');
  svc.follow(a, b.code);
  const now = Date.now();
  const pts = [3, 2, 1].map((m, i) => ({ lat: -20.5 + i * 0.001, lng: -47.4, ts: now - m * 60_000 }));
  const r = svc.ingestBatch(b, pts);
  assert.equal(r.stored, 3);
  const hist = svc.history(a, b.code, 1);
  assert.equal(hist.length, 3);
  assert.ok(hist[0].ts < hist[2].ts);
  assert.equal(svc.me(a).following[0].pos.lat, -20.498);
  assert.throws(() => svc.ingestBatch(b, []), HttpError);
});

test('bateria baixa avisa uma vez; volta a avisar só depois de recarregar', () => {
  const { svc, reg, events } = setup();
  const a = reg('A');
  const b = reg('B');
  svc.follow(a, b.code);
  const t = Date.now();
  svc.ingest(b, { lat: 1, lng: 1, battery: 0.5, ts: t - 40_000 });
  svc.ingest(b, { lat: 1, lng: 1, battery: 0.19, ts: t - 30_000 });
  svc.ingest(b, { lat: 1, lng: 1, battery: 0.15, ts: t - 20_000 });
  assert.equal(events(a.id).filter((e) => e.type === 'lowbat').length, 1);
  svc.ingest(b, { lat: 1, lng: 1, battery: 0.9, charging: true, ts: t - 10_000 });
  svc.ingest(b, { lat: 1, lng: 1, battery: 0.1, ts: t });
  assert.equal(events(a.id).filter((e) => e.type === 'lowbat').length, 2);
});

test('alerta de velocidade respeita o limite e o intervalo', () => {
  const { svc, reg, events } = setup();
  const a = reg('A');
  const b = reg('B');
  svc.follow(a, b.code);
  svc.setFollowMeta(a, b.code, { speedLimit: 80, group: 'Família' });
  const f = svc.me(a).following[0];
  assert.equal(f.speedLimit, 80);
  assert.equal(f.group, 'Família');
  const t = Date.now();
  svc.ingest(b, { lat: 1, lng: 1, speed: 20, ts: t - 30_000 }); // 72 km/h
  svc.ingest(b, { lat: 1, lng: 1, speed: 25, ts: t - 20_000 }); // 90 km/h
  svc.ingest(b, { lat: 1, lng: 1, speed: 30, ts: t - 10_000 }); // 108 km/h (dentro do cooldown)
  const ev = events(a.id).filter((e) => e.type === 'speed');
  assert.equal(ev.length, 1);
  assert.match(ev[0].text, /90 km\/h/);
});

test('relatório calcula distância, velocidade máxima e paradas', () => {
  const { svc, reg } = setup();
  const a = reg('A');
  const now = Date.now();
  const ins = (min, lat, speed) => svc.q.insertPos.run(a.id, now - min * 60_000, lat, -47.4, 5, speed, 0, 0, 0.5, 0);
  // parado 10 min, depois anda ~1,1 km em 2 min (≈33 km/h)
  ins(30, -20.5, 0);
  ins(25, -20.5, 0);
  ins(20, -20.5, 0);
  ins(2, -20.5, 0);
  ins(1, -20.505, 10);
  ins(0, -20.51, 10);
  const r = svc.report(a, a.code, 1);
  assert.equal(r.points, 6);
  assert.ok(r.distanceKm >= 1 && r.distanceKm <= 1.3, `distância ${r.distanceKm}`);
  assert.equal(r.maxKmh, 36);
  assert.equal(r.stops, 1);
  assert.ok(r.longestStopMin >= 25);
});

test('estado de chegada/saída persiste entre reinícios', () => {
  const { svc, db, reg, events } = setup();
  const a = reg('A');
  const b = reg('B');
  svc.follow(a, b.code);
  svc.addPlace(a, { name: 'Casa', lat: 0, lng: 0, radius: 100 });
  svc.ingest(b, { lat: 0, lng: 0, ts: Date.now() - 20_000 }); // dentro (1ª leitura: sem evento)
  const svc2 = new Service(db, { publish: (id, m) => m.t === 'event' && events2.push(m.event), isOnline: () => false });
  const events2 = [];
  svc2.ingest(b, { lat: 0.5, lng: 0.5, ts: Date.now() - 10_000 }); // saiu
  assert.equal(events(a.id).length, 0);
  assert.equal(events2.length, 1);
  assert.match(events2[0].text, /saiu de/);
});

test('push: só dispara com app fechado (SOS sempre) e remove tokens inválidos', async () => {
  const calls = [];
  const push = { configured: true, notify: async (tokens, p) => (calls.push([tokens, p]), ['t'.repeat(30)]) };
  const { svc, reg, online } = setup(push);
  const a = reg('A');
  const b = reg('B');
  svc.follow(a, b.code);
  svc.registerPush(a, { token: 't'.repeat(30), platform: 'android' });
  svc.checkin(b, { message: 'Cheguei' });
  assert.equal(calls.length, 1);
  assert.match(calls[0][1].body, /Cheguei/);
  online.add(a.id);
  svc.checkin(b, { message: 'Oi' });
  assert.equal(calls.length, 1); // app aberto: sem push
  svc.sos(b, {});
  assert.equal(calls.length, 2); // SOS sempre
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(svc.q.tokensOf.all(a.id).length, 0); // token inválido removido
});

test('FCM: assina JWT, pede token e envia mensagem', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const sa = { project_id: 'proj', client_email: 'x@proj.iam.gserviceaccount.com', private_key: privateKey };
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push([url, init]);
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'AT', expires_in: 3600 }) };
    return { ok: true, status: JSON.parse(init.body).message.token === 'bad' ? 404 : 200 };
  };
  const push = createPush({ env: { FCM_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(sa)).toString('base64') }, fetchImpl });
  assert.equal(push.configured, true);
  const invalid = await push.notify([{ token: 'ok' }, { token: 'bad' }], { title: 'T', body: 'B', urgent: true });
  assert.deepEqual(invalid, ['bad']);
  assert.equal(seen.filter(([u]) => u.includes('oauth2')).length, 1);
  const msg = JSON.parse(seen.find(([u]) => u.includes('messages:send'))[1].body).message;
  assert.equal(msg.android.priority, 'HIGH');
  assert.equal(createPush({ env: {} }).configured, false);
});

test('backup online gera cópia e mantém só as mais recentes', async () => {
  const db = openDb(':memory:');
  db.exec("INSERT INTO devices (id, code, secret_hash, name, created_at) VALUES ('x','AAAA-BBBB','h','n',1)");
  const dir = mkdtempSync(join(tmpdir(), 'perto-bk-'));
  const f = await runBackup(db, dir, 1);
  assert.ok(f.endsWith('.sqlite'));
  assert.equal(readdirSync(dir).length, 1);
  void raw;
});

test('código permanente extra: sem validade, nome próprio, revogar remove quem entrou por ele', () => {
  const { svc, reg } = setup();
  const a = reg('A');
  const b = reg('B');
  const c = reg('C');
  svc.updateProfile(b, { approval: true });
  const inv = svc.createInvite(b, null, 'Para a vó');
  assert.equal(inv.expiresAt, null);
  assert.equal(inv.label, 'Para a vó');
  assert.notEqual(inv.code, b.code);
  const p = svc.follow(a, inv.code);
  assert.equal(p.pending, false);
  assert.equal(p.expiresAt, null);
  svc.follow(c, b.code); // pelo código principal: pendente (aprovação ligada)
  assert.equal(svc.me(b).invites[0].expiresAt, null);
  assert.equal(svc.me(b).watchers.length, 1);
  svc.revokeInvite(b, inv.code);
  assert.equal(svc.me(a).following.length, 0);
  assert.throws(() => svc.follow(a, inv.code), /Nenhum aparelho/);
  assert.equal(svc.me(b).requests.length, 1); // o pedido do código principal continua
});

test('descoberta na mesma rede: opt-in, só mesma rede e sempre exige aprovação', () => {
  const { svc, reg, events, published } = setup();
  const a = reg('Junin');
  const b = reg('Maria');
  const x = reg('Estranho');
  assert.deepEqual(svc.discover(a, 'v4:1.2.3.4'), []); // ninguém mais visível
  const seenByA = svc.discover(b, 'v4:1.2.3.4'); // Maria fica visível
  assert.equal(seenByA.length, 1);
  assert.equal(seenByA[0].name, 'Junin');
  assert.ok(published.some(([id, m]) => id === a.id && m.t === 'nearby'));
  svc.discover(x, 'v4:9.9.9.9'); // outra rede
  const peers = svc.discover(a, 'v4:1.2.3.4');
  assert.deepEqual(peers.map((p) => p.name), ['Maria']);
  assert.equal(peers[0].ref.length > 6, true);
  assert.ok(!('code' in peers[0]) && !('id' in peers[0])); // nada de código/identificador exposto
  assert.throws(() => svc.requestViaDiscovery(a, 'v4:9.9.9.9', peers[0].ref), HttpError); // rede errada
  const person = svc.requestViaDiscovery(a, 'v4:1.2.3.4', peers[0].ref);
  assert.equal(person.pending, true); // aprovação obrigatória mesmo com approval=false
  assert.equal(person.pos, null);
  assert.match(events(b.id).at(-1).text, /mesmo Wi.Fi/);
  assert.equal(svc.discover(a, 'v4:1.2.3.4')[0].requested, true);
  svc.answerRequest(b, a.id, true);
  assert.equal(svc.me(a).following[0].pending, false);
  svc.stopDiscovering(b);
  assert.deepEqual(svc.discover(x, 'v4:1.2.3.4', false), []);
});

test('networkKey agrupa IPv4 e usa o prefixo /64 no IPv6', () => {
  assert.equal(networkKey('::ffff:200.1.2.3'), 'v4:200.1.2.3');
  assert.equal(networkKey('2804:14d:5c81:1::10'), networkKey('2804:14d:5c81:1:aaaa:bbbb:cccc:dddd'));
  assert.notEqual(networkKey('2804:14d:5c81:1::10'), networkKey('2804:14d:5c81:2::10'));
  assert.equal(networkKey(''), null);
});
