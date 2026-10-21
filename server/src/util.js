import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Sem 0/O/1/I/L para evitar confusão ao digitar o código.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normaliza o que o usuário digitou: "k7m4 qx2p" -> "K7M4-QX2P". */
export function normalizeCode(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8) return null;
  for (const c of s) if (!ALPHABET.includes(c)) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const newId = () => randomBytes(9).toString('base64url');
export const newSecret = () => randomBytes(24).toString('base64url');
export const hash = (s) => createHash('sha256').update(s).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const cleanText = (v, max, fallback = '') =>
  typeof v === 'string' && v.trim() ? [...v.trim()].slice(0, max).join('') : fallback;
export const cleanColor = (v, fallback = '#6366f1') => (/^#[0-9a-fA-F]{6}$/.test(v ?? '') ? v : fallback);

/** Limitador simples por chave (token bucket em janela fixa). */
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { start: now, n: 1 });
      return true;
    }
    h.n++;
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    return h.n <= max;
  };
}
