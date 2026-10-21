import { distance, validLat, validLng } from './geo.js';
import { clamp, cleanColor, cleanText, hash, newCode, newId, newSecret, normalizeCode, safeEqual } from './util.js';

const ONLINE_MS = 3 * 60 * 1000;
const HISTORY_MS = 72 * 3600 * 1000;
const MIN_STORE_GAP_MS = 8000;
const MIN_STORE_MOVE_M = 8;
const MAX_FOLLOWING = 30;
const MAX_PLACES = 20;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Regras de negócio. Totalmente independente de HTTP/WS: o `hub` recebe
 * `publish(deviceId, message)` para empurrar eventos em tempo real.
 */
export class Service {
  constructor(db, hub = { publish() {}, isOnline: () => false }) {
    this.db = db;
    this.hub = hub;
    this.q = {
      byId: db.prepare('SELECT * FROM devices WHERE id = ?'),
      byCode: db.prepare('SELECT * FROM devices WHERE code = ?'),
      insertDevice: db.prepare(
        'INSERT INTO devices (id, code, secret_hash, name, emoji, color, sharing, created_at, last_seen) VALUES (?,?,?,?,?,?,1,?,?)',
      ),
      touch: db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?'),
      follow: db.prepare('INSERT OR IGNORE INTO follows (follower_id, target_id, alias, created_at) VALUES (?,?,?,?)'),
      unfollow: db.prepare('DELETE FROM follows WHERE follower_id = ? AND target_id = ?'),
      following: db.prepare(
        `SELECT d.*, f.alias FROM follows f JOIN devices d ON d.id = f.target_id WHERE f.follower_id = ? ORDER BY f.created_at`,
      ),
      followers: db.prepare(
        `SELECT d.*, f.created_at AS since FROM follows f JOIN devices d ON d.id = f.follower_id WHERE f.target_id = ? ORDER BY f.created_at`,
      ),
      followerIds: db.prepare('SELECT follower_id FROM follows WHERE target_id = ?'),
      isFollowing: db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND target_id = ?'),
      setAlias: db.prepare('UPDATE follows SET alias = ? WHERE follower_id = ? AND target_id = ?'),
      lastPos: db.prepare('SELECT * FROM positions WHERE device_id = ? ORDER BY ts DESC LIMIT 1'),
      insertPos: db.prepare(
        'INSERT INTO positions (device_id, ts, lat, lng, acc, speed, heading, alt, battery, charging) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ),
      history: db.prepare(
        'SELECT ts, lat, lng, acc, speed FROM positions WHERE device_id = ? AND ts >= ? ORDER BY ts ASC LIMIT 5000',
      ),
      prune: db.prepare('DELETE FROM positions WHERE ts < ?'),
      pruneEvents: db.prepare('DELETE FROM events WHERE ts < ?'),
      places: db.prepare('SELECT * FROM places WHERE owner_id = ? ORDER BY name'),
      countPlaces: db.prepare('SELECT COUNT(*) AS n FROM places WHERE owner_id = ?'),
      insertPlace: db.prepare('INSERT INTO places (id, owner_id, name, emoji, lat, lng, radius) VALUES (?,?,?,?,?,?,?)'),
      deletePlace: db.prepare('DELETE FROM places WHERE id = ? AND owner_id = ?'),
      insertEvent: db.prepare(
        'INSERT INTO events (recipient_id, subject_id, type, text, lat, lng, ts) VALUES (?,?,?,?,?,?,?)',
      ),
      events: db.prepare(
        `SELECT e.id, e.type, e.text, e.lat, e.lng, e.ts, d.code AS code, d.name AS name, d.emoji AS emoji, d.color AS color
         FROM events e JOIN devices d ON d.id = e.subject_id WHERE e.recipient_id = ? ORDER BY e.ts DESC LIMIT ?`,
      ),
      update: db.prepare('UPDATE devices SET name = ?, emoji = ?, color = ?, sharing = ? WHERE id = ?'),
      setCode: db.prepare('UPDATE devices SET code = ? WHERE id = ?'),
      deleteFollowsOfTarget: db.prepare('DELETE FROM follows WHERE target_id = ?'),
      deleteDevice: db.prepare('DELETE FROM devices WHERE id = ?'),
    };
    /** Estado "dentro do lugar" para detectar chegada/saída: `${placeId}:${subjectId}` -> boolean */
    this.inside = new Map();
    /** Última posição em memória (inclui as não gravadas por throttle). */
    this.latest = new Map();
  }

  lastPosOf(id) {
    return this.latest.get(id) ?? this.q.lastPos.get(id);
  }

  // ── Registro e autenticação ────────────────────────────────────────────
  register({ name, emoji, color } = {}) {
    const secret = newSecret();
    const id = newId();
    const now = Date.now();
    let code;
    for (let i = 0; i < 10; i++) {
      code = newCode();
      if (!this.q.byCode.get(code)) break;
    }
    this.q.insertDevice.run(
      id, code, hash(secret), cleanText(name, 24, 'Eu'), cleanText(emoji, 4, '🙂'), cleanColor(color), now, now,
    );
    return { id, code, secret };
  }

  authenticate(id, secret) {
    if (typeof id !== 'string' || typeof secret !== 'string') return null;
    const d = this.q.byId.get(id);
    if (!d || !safeEqual(d.secret_hash, hash(secret))) return null;
    return d;
  }

  // ── Perfil ──────────────────────────────────────────────────────────────
  me(d) {
    const fresh = this.q.byId.get(d.id);
    return {
      id: fresh.id,
      code: fresh.code,
      name: fresh.name,
      emoji: fresh.emoji,
      color: fresh.color,
      sharing: !!fresh.sharing,
      following: this.q.following.all(d.id).map((t) => this.person(t, t.alias)),
      watchers: this.q.followers.all(d.id).map((f) => ({
        id: f.id, name: f.name, emoji: f.emoji, color: f.color, since: f.since,
      })),
      places: this.q.places.all(d.id).map(placeOut),
    };
  }

  updateProfile(d, body = {}) {
    const cur = this.q.byId.get(d.id);
    const next = {
      name: cleanText(body.name, 24, cur.name),
      emoji: cleanText(body.emoji, 4, cur.emoji),
      color: cleanColor(body.color, cur.color),
      sharing: typeof body.sharing === 'boolean' ? +body.sharing : cur.sharing,
    };
    this.q.update.run(next.name, next.emoji, next.color, next.sharing, d.id);
    this.broadcastPerson(d.id);
    return this.me(d);
  }

  /** Gera novo código e remove todos que acompanhavam: revoga acessos antigos. */
  rotateCode(d) {
    let code;
    do code = newCode(); while (this.q.byCode.get(code));
    const watchers = this.q.followerIds.all(d.id).map((r) => r.follower_id);
    this.q.deleteFollowsOfTarget.run(d.id);
    this.q.setCode.run(code, d.id);
    for (const w of watchers) this.hub.publish(w, { t: 'refresh' });
    return this.me(d);
  }

  deleteAccount(d) {
    const watchers = this.q.followerIds.all(d.id).map((r) => r.follower_id);
    this.q.deleteDevice.run(d.id);
    for (const w of watchers) this.hub.publish(w, { t: 'refresh' });
  }

  // ── Pareamento ──────────────────────────────────────────────────────────
  follow(d, rawCode, alias) {
    const code = normalizeCode(rawCode);
    if (!code) throw new HttpError(400, 'Código inválido. Ele tem 8 letras/números, ex.: K7M4-QX2P.');
    const target = this.q.byCode.get(code);
    if (!target) throw new HttpError(404, 'Nenhum aparelho encontrado com esse código.');
    if (target.id === d.id) throw new HttpError(400, 'Esse é o seu próprio código 😉');
    if (this.q.following.all(d.id).length >= MAX_FOLLOWING) throw new HttpError(400, 'Limite de pessoas atingido.');
    this.q.follow.run(d.id, target.id, cleanText(alias, 24, '') || null, Date.now());
    this.hub.publish(target.id, { t: 'watchers' });
    return this.person(this.q.byId.get(target.id), alias);
  }

  unfollow(d, code) {
    const target = this.q.byCode.get(normalizeCode(code) ?? '');
    if (!target) throw new HttpError(404, 'Pessoa não encontrada.');
    this.q.unfollow.run(d.id, target.id);
    this.hub.publish(target.id, { t: 'watchers' });
  }

  setAlias(d, code, alias) {
    const target = this.q.byCode.get(normalizeCode(code) ?? '');
    if (!target || !this.q.isFollowing.get(d.id, target.id)) throw new HttpError(404, 'Pessoa não encontrada.');
    this.q.setAlias.run(cleanText(alias, 24, '') || null, d.id, target.id);
  }

  /** Quem me acompanha pode ser removido (a pessoa deixa de me ver). */
  removeWatcher(d, watcherId) {
    this.q.unfollow.run(String(watcherId), d.id);
    this.hub.publish(String(watcherId), { t: 'refresh' });
  }

  // ── Localização ─────────────────────────────────────────────────────────
  person(t, alias) {
    const pos = t.sharing ? this.lastPosOf(t.id) : null;
    const lastTs = pos?.ts ?? 0;
    return {
      code: t.code,
      name: alias || t.name,
      realName: t.name,
      emoji: t.emoji,
      color: t.color,
      sharing: !!t.sharing,
      online: this.hub.isOnline(t.id) || Date.now() - Math.max(t.last_seen, 0) < ONLINE_MS,
      lastSeen: t.last_seen,
      pos: pos ? posOut(pos) : null,
      moving: !!pos && Date.now() - lastTs < ONLINE_MS && (pos.speed ?? 0) > 1.2,
    };
  }

  broadcastPerson(targetId) {
    const t = this.q.byId.get(targetId);
    if (!t) return;
    for (const { follower_id } of this.q.followerIds.all(targetId)) {
      const f = this.q.following.all(follower_id).find((x) => x.id === targetId);
      this.hub.publish(follower_id, { t: 'person', person: this.person(t, f?.alias) });
    }
  }

  ingest(d, raw = {}) {
    if (!validLat(raw.lat) || !validLng(raw.lng)) throw new HttpError(400, 'Coordenadas inválidas.');
    const cur = this.q.byId.get(d.id);
    const now = Date.now();
    this.q.touch.run(now, d.id);
    if (!cur.sharing) return { stored: false };
    const ts = Number.isFinite(raw.ts) && Math.abs(raw.ts - now) < 6 * 3600e3 ? raw.ts : now;
    const num = (v, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : null);
    const p = {
      ts, lat: raw.lat, lng: raw.lng,
      acc: num(raw.acc, 0, 100000),
      speed: num(raw.speed, 0, 400),
      heading: num(raw.heading, 0, 360),
      alt: num(raw.alt, -1000, 100000),
      battery: num(raw.battery, 0, 1),
      charging: raw.charging ? 1 : 0,
    };
    const last = this.lastPosOf(d.id);
    const worth =
      !last || ts - last.ts >= MIN_STORE_GAP_MS * 6 ||
      (ts - last.ts >= MIN_STORE_GAP_MS && distance(last, p) >= MIN_STORE_MOVE_M);
    if (!worth && last && ts <= last.ts) return { stored: false };
    this.latest.set(d.id, p);
    if (worth) {
      this.q.insertPos.run(d.id, p.ts, p.lat, p.lng, p.acc, p.speed, p.heading, p.alt, p.battery, p.charging);
    }
    const message = { t: 'pos', code: cur.code, pos: posOut(p), online: true };
    for (const { follower_id } of this.q.followerIds.all(d.id)) this.hub.publish(follower_id, message);
    this.detectPlaces(cur, p);
    return { stored: worth };
  }

  history(d, code, hours = 6) {
    const target = this.q.byCode.get(normalizeCode(code) ?? '');
    if (!target || (target.id !== d.id && !this.q.isFollowing.get(d.id, target.id)))
      throw new HttpError(404, 'Pessoa não encontrada.');
    if (!target.sharing) return [];
    const since = Date.now() - clamp(Number(hours) || 6, 0.1, 72) * 3600e3;
    return this.q.history.all(target.id, since).map((r) => ({ ts: r.ts, lat: r.lat, lng: r.lng, speed: r.speed }));
  }

  // ── Lugares e eventos ───────────────────────────────────────────────────
  addPlace(d, body = {}) {
    if (!validLat(body.lat) || !validLng(body.lng)) throw new HttpError(400, 'Coordenadas inválidas.');
    if (this.q.countPlaces.get(d.id).n >= MAX_PLACES) throw new HttpError(400, 'Limite de lugares atingido.');
    const place = {
      id: newId(), name: cleanText(body.name, 24, 'Lugar'), emoji: cleanText(body.emoji, 4, '📍'),
      lat: body.lat, lng: body.lng, radius: clamp(Number(body.radius) || 150, 50, 2000),
    };
    this.q.insertPlace.run(place.id, d.id, place.name, place.emoji, place.lat, place.lng, place.radius);
    return placeOut(place);
  }

  removePlace(d, id) {
    this.q.deletePlace.run(String(id), d.id);
    for (const k of this.inside.keys()) if (k.startsWith(`${id}:`)) this.inside.delete(k);
  }

  events(d, limit = 40) {
    return this.q.events.all(d.id, clamp(Number(limit) || 40, 1, 200)).map((e) => ({
      id: e.id, type: e.type, text: e.text, lat: e.lat, lng: e.lng, ts: e.ts,
      who: { code: e.code, name: e.name, emoji: e.emoji, color: e.color },
    }));
  }

  pushEvent(recipientId, subject, type, text, pos) {
    const ts = Date.now();
    this.q.insertEvent.run(recipientId, subject.id, type, text, pos?.lat ?? null, pos?.lng ?? null, ts);
    this.hub.publish(recipientId, {
      t: 'event',
      event: {
        type, text, ts, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
        who: { code: subject.code, name: subject.name, emoji: subject.emoji, color: subject.color },
      },
    });
  }

  sos(d, body = {}) {
    const cur = this.q.byId.get(d.id);
    const pos = validLat(body.lat) && validLng(body.lng) ? body : this.lastPosOf(d.id);
    for (const { follower_id } of this.q.followerIds.all(d.id)) {
      this.pushEvent(follower_id, cur, 'sos', `${cur.name} precisa de ajuda! 🚨`, pos);
    }
    return { notified: this.q.followerIds.all(d.id).length };
  }

  checkin(d, body = {}) {
    const cur = this.q.byId.get(d.id);
    const pos = validLat(body.lat) && validLng(body.lng) ? body : this.lastPosOf(d.id);
    const msg = cleanText(body.message, 60, 'Estou bem ✅');
    for (const { follower_id } of this.q.followerIds.all(d.id)) {
      this.pushEvent(follower_id, cur, 'checkin', `${cur.name}: ${msg}`, pos);
    }
  }

  /** Cada seguidor tem os seus lugares; avisa quando quem ele segue entra/sai deles. */
  detectPlaces(subject, p) {
    for (const { follower_id } of this.q.followerIds.all(subject.id)) {
      for (const place of this.q.places.all(follower_id)) {
        const key = `${place.id}:${subject.id}`;
        const now = distance(place, p) <= place.radius + Math.min(p.acc ?? 0, 50);
        const was = this.inside.get(key);
        this.inside.set(key, now);
        if (was === undefined || was === now) continue;
        this.pushEvent(
          follower_id, subject, now ? 'arrive' : 'leave',
          `${subject.name} ${now ? 'chegou em' : 'saiu de'} ${place.emoji} ${place.name}`, p,
        );
      }
    }
  }

  maintenance() {
    this.q.prune.run(Date.now() - HISTORY_MS);
    this.q.pruneEvents.run(Date.now() - 14 * 24 * 3600e3);
  }
}

const posOut = (r) => ({
  lat: r.lat, lng: r.lng, acc: r.acc, speed: r.speed, heading: r.heading, alt: r.alt,
  battery: r.battery, charging: !!r.charging, ts: r.ts,
});
const placeOut = (p) => ({ id: p.id, name: p.name, emoji: p.emoji, lat: p.lat, lng: p.lng, radius: p.radius });
