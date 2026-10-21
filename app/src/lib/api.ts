import { getServer } from './config';
import type { AppEvent, Creds, Invite, Me, NearbyPeer, Person, Place, Report, TrailPoint } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let creds: Creds | null = null;
export const setCreds = (c: Creds | null) => (creds = c);

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(getServer() + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(creds && { 'x-device-id': creds.id, 'x-device-secret': creds.secret }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Algo deu errado.');
  return data as T;
}

export const api = {
  register: (p: { name: string; emoji: string; color: string }) => req<Creds & { code: string }>('POST', '/api/register', p),
  me: () => req<Me>('GET', '/api/me'),
  updateMe: (p: Partial<Pick<Me, 'name' | 'emoji' | 'color' | 'sharing' | 'approval'>>) => req<Me>('PATCH', '/api/me', p),
  rotateCode: () => req<Me>('POST', '/api/me/rotate-code'),
  deleteMe: () => req<void>('DELETE', '/api/me'),
  follow: (code: string, alias?: string) => req<Person>('POST', '/api/follow', { code, alias }),
  unfollow: (code: string) => req<void>('DELETE', `/api/follow/${encodeURIComponent(code)}`),
  rename: (code: string, alias: string) => req<void>('PATCH', `/api/follow/${encodeURIComponent(code)}`, { alias }),
  followMeta: (code: string, p: { group?: string | null; speedLimit?: number | null }) =>
    req<void>('PATCH', `/api/follow/${encodeURIComponent(code)}`, p),
  answerRequest: (id: string, accept: boolean) => req<void>('POST', `/api/requests/${encodeURIComponent(id)}`, { accept }),
  createInvite: (p: { hours?: number; permanent?: boolean; label?: string }) => req<Invite>('POST', '/api/me/invite', p),
  nearby: (visible = true) => req<NearbyPeer[]>('GET', `/api/discover?visible=${visible ? 1 : 0}`),
  stopNearby: () => req<void>('DELETE', '/api/discover'),
  requestNearby: (ref: string) => req<Person>('POST', '/api/discover/request', { ref }),
  revokeInvite: (code: string) => req<void>('DELETE', `/api/me/invite/${encodeURIComponent(code)}`),
  locationBatch: (points: unknown[]) => req<{ stored: number }>('POST', '/api/location/batch', { points }),
  report: (code: string, hours: number) => req<Report>('GET', `/api/report/${encodeURIComponent(code)}?hours=${hours}`),
  pushRegister: (token: string, platform: string) => req<void>('POST', '/api/push/register', { token, platform }),
  removeWatcher: (id: string) => req<void>('DELETE', `/api/watchers/${encodeURIComponent(id)}`),
  location: (p: unknown) => req<{ stored: boolean }>('POST', '/api/location', p),
  history: (code: string, hours: number) => req<TrailPoint[]>('GET', `/api/history/${encodeURIComponent(code)}?hours=${hours}`),
  addPlace: (p: Omit<Place, 'id'>) => req<Place>('POST', '/api/places', p),
  removePlace: (id: string) => req<void>('DELETE', `/api/places/${id}`),
  events: () => req<AppEvent[]>('GET', '/api/events?limit=60'),
  sos: (p: { lat?: number; lng?: number }) => req<{ notified: number }>('POST', '/api/sos', p),
  checkin: (p: { lat?: number; lng?: number; message?: string }) => req<{ notified: number }>('POST', '/api/checkin', p),
  geocode: (lat: number, lng: number) => req<{ address: string | null }>('GET', `/api/geocode?lat=${lat}&lng=${lng}`),
};
