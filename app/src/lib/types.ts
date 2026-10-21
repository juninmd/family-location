export interface Pos {
  lat: number; lng: number; acc: number | null; speed: number | null; heading: number | null;
  alt: number | null; battery: number | null; charging: boolean; ts: number;
}
export interface Person {
  code: string; name: string; realName: string; emoji: string; color: string;
  sharing: boolean; online: boolean; lastSeen: number; pos: Pos | null; moving: boolean;
  pending?: boolean; group?: string | null; speedLimit?: number | null; expiresAt?: number | null;
}
export interface Place { id: string; name: string; emoji: string; lat: number; lng: number; radius: number }
export interface Watcher { id: string; name: string; emoji: string; color: string; since: number; expiresAt?: number | null }
export interface Invite { code: string; expiresAt: number | null; label?: string | null }
export interface NearbyPeer { ref: string; name: string; emoji: string; color: string; requested: boolean }
export interface Report {
  hours: number; points: number; distanceKm: number; maxKmh: number; avgKmh: number;
  movingMin: number; stops: number; longestStopMin: number;
}
export interface Me {
  id: string; code: string; name: string; emoji: string; color: string; sharing: boolean;
  approval: boolean; push?: boolean;
  following: Person[]; watchers: Watcher[]; requests: Watcher[]; invites: Invite[]; places: Place[];
}
export interface AppEvent {
  id?: number; type: 'arrive' | 'leave' | 'sos' | 'checkin' | 'lowbat' | 'speed' | 'request' | 'approved'; text: string; ts: number;
  lat: number | null; lng: number | null;
  who: { code: string; name: string; emoji: string; color: string };
}
export interface TrailPoint { ts: number; lat: number; lng: number; speed: number | null }
export interface Creds { id: string; secret: string }
