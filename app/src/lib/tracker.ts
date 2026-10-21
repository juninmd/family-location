import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { api } from './api';
import { batteryInfo, isNative } from './native';
import { socketOpen, socketSend } from './socket';
import { getState, setState } from './store';
import type { Pos } from './types';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

let watcherId: string | null = null;
let webWatch: number | null = null;
let keepalive: ReturnType<typeof setInterval> | undefined;
let last: Pos | null = null;
let sending = false;

interface Fix {
  lat: number; lng: number; acc?: number | null; speed?: number | null; heading?: number | null; alt?: number | null; ts: number;
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
  if (!getState().me?.sharing) return;
  const body = {
    lat: pos.lat, lng: pos.lng, acc: pos.acc, speed: pos.speed, heading: pos.heading, alt: pos.alt,
    battery: pos.battery, charging: pos.charging, ts: pos.ts,
  };
  // WebSocket só com o app em primeiro plano; em background usamos HTTP nativo.
  if (!document.hidden && socketOpen()) return socketSend({ t: 'loc', ...body });
  if (sending) return;
  sending = true;
  try {
    await api.location(body);
  } catch {
    /* tenta de novo no próximo fix/keepalive */
  } finally {
    sending = false;
  }
}

export async function startTracking() {
  if (watcherId || webWatch != null) return;
  if (isNative) {
    try {
      watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Perto está compartilhando sua localização',
          backgroundMessage: 'A família consegue ver onde você está. Toque para abrir e pausar.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 15,
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
  } else if ('geolocation' in navigator) {
    webWatch = navigator.geolocation.watchPosition(
      (p) =>
        void publish({
          lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, speed: p.coords.speed,
          heading: p.coords.heading, alt: p.coords.altitude, ts: p.timestamp,
        }),
      (e) => e.code === 1 && setState({ tracking: 'denied' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  }
  // Parado não gera novos fixes: reenvia o último a cada 60s para continuar "ao vivo".
  clearInterval(keepalive);
  keepalive = setInterval(() => {
    if (last && getState().me?.sharing) void publish({ ...last, ts: Date.now() });
  }, 60_000);
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
