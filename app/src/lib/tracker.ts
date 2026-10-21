import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { api, ApiError } from './api';
import { batteryInfo, isNative, kv } from './native';
import { socketOpen, socketSend } from './socket';
import { getState, setState } from './store';
import type { Pos } from './types';
import { haversine } from './format';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Modo adaptativo: em movimento usa filtro curto e reenvio a cada 60 s; parado, filtro longo e 120 s. */
const MODES = {
  move: { filter: 15, keepaliveMs: 60_000 },
  still: { filter: 60, keepaliveMs: 120_000 },
} as const;
type Mode = keyof typeof MODES;
const STILL_AFTER_MS = 3 * 60_000;
const STILL_RADIUS_M = 25;
const QUEUE_MAX = 400;

let watcherId: string | null = null;
let webWatch: number | null = null;
let keepalive: ReturnType<typeof setInterval> | undefined;
let last: Pos | null = null;
let lastSentAt = 0;
let sending = false;
let mode: Mode = 'move';
let anchor: { lat: number; lng: number; since: number } | null = null;
let lastWebPublish = 0;

interface Fix {
  lat: number; lng: number; acc?: number | null; speed?: number | null; heading?: number | null; alt?: number | null; ts: number;
}
type Body = Record<string, unknown>;

// ── Fila offline (persistida): pontos que não puderam ser enviados ─────────
let queue: Body[] = kv.get<Body[]>('queue', []);
const saveQueue = () => kv.set('queue', queue);
function enqueue(body: Body) {
  queue.push(body);
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
  saveQueue();
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !queue.length || !getState().creds) return;
  flushing = true;
  const batch = queue.slice();
  try {
    await api.locationBatch(batch);
    queue = queue.slice(batch.length);
    saveQueue();
  } catch (e) {
    // Erro de validação (4xx) não adianta repetir; sem rede, tenta depois.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
      queue = [];
      saveQueue();
    }
  } finally {
    flushing = false;
  }
}

async function publish(fix: Fix) {
  const bat = await batteryInfo();
  const pos: Pos = {
    lat: fix.lat, lng: fix.lng, acc: fix.acc ?? null,
    speed: fix.speed != null && fix.speed >= 0 ? fix.speed : null,
    heading: fix.heading != null && fix.heading >= 0 ? fix.heading : null,
    alt: fix.alt ?? null, battery: bat.battery, charging: bat.charging, ts: fix.ts,
  };
  last = pos;
  setState({ myPos: pos, tracking: 'on' });
  void adapt(pos);
  if (!getState().me?.sharing) return;
  const body: Body = {
    lat: pos.lat, lng: pos.lng, acc: pos.acc, speed: pos.speed, heading: pos.heading, alt: pos.alt,
    battery: pos.battery, charging: pos.charging, ts: pos.ts,
  };
  lastSentAt = Date.now();
  // WebSocket só com o app em primeiro plano e conexão confirmada; em background, HTTP nativo.
  if (!document.hidden && getState().conn === 'online' && socketOpen()) {
    socketSend({ t: 'loc', ...body });
    if (queue.length) void flushQueue();
    return;
  }
  if (sending) return enqueue(body);
  sending = true;
  try {
    await api.location(body);
    if (queue.length) void flushQueue();
  } catch (e) {
    if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) enqueue(body);
  } finally {
    sending = false;
  }
}

/** Alterna entre "movimento" e "parado" para economizar bateria. */
async function adapt(pos: Pos) {
  const now = Date.now();
  if (!anchor || haversine(anchor, pos) > STILL_RADIUS_M) {
    anchor = { lat: pos.lat, lng: pos.lng, since: now };
    if (mode !== 'move') await setMode('move');
  } else if (mode === 'move' && now - anchor.since > STILL_AFTER_MS) {
    await setMode('still');
  }
}

async function setMode(next: Mode) {
  if (mode === next) return;
  mode = next;
  if (isNative && watcherId) {
    await BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
    watcherId = null;
    await addNativeWatcher();
  }
}

async function addNativeWatcher() {
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Perto está compartilhando sua localização',
        backgroundMessage: 'A família consegue ver onde você está. Toque para abrir e pausar.',
        requestPermissions: true,
        stale: false,
        distanceFilter: MODES[mode].filter,
      },
      (loc, err) => {
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') setState({ tracking: 'denied' });
          return;
        }
        if (!loc) return;
        void publish({
          lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy, speed: loc.speed, heading: loc.bearing,
          alt: loc.altitude, ts: loc.time ?? Date.now(),
        });
      },
    );
  } catch {
    setState({ tracking: 'denied' });
  }
}

export async function startTracking() {
  if (watcherId || webWatch != null) return;
  if (isNative) {
    await addNativeWatcher();
  } else if ('geolocation' in navigator) {
    webWatch = navigator.geolocation.watchPosition(
      (p) => {
        // Na web não há distanceFilter: limita a frequência quando parado.
        const gap = mode === 'still' ? 30_000 : 4_000;
        if (Date.now() - lastWebPublish < gap) return;
        lastWebPublish = Date.now();
        void publish({
          lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed,
          heading: p.coords.heading, alt: p.coords.altitude, ts: p.timestamp,
        });
      },
      (e) => e.code === 1 && setState({ tracking: 'denied' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  }
  // Parado não gera novos fixes: reenvia o último para continuar "ao vivo".
  clearInterval(keepalive);
  keepalive = setInterval(() => {
    if (last && getState().me?.sharing && Date.now() - lastSentAt >= MODES[mode].keepaliveMs - 1000) {
      void publish({ ...last, ts: Date.now() });
    }
  }, 20_000);
  window.addEventListener('online', () => void flushQueue());
}

export async function stopTracking() {
  clearInterval(keepalive);
  if (watcherId) await BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
  if (webWatch != null) navigator.geolocation.clearWatch(webWatch);
  watcherId = null;
  webWatch = null;
  setState({ tracking: 'idle' });
}

export function openLocationSettings() {
  if (isNative) void BackgroundGeolocation.openSettings();
}
