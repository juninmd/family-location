import { distance, validLat, validLng } from './geo.js';
import { clamp, cleanColor, cleanText, hash, newCode, newId, newSecret, normalizeCode, safeEqual } from './util.js';
import { randomBytes } from 'node:crypto';

const ONLINE_MS = 150 * 1000;
const HISTORY_MS = 72 * 3600 * 1000;
const MIN_STORE_GAP_MS = 8000;
const MIN_STORE_MOVE_M = 8;
const MAX_FOLLOWING = 30;
const MAX_PLACES = 20;
const MAX_BATCH = 500;
const SPEED_COOLDOWN_MS = 10 * 60 * 1000;
const LOW_BATTERY = 0.2;
const LOW_BATTERY_RESET = 0.3;
const GROUPS_MAX = 20;
/** Convite sem validade (código permanente extra). */
export const PERMANENT_TS = 32503680000000; // ano 3000
const DISCOVER_TTL_MS = 3 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const noPush = { configured: false, notify: async () => {} };

/**
 * Regras de negócio. Totalmente independente de HTTP/WS: o `hub` recebe
 * `publish(deviceId, message)` para empurrar eventos em tempo real e o `push`
 * (opcional) entrega notificações com o app fechado.
 */
export class Service {
  constructor(db, hub = { publish() {}, isOnline: () => false }, push = noPush) {
    this.db = db;
    this.hub = hub;
    this.push = push;
    const ACTIVE = `f.status = 'active' AND (f.expires_at IS NULL OR f.expires_at > ?)`;
    this.q = {
      byId: db.prepare('SELECT * FROM devices WHERE id = ?'),
      byCode: db.prepare('SELECT * FROM devices WHERE code = ?'),
      inviteByCode: db.prepare('SELECT * FROM invites WHERE code = ? AND expires_at > ?'),
      insertInvite: db.prepare('INSERT INTO invites (code, owner_id, expires_at, label) VALUES (?,?,?,?)'),
      invitesOf: db.prepare('SELECT code, expires_at, label FROM invites WHERE owner_id = ? AND expires_at > ? ORDER BY expires_at'),
      followersVia: db.prepare('SELECT follower_id FROM follows WHERE target_id = ? AND via = ?'),
      deleteFollowsVia: db.prepare('DELETE FROM follows WHERE target_id = ? AND via = ?'),
      deleteInvite: db.prepare('DELETE FROM invites WHERE code = ? AND owner_id = ?'),
      deleteInvitesOf: db.prepare('DELETE FROM invites WHERE owner_id = ?'),
      pruneInvites: db.prepare('DELETE FROM invites WHERE expires_at <= ?'),
      insertDevice: db.prepare(
        'INSERT INTO devices (id, code, secret_hash, name, emoji, color, sharing, created_at, last_seen) VALUES (?,?,?,?,?,?,1,?,?)',
      ),
      touch: db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?'),
      upsertFollow: db.prepare(
        `INSERT INTO follows (follower_id, target_id, alias, created_at, status, expires_at, via) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(follower_id, target_id) DO UPDATE SET
           status = CASE WHEN follows.status = 'active' AND (follows.expires_at IS NULL OR follows.expires_at > ?) AND excluded.status = 'pending'
                         THEN follows.status ELSE excluded.status END,
           expires_at = CASE WHEN follows.status = 'active' AND follows.expires_at IS NULL THEN NULL ELSE excluded.expires_at END,
           alias = COALESCE(excluded.alias, follows.alias),
           via = COALESCE(excluded.via, follows.via)`,
      ),
      unfollow: db.prepare('DELETE FROM follows WHERE follower_id = ? AND target_id = ?'),
      followRow: db.prepare('SELECT * FROM follows WHERE follower_id = ? AND target_id = ?'),
      following: db.prepare(
        `SELECT d.*, f.alias, f.status AS fstatus, f.expires_at AS fexpires, f.grp, f.speed_limit
         FROM follows f JOIN devices d ON d.id = f.target_id
         WHERE f.follower_id = ? AND (f.status = 'pending' OR (f.status = 'active' AND (f.expires_at IS NULL OR f.expires_at > ?)))
         ORDER BY f.created_at`,
      ),
      followers: db.prepare(
        `SELECT d.*, f.created_at AS since, f.expires_at AS fexpires FROM follows f JOIN devices d ON d.id = f.follower_id
         WHERE f.target_id = ? AND ${ACTIVE} ORDER BY f.created_at`,
      ),
      pendingRequests: db.prepare(
        `SELECT d.*, f.created_at AS since FROM follows f JOIN devices d ON d.id = f.follower_id
         WHERE f.target_id = ? AND f.status = 'pending' ORDER BY f.created_at`,
      ),
      followerRows: db.prepare(
        `SELECT f.follower_id, f.speed_limit FROM follows f WHERE f.target_id = ? AND ${ACTIVE}`,
      ),
      isFollowing: db.prepare(`SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.target_id = ? AND ${ACTIVE}`),
      setPending: db.prepare(`UPDATE follows SET status = ? WHERE follower_id = ? AND target_id = ? AND status = 'pending'`),
      setAlias: db.prepare('UPDATE follows SET alias = ? WHERE follower_id = ? AND target_id = ?'),
      setGroup: db.prepare('UPDATE follows SET grp = ? WHERE follower_id = ? AND target_id = ?'),
      setSpeed: db.prepare('UPDATE follows SET speed_limit = ? WHERE follower_id = ? AND target_id = ?'),
      pruneFollows: db.prepare(`DELETE FROM follows WHERE expires_at IS NOT NULL AND expires_at <= ?`),
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
      getInside: db.prepare('SELECT inside FROM place_state WHERE place_id = ? AND subject_id = ?'),
      setInside: db.prepare('INSERT OR REPLACE INTO place_state (place_id, subject_id, inside) VALUES (?,?,?)'),
      insertEvent: db.prepare(
        'INSERT INTO events (recipient_id, subject_id, type, text, lat, lng, ts) VALUES (?,?,?,?,?,?,?)',
      ),
      events: db.prepare(
        `SELECT e.id, e.type, e.text, e.lat, e.lng, e.ts, d.code AS code, d.name AS name, d.emoji AS emoji, d.color AS color
         FROM events e JOIN devices d ON d.id = e.subject_id WHERE e.recipient_id = ? ORDER BY e.ts DESC LIMIT ?`,
      ),
      update: db.prepare('UPDATE devices SET name = ?, emoji = ?, color = ?, sharing = ?, approval = ? WHERE id = ?'),
      setCode: db.prepare('UPDATE devices SET code = ? WHERE id = ?'),
      deleteFollowsOfTarget: db.prepare('DELETE FROM follows WHERE target_id = ?'),
      deleteDevice: db.prepare('DELETE FROM devices WHERE id = ?'),
      upsertToken: db.prepare('INSERT OR REPLACE INTO push_tokens (token, device_id, platform, created_at) VALUES (?,?,?,?)'),
      deleteToken: db.prepare('DELETE FROM push_tokens WHERE token = ?'),
      tokensOf: db.prepare('SELECT token, platform FROM push_tokens WHERE device_id = ?'),
    };
    /** Cache do estado "dentro do lugar" (persistido em place_state). */
    this.inside = new Map();
    /** Última posição em memória (inclui as não gravadas por throttle). */
    this.latest = new Map();
    this.lowBattery = new Set();
    this.speedCooldown = new Map();
    this.discoverable = new Map();
  }

