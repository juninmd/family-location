import { api, ApiError, setCreds } from './api';
import { wsUrl } from './config';
import { askNotifications, haptic, notify } from './native';
import { applyPos, getState, pushEvent, setMe, setState, toast, upsertPerson } from './store';
import type { AppEvent, Creds, Me } from './types';

let ws: WebSocket | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let pinger: ReturnType<typeof setInterval> | undefined;
let attempts = 0;
let lastMsg = 0;
let wanted = false;

export async function refreshMe() {
  try {
    setMe(await api.me());
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Conta removida no servidor (ex.: banco recriado): volta ao onboarding.
      setState({ creds: null, me: null });
    }
  }
}

async function refreshEvents() {
  try {
    const events = await api.events();
    setState((s) => ({ events, unread: s.tab === 'activity' ? 0 : s.unread }));
  } catch {
    /* offline */
  }
}

export function startRealtime(creds: Creds) {
  setCreds(creds);
  wanted = true;
  void refreshMe();
  void refreshEvents();
  connect();
  void askNotifications();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  clearInterval(pinger);
  pinger = setInterval(() => {
    if (ws?.readyState === 1) {
      ws.send('{"t":"ping"}');
      if (Date.now() - lastMsg > 70_000) ws.close(); // conexão zumbi
    }
  }, 20_000);
}

export function stopRealtime() {
  wanted = false;
  clearTimeout(timer);
  clearInterval(pinger);
  ws?.close();
  ws = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onVisible);
}

function onVisible() {
  if (!wanted || document.hidden) return;
  if (!ws || ws.readyState > 1) connect();
  void refreshMe();
  void refreshEvents();
}

function connect() {
  const creds = getState().creds;
  if (!creds || !wanted) return;
  clearTimeout(timer);
  if (ws && ws.readyState <= 1) return;
  setState({ conn: 'connecting' });
  const sock = new WebSocket(wsUrl());
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ id: creds.id, secret: creds.secret }));
  sock.onmessage = (ev) => {
    lastMsg = Date.now();
    let m: { t: string } & Record<string, unknown>;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (m.t) {
      case 'ready':
        attempts = 0;
        setState({ conn: 'online' });
        setMe(m.me as Me);
        break;
      case 'pos':
        applyPos(m.code as string, m.pos as never);
        break;
      case 'person':
        upsertPerson(m.person as never);
        break;
      case 'watchers':
      case 'refresh':
        void refreshMe();
        break;
      case 'event': {
        const e = m.event as AppEvent;
        pushEvent(e);
        toast(e.text, e.type === 'sos' ? 'sos' : 'ok');
        void haptic(e.type === 'sos' ? 'warning' : 'light');
        void notify(e.type === 'sos' ? '🚨 SOS — Perto' : 'Perto', e.text);
        break;
      }
    }
  };
  sock.onclose = (ev) => {
    if (ws === sock) ws = null;
    if (!wanted) return;
    setState({ conn: 'offline' });
    if (ev.code === 4401) return void refreshMe();
    attempts++;
    timer = setTimeout(connect, Math.min(15_000, 600 * 2 ** Math.min(attempts, 5)));
  };
  sock.onerror = () => sock.close();
}

export const socketOpen = () => ws?.readyState === 1;
export const socketSend = (data: unknown) => ws?.send(JSON.stringify(data));
