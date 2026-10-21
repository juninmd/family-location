import type { Person, Pos } from './types';

export const kmh = (ms: number | null) => (ms == null ? null : ms * 3.6);

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 15) return 'agora';
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `há ${Math.floor(h / 24)} d`;
}

export const clock = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function statusOf(p: Person, now = Date.now()): { label: string; short?: string; tone: 'live' | 'move' | 'idle' | 'off' | 'paused' } {
  if (!p.sharing) return { label: 'Compartilhamento pausado', tone: 'paused' };
  if (!p.pos) return { label: 'Aguardando localização…', tone: 'off' };
  const fresh = now - p.pos.ts < 3 * 60_000;
  if (!fresh) return { label: `Visto ${ago(p.pos.ts, now)}`, tone: 'off' };
  const v = kmh(p.pos.speed) ?? 0;
  if (v >= 4) return { label: `Em movimento · ${Math.round(v)} km/h`, short: `${Math.round(v)} km/h · movendo`, tone: 'move' };
  return { label: 'Parado · ao vivo', tone: 'live' };
}

export const batteryPct = (b: number | null) => (b == null ? null : Math.round(b * 100));

export function coords(p: Pos, digits = 5) {
  return `${p.lat.toFixed(digits)}, ${p.lng.toFixed(digits)}`;
}

export function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = ((a - d) * 60 - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″ ${v >= 0 ? pos : neg}`;
}

const DIRS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
export const compass = (deg: number) => DIRS[Math.round(deg / 45) % 8];

export function dist(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