  lastPosOf(id) {
    return this.latest.get(id) ?? this.q.lastPos.get(id);
  }

  // ── Registro e autenticação ────────────────────────────────────────────
  register({ name, emoji, color } = {}) {
    const secret = newSecret();
    const id = newId();
    const now = Date.now();
    const code = this.freshCode();
    this.q.insertDevice.run(
      id, code, hash(secret), cleanText(name, 24, 'Eu'), cleanText(emoji, 4, '🙂'), cleanColor(color), now, now,
    );
    return { id, code, secret };
  }

  freshCode() {
    let code;
    do code = newCode();
    while (this.q.byCode.get(code) || this.q.inviteByCode.get(code, 0));
    return code;
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
    const now = Date.now();
    return {
      id: fresh.id,
      code: fresh.code,
      name: fresh.name,
      emoji: fresh.emoji,
      color: fresh.color,
      sharing: !!fresh.sharing,
      approval: !!fresh.approval,
      following: this.q.following.all(d.id, now).map((t) => this.person(t, t)),
      watchers: this.q.followers.all(d.id, now).map((f) => ({
        id: f.id, name: f.name, emoji: f.emoji, color: f.color, since: f.since, expiresAt: f.fexpires ?? null,
      })),
      requests: this.q.pendingRequests.all(d.id).map((f) => ({
        id: f.id, name: f.name, emoji: f.emoji, color: f.color, since: f.since,
      })),
      invites: this.q.invitesOf.all(d.id, now).map((i) => ({
        code: i.code, label: i.label ?? null, expiresAt: i.expires_at >= PERMANENT_TS ? null : i.expires_at,
      })),
      places: this.q.places.all(d.id).map(placeOut),
      push: !!this.push.configured,
    };
  }

