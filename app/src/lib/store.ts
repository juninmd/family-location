import { useSyncExternalStore } from 'react';
import { kv } from './native';
import type { AppEvent, Creds, Me, Person, Pos, TrailPoint } from './types';

export type Tab = 'map' | 'activity' | 'places' | 'profile';
export type Theme = 'auto' | 'light' | 'dark';
export type Conn = 'connecting' | 'online' | 'offline';

export interface PickPlace { name: string; emoji: string; radius: number }

export interface State {
  creds: Creds | null;
  me: Me | null;
  conn: Conn;
  myPos: Pos | null;
  tracking: 'idle' | 'on' | 'denied';
  events: AppEvent[];
  unread: number;
  selected: string | null;
  tab: Tab;
  theme: Theme;
  trails: Record<string, TrailPoint[]>;
  trailHours: number | null;
  addOpen: boolean;
  sosOpen: boolean;
  pickPlace: PickPlace | null;
  toast: { id: number; text: string; kind: 'ok' | 'err' | 'sos' } | null;
  focus: { lat: number; lng: number; zoom?: number; n: number } | null;
}

const initial: State = {
  creds: kv.get<Creds | null>('creds', null),
  me: null,
  conn: 'connecting',
  myPos: null,
  tracking: 'idle',
  events: [],
  unread: 0,
  selected: null,
  tab: 'map',
  theme: kv.get<Theme>('theme', 'auto'),
  trails: {},
  trailHours: null,
  addOpen: false,
  sosOpen: false,
  pickPlace: null,
  toast: null,
  focus: null,
};

let state = initial;
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
  );
}

// ── Ações ────────────────────────────────────────────────────────────────
let toastN = 0;
export function toast(text: string, kind: 'ok' | 'err' | 'sos' = 'ok') {
  const id = ++toastN;
  setState({ toast: { id, text, kind } });
  setTimeout(() => getState().toast?.id === id && setState({ toast: null }), kind === 'sos' ? 6000 : 3200);
}

export function setMe(me: Me) {
  setState({ me });
}

export function upsertPerson(p: Person) {
  setState((s) => {
    if (!s.me) return {};
    const exists = s.me.following.some((x) => x.code === p.code);
    const following = exists ? s.me.following.map((x) => (x.code === p.code ? p : x)) : [...s.me.following, p];
    return { me: { ...s.me, following } };
  });
}

export function applyPos(code: string, pos: Pos) {
  setState((s) => {
    if (!s.me) return {};
    const following = s.me.following.map((p) =>
      p.code === code
        ? { ...p, pos, online: true, lastSeen: Date.now(), moving: (pos.speed ?? 0) > 1.2 }
        : p,
    );
    const trail = s.trails[code];
    const trails =
      trail && trail.length
        ? { ...s.trails, [code]: [...trail, { ts: pos.ts, lat: pos.lat, lng: pos.lng, speed: pos.speed }].slice(-3000) }
        : s.trails;
    return { me: { ...s.me, following }, trails };
  });
}

export function pushEvent(e: AppEvent) {
  setState((s) => ({ events: [e, ...s.events].slice(0, 100), unread: s.tab === 'activity' ? 0 : s.unread + 1 }));
}

export function setTab(tab: Tab) {
  setState((s) => ({ tab, unread: tab === 'activity' ? 0 : s.unread, pickPlace: tab === 'map' ? s.pickPlace : null }));
}

export function setTheme(theme: Theme) {
  kv.set('theme', theme);
  setState({ theme });
}

export function select(code: string | null) {
  setState({ selected: code, trailHours: code ? getState().trailHours : null });
  const p = getState().me?.following.find((x) => x.code === code);
  if (p?.pos) flyTo(p.pos.lat, p.pos.lng, 16);
}

export function flyTo(lat: number, lng: number, zoom?: number) {
  setState((s) => ({ focus: { lat, lng, zoom, n: (s.focus?.n ?? 0) + 1 } }));
}
