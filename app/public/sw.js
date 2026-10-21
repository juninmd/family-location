/* Perto — service worker: abre offline e guarda os tiles já vistos do mapa. */
const SHELL = 'perto-shell-v2';
const TILES = 'perto-tiles-v1';
const TILE_HOSTS = ['tiles.openfreemap.org'];
const MAX_TILES = 800;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    // stale-while-revalidate
    e.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).then(() => trim(cache));
            return res;
          })
          .catch(() => hit);
        return hit ?? net;
      }),
    );
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname === '/health') return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
  }
});