  updateProfile(d, body = {}) {
    const cur = this.q.byId.get(d.id);
    const next = {
      name: cleanText(body.name, 24, cur.name),
      emoji: cleanText(body.emoji, 4, cur.emoji),
      color: cleanColor(body.color, cur.color),
      sharing: typeof body.sharing === 'boolean' ? +body.sharing : cur.sharing,
      approval: typeof body.approval === 'boolean' ? +body.approval : cur.approval,
    };
    this.q.update.run(next.name, next.emoji, next.color, next.sharing, next.approval, d.id);
    this.broadcastPerson(d.id);
    return this.me(d);
  }

  /** Gera novo código e remove todos que acompanhavam (e convites): revoga acessos antigos. */
  rotateCode(d) {
    const code = this.freshCode();
    const watchers = this.followerIdsAll(d.id);
    this.q.deleteFollowsOfTarget.run(d.id);
    this.q.deleteInvitesOf.run(d.id);
    this.q.setCode.run(code, d.id);
    for (const w of watchers) this.hub.publish(w, { t: 'refresh' });
    return this.me(d);
  }

  deleteAccount(d) {
    const watchers = this.followerIdsAll(d.id);
    this.q.deleteDevice.run(d.id);
    this.latest.delete(d.id);
    this.lowBattery.delete(d.id);
    this.discoverable.delete(d.id);
    for (const w of watchers) this.hub.publish(w, { t: 'refresh' });
  }

  followerIdsAll(targetId) {
    return this.q.followers.all(targetId, Date.now()).map((r) => r.id);
  }

  // ── Pareamento ──────────────────────────────────────────────────────────
  follow(d, rawCode, alias) {
    const code = normalizeCode(rawCode);
    if (!code) throw new HttpError(400, 'Código inválido. Ele tem 8 letras/números, ex.: K7M4-QX2P.');
    const now = Date.now();
    let target = this.q.byCode.get(code);
    let expires = null;
    let viaInvite = false;
    let via = null;
    if (!target) {
      const inv = this.q.inviteByCode.get(code, now);
      if (inv) {
        target = this.q.byId.get(inv.owner_id);
        expires = inv.expires_at >= PERMANENT_TS ? null : inv.expires_at;
        viaInvite = true;
        via = code;
      }
    }
    if (!target) throw new HttpError(404, 'Nenhum aparelho encontrado com esse código.');
    if (target.id === d.id) throw new HttpError(400, 'Esse é o seu próprio código 😉');
    const existing = this.q.following.all(d.id, now);
    if (existing.length >= MAX_FOLLOWING && !existing.some((x) => x.id === target.id))
      throw new HttpError(400, 'Limite de pessoas atingido.');

    const needsApproval = !!target.approval && !viaInvite;
    this.q.upsertFollow.run(
      d.id, target.id, cleanText(alias, 24, '') || null, now, needsApproval ? 'pending' : 'active', expires, via, now,
    );
    const meta = this.q.following.all(d.id, now).find((x) => x.id === target.id);
    if (meta.fstatus === 'pending') {
      this.pushEvent(target.id, d, 'request', `${d.name} quer acompanhar você. Abra o Perfil para aprovar.`, null);
    }
    this.hub.publish(target.id, { t: 'watchers' });
    return this.person(this.q.byId.get(target.id), meta);
  }

  unfollow(d, code) {
    const target = this.resolveTarget(code);
    this.q.unfollow.run(d.id, target.id);
    this.hub.publish(target.id, { t: 'watchers' });
  }

  resolveTarget(code) {
    const target = this.q.byCode.get(normalizeCode(code) ?? '');
    if (!target) throw new HttpError(404, 'Pessoa não encontrada.');
    return target;
  }

  /** Atualiza apelido, grupo e/ou limite de velocidade de quem eu acompanho. */
  setFollowMeta(d, code, body = {}) {
    const target = this.resolveTarget(code);
    if (!this.q.followRow.get(d.id, target.id)) throw new HttpError(404, 'Pessoa não encontrada.');
    if ('alias' in body) this.q.setAlias.run(cleanText(body.alias, 24, '') || null, d.id, target.id);
    if ('group' in body) this.q.setGroup.run(cleanText(body.group, GROUPS_MAX, '') || null, d.id, target.id);
    if ('speedLimit' in body) {
      const v = Number(body.speedLimit);
      this.q.setSpeed.run(Number.isFinite(v) && v >= 20 && v <= 250 ? Math.round(v) : null, d.id, target.id);
    }
  }

  /** Quem me acompanha pode ser removido (a pessoa deixa de me ver). */
  removeWatcher(d, watcherId) {
    this.q.unfollow.run(String(watcherId), d.id);
    this.hub.publish(String(watcherId), { t: 'refresh' });
  }

  /** Aprova ou recusa um pedido para me acompanhar. */
  answerRequest(d, followerId, accept) {
    const row = this.q.followRow.get(String(followerId), d.id);
    if (!row || row.status !== 'pending') throw new HttpError(404, 'Pedido não encontrado.');
    if (accept) {
      this.q.setPending.run('active', row.follower_id, d.id);
      const cur = this.q.byId.get(d.id);
      this.pushEvent(row.follower_id, cur, 'approved', `${cur.name} aceitou seu pedido ✅`, null);
    } else {
      this.q.unfollow.run(row.follower_id, d.id);
    }
    this.hub.publish(row.follower_id, { t: 'refresh' });
    this.hub.publish(d.id, { t: 'watchers' });
  }

  /**
   * Código extra: temporário (`hours`) ou permanente (`hours` nulo/0). Quem usa um código temporário
   * enxerga você só até ele expirar; o permanente vale até ser revogado (e a revogação também
   * remove quem entrou por ele).
   */
  createInvite(d, hours, label) {
    const permanent = hours == null || Number(hours) === 0;
    const h = clamp(Number(hours) || 1, 0.25, 72);
    const code = this.freshCode();
    const expiresAt = permanent ? PERMANENT_TS : Date.now() + h * 3600e3;
    const lbl = cleanText(label, 24, '') || null;
    this.q.insertInvite.run(code, d.id, expiresAt, lbl);
    return { code, label: lbl, expiresAt: permanent ? null : expiresAt };
  }

  revokeInvite(d, code) {
    const c = normalizeCode(code);
    if (!c) return;
    for (const { follower_id } of this.q.followersVia.all(d.id, c)) this.hub.publish(follower_id, { t: 'refresh' });
    this.q.deleteFollowsVia.run(d.id, c);
    this.q.deleteInvite.run(c, d.id);
    this.hub.publish(d.id, { t: 'watchers' });
  }

  // ── Descoberta na mesma rede (opt-in; sempre exige aprovação de quem é encontrado) ──
  /** Marca o aparelho como visível na rede `key` por alguns minutos e devolve quem mais está visível. */
  discover(d, key, visible = true) {
    if (!key) return [];
    const now = Date.now();
    for (const [id, p] of this.discoverable) if (p.until <= now) this.discoverable.delete(id);
    // Só enxerga quem também está visível (opt-in dos dois lados).
    if (!visible && this.discoverable.get(d.id)?.key !== key) return [];
    if (visible) {
      const cur = this.discoverable.get(d.id);
      const fresh = !cur || cur.key !== key;
      this.discoverable.set(d.id, { key, until: now + DISCOVER_TTL_MS, ref: cur?.ref ?? randomBytes(8).toString('base64url') });
      if (fresh) for (const [id, p] of this.discoverable) if (id !== d.id && p.key === key) this.hub.publish(id, { t: 'nearby' });
    }
    const followed = new Set(this.q.following.all(d.id, now).map((x) => x.id));
    const pending = new Set(this.q.following.all(d.id, now).filter((x) => x.fstatus === 'pending').map((x) => x.id));
    const out = [];
    for (const [id, p] of this.discoverable) {
      if (id === d.id || p.key !== key) continue;
      if (followed.has(id) && !pending.has(id)) continue;
      const t = this.q.byId.get(id);
      if (t) out.push({ ref: p.ref, name: t.name, emoji: t.emoji, color: t.color, requested: pending.has(id) });
    }
    return out.slice(0, 10);
  }

  stopDiscovering(d) {
    const cur = this.discoverable.get(d.id);
    this.discoverable.delete(d.id);
    if (cur) for (const [id, p] of this.discoverable) if (p.key === cur.key) this.hub.publish(id, { t: 'nearby' });
  }

  /** Pede para acompanhar alguém encontrado na mesma rede. O alvo sempre precisa aprovar. */
  requestViaDiscovery(d, key, ref) {
    const now = Date.now();
    const entry = [...this.discoverable.entries()].find(([, p]) => p.ref === ref && p.key === key && p.until > now);
    if (!entry || entry[0] === d.id) throw new HttpError(404, 'Essa pessoa não está mais visível na rede.');
    const target = this.q.byId.get(entry[0]);
    if (!target) throw new HttpError(404, 'Pessoa não encontrada.');
    const existing = this.q.followRow.get(d.id, target.id);
    if (existing?.status === 'active' && (!existing.expires_at || existing.expires_at > now)) return this.person(target, this.q.following.all(d.id, now).find((x) => x.id === target.id));
    this.q.upsertFollow.run(d.id, target.id, null, now, 'pending', null, null, now);
    this.pushEvent(target.id, d, 'request', `${d.name} (no mesmo Wi‑Fi) quer acompanhar você. Abra o Perfil para aprovar.`, null);
    this.hub.publish(target.id, { t: 'watchers' });
    const meta = this.q.following.all(d.id, now).find((x) => x.id === target.id);
    return this.person(target, meta);
  }

  // ── Localização ─────────────────────────────────────────────────────────
  person(t, meta = {}) {
    const pending = meta.fstatus === 'pending';
    const pos = t.sharing && !pending ? this.lastPosOf(t.id) : null;
    const lastTs = pos?.ts ?? 0;
    return {
      code: t.code,
      name: meta.alias || t.name,
      realName: t.name,
      emoji: t.emoji,
      color: t.color,
      sharing: !!t.sharing,
      pending,
      group: meta.grp ?? null,
      speedLimit: meta.speed_limit ?? null,
      expiresAt: meta.fexpires ?? null,
      online: !pending && (this.hub.isOnline(t.id) || Date.now() - Math.max(t.last_seen, 0) < ONLINE_MS),
      lastSeen: t.last_seen,
      pos: pos ? posOut(pos) : null,
      moving: !!pos && Date.now() - lastTs < ONLINE_MS && (pos.speed ?? 0) > 1.2,
    };
  }

  broadcastPerson(targetId) {
    const t = this.q.byId.get(targetId);
    if (!t) return;
    const now = Date.now();
    for (const { follower_id } of this.q.followerRows.all(targetId, now)) {
      const meta = this.q.following.all(follower_id, now).find((x) => x.id === targetId);
      this.hub.publish(follower_id, { t: 'person', person: this.person(t, meta) });
    }
  }

  buildPoint(raw, now) {
    const ts = Number.isFinite(raw.ts) && raw.ts > now - 48 * 3600e3 && raw.ts < now + 5 * 60e3 ? raw.ts : now;
    const num = (v, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : null);
    return {
      ts, lat: raw.lat, lng: raw.lng,
      acc: num(raw.acc, 0, 100000),
      speed: num(raw.speed, 0, 400),
      heading: num(raw.heading, 0, 360),
      alt: num(raw.alt, -1000, 100000),
      battery: num(raw.battery, 0, 1),
      charging: raw.charging ? 1 : 0,
    };
  }

  ingest(d, raw = {}) {
    if (!validLat(raw.lat) || !validLng(raw.lng)) throw new HttpError(400, 'Coordenadas inválidas.');
    const cur = this.q.byId.get(d.id);
    if (!cur) throw new HttpError(401, 'Aparelho não autenticado.');
    const now = Date.now();
    this.q.touch.run(now, d.id);
    if (!cur.sharing) return { stored: false };
    const p = this.buildPoint(raw, now);
    const last = this.lastPosOf(d.id);
    const worth =
      !last || p.ts - last.ts >= MIN_STORE_GAP_MS * 6 ||
      (p.ts - last.ts >= MIN_STORE_GAP_MS && distance(last, p) >= MIN_STORE_MOVE_M);
    if (!worth && last && p.ts <= last.ts) return { stored: false };
    this.latest.set(d.id, p);
    if (worth) {
      this.q.insertPos.run(d.id, p.ts, p.lat, p.lng, p.acc, p.speed, p.heading, p.alt, p.battery, p.charging);
    }
    const message = { t: 'pos', code: cur.code, pos: posOut(p), online: true };
    const rows = this.q.followerRows.all(d.id, now);
    for (const { follower_id } of rows) this.hub.publish(follower_id, message);
    this.detectPlaces(cur, p, rows);
    this.detectBattery(cur, p, rows);
    this.detectSpeed(cur, p, rows);
    return { stored: worth };
  }

  /** Pontos acumulados offline: grava o histórico em ordem e trata o mais recente como "ao vivo". */
  ingestBatch(d, points) {
    if (!Array.isArray(points) || !points.length) throw new HttpError(400, 'Lista de pontos vazia.');
    const cur = this.q.byId.get(d.id);
    if (!cur) throw new HttpError(401, 'Aparelho não autenticado.');
    const now = Date.now();
    const valid = points
      .slice(-MAX_BATCH)
      .filter((p) => p && validLat(p.lat) && validLng(p.lng))
      .map((p) => this.buildPoint(p, now))
      .sort((a, b) => a.ts - b.ts);
    if (!valid.length) throw new HttpError(400, 'Nenhum ponto válido.');
    if (!cur.sharing) return { stored: 0 };
    const latest = valid.pop();
    let stored = 0;
    let prev = null;
    this.db.exec('BEGIN');
    try {
      for (const p of valid) {
        if (prev && p.ts - prev.ts < 15_000 && distance(prev, p) < 10) continue;
        this.q.insertPos.run(d.id, p.ts, p.lat, p.lng, p.acc, p.speed, p.heading, p.alt, p.battery, p.charging);
        prev = p;
        stored++;
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    const live = this.ingest(d, latest);
    return { stored: stored + (live.stored ? 1 : 0) };
  }

  history(d, code, hours = 6) {
    const target = this.accessibleTarget(d, code);
    if (!target.sharing) return [];
    const since = Date.now() - clamp(Number(hours) || 6, 0.1, 72) * 3600e3;
    return this.q.history.all(target.id, since).map((r) => ({ ts: r.ts, lat: r.lat, lng: r.lng, speed: r.speed }));
  }

  accessibleTarget(d, code) {
    const target = this.q.byCode.get(normalizeCode(code) ?? '');
    if (!target || (target.id !== d.id && !this.q.isFollowing.get(d.id, target.id, Date.now())))
      throw new HttpError(404, 'Pessoa não encontrada.');
    return target;
  }

  /** Resumo de deslocamento: distância, velocidade máxima, tempo em movimento e paradas. */
  report(d, code, hours = 24) {
    const target = this.accessibleTarget(d, code);
    const h = clamp(Number(hours) || 24, 1, 72);
    const empty = { hours: h, points: 0, distanceKm: 0, maxKmh: 0, avgKmh: 0, movingMin: 0, stops: 0, longestStopMin: 0 };
    if (!target.sharing) return empty;
    const pts = this.q.history.all(target.id, Date.now() - h * 3600e3);
    if (pts.length < 2) return { ...empty, points: pts.length };
    let dist = 0;
    let moving = 0;
    let maxMs = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dt = (b.ts - a.ts) / 1000;
      const dm = distance(a, b);
      maxMs = Math.max(maxMs, Math.min(b.speed ?? 0, 70));
      if (dt <= 0 || dt > 600) continue; // lacuna de sinal: não conta como deslocamento
      if (dm / dt > 70) continue; // salto impossível de GPS (>250 km/h)
      if (dm > 15 && dm / dt > 0.8) {
        dist += dm;
        moving += dt;
      }
    }
    // paradas: ≥5 min dentro de 60 m
    let stops = 0;
    let longest = 0;
    let anchor = pts[0];
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i];
      if (p && distance(anchor, p) < 60) continue;
      const end = pts[i - 1];
      const mins = (end.ts - anchor.ts) / 60000;
      if (mins >= 5) {
        stops++;
        longest = Math.max(longest, mins);
      }
      anchor = p;
    }
    return {
      hours: h,
      points: pts.length,
      distanceKm: Math.round(dist / 100) / 10,
      maxKmh: Math.round(maxMs * 3.6),
      avgKmh: moving > 0 ? Math.round((dist / moving) * 3.6) : 0,
      movingMin: Math.round(moving / 60),
      stops,
      longestStopMin: Math.round(longest),
    };
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
    // Push só quando o app não está aberto (exceto SOS, que sempre toca).
    if (this.push.configured && (type === 'sos' || !this.hub.isOnline(recipientId))) {
      const tokens = this.q.tokensOf.all(recipientId);
      if (tokens.length) {
        this.push
          .notify(tokens, {
            title: type === 'sos' ? '🚨 SOS — Perto' : 'Perto',
            body: text,
            data: { type, lat: pos?.lat != null ? String(pos.lat) : '', lng: pos?.lng != null ? String(pos.lng) : '' },
            urgent: type === 'sos',
          })
          .then((invalid) => (invalid ?? []).forEach((t) => this.q.deleteToken.run(t)))
          .catch((e) => console.error('push:', e.message));
      }
    }
  }

  registerPush(d, { token, platform } = {}) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new HttpError(400, 'Token inválido.');
    this.q.upsertToken.run(token, d.id, cleanText(platform, 12, 'android'), Date.now());
  }

  unregisterPush(token) {
    if (typeof token === 'string') this.q.deleteToken.run(token);
  }

  sos(d, body = {}) {
    const cur = this.q.byId.get(d.id);
    const pos = validLat(body.lat) && validLng(body.lng) ? body : this.lastPosOf(d.id);
    const ids = this.followerIdsAll(d.id);
    for (const id of ids) this.pushEvent(id, cur, 'sos', `${cur.name} precisa de ajuda! 🚨`, pos);
    return { notified: ids.length };
  }

  /** Mensagem rápida ("Cheguei", "Estou bem"…) para todos que me acompanham. */
  checkin(d, body = {}) {
    const cur = this.q.byId.get(d.id);
    const pos = validLat(body.lat) && validLng(body.lng) ? body : this.lastPosOf(d.id);
    const msg = cleanText(body.message, 60, 'Estou bem ✅');
    const ids = this.followerIdsAll(d.id);
    for (const id of ids) this.pushEvent(id, cur, 'checkin', `${cur.name}: ${msg}`, pos);
    return { notified: ids.length };
  }

  insideOf(placeId, subjectId) {
    const key = `${placeId}:${subjectId}`;
    if (this.inside.has(key)) return this.inside.get(key);
    const row = this.q.getInside.get(placeId, subjectId);
    const v = row ? !!row.inside : undefined;
    if (v !== undefined) this.inside.set(key, v);
    return v;
  }

  /** Cada seguidor tem os seus lugares; avisa quando quem ele segue entra/sai deles. */
  detectPlaces(subject, p, rows) {
    for (const { follower_id } of rows) {
      for (const place of this.q.places.all(follower_id)) {
        const key = `${place.id}:${subject.id}`;
        const now = distance(place, p) <= place.radius + Math.min(p.acc ?? 0, 50);
        const was = this.insideOf(place.id, subject.id);
        if (was === now) continue;
        this.inside.set(key, now);
        this.q.setInside.run(place.id, subject.id, +now);
        if (was === undefined) continue; // primeira leitura: só registra o estado
        this.pushEvent(
          follower_id, subject, now ? 'arrive' : 'leave',
          `${subject.name} ${now ? 'chegou em' : 'saiu de'} ${place.emoji} ${place.name}`, p,
        );
      }
    }
  }

  detectBattery(subject, p, rows) {
    if (p.battery == null) return;
    if (p.charging || p.battery >= LOW_BATTERY_RESET) return void this.lowBattery.delete(subject.id);
    if (p.battery > LOW_BATTERY || this.lowBattery.has(subject.id)) return;
    this.lowBattery.add(subject.id);
    for (const { follower_id } of rows) {
      this.pushEvent(follower_id, subject, 'lowbat', `${subject.name} está com a bateria baixa (${Math.round(p.battery * 100)}%) 🔋`, p);
    }
  }

  detectSpeed(subject, p, rows) {
    if (p.speed == null) return;
    const kmh = p.speed * 3.6;
    const now = Date.now();
    for (const { follower_id, speed_limit } of rows) {
      if (!speed_limit || kmh <= speed_limit) continue;
      const key = `${follower_id}:${subject.id}`;
      if (now - (this.speedCooldown.get(key) ?? 0) < SPEED_COOLDOWN_MS) continue;
      this.speedCooldown.set(key, now);
      this.pushEvent(follower_id, subject, 'speed', `${subject.name} está a ${Math.round(kmh)} km/h (limite ${speed_limit}) 🚗`, p);
    }
  }

  maintenance() {
    const now = Date.now();
    this.q.prune.run(now - HISTORY_MS);
    this.q.pruneEvents.run(now - 14 * 24 * 3600e3);
    this.q.pruneInvites.run(now);
    this.q.pruneFollows.run(now);
    for (const [k, t] of this.speedCooldown) if (now - t > SPEED_COOLDOWN_MS) this.speedCooldown.delete(k);
  }
}

const posOut = (r) => ({
  lat: r.lat, lng: r.lng, acc: r.acc, speed: r.speed, heading: r.heading, alt: r.alt,
  battery: r.battery, charging: !!r.charging, ts: r.ts,
});
const placeOut = (p) => ({ id: p.id, name: p.name, emoji: p.emoji, lat: p.lat, lng: p.lng, radius: p.radius });
