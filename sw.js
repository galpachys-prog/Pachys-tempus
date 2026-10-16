// Pachys Tempus — service worker: precache everything, serve cache-first.
const VERSION = 'pt-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './monitor.html',
  './instructor.html',
  './css/app.css',
  './js/model.js',
  './js/physio.js',
  './js/audio.js',
  './js/link.js',
  './js/pairing.js',
  './js/controls.js',
  './js/common.js',
  './js/monitor.js',
  './js/instructor.js',
  './vendor/qrcode.js',
  './vendor/jsQR.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      // Refresh in the background when online (stale-while-revalidate).
      e.waitUntil(fetch(req).then((r) => { if (r.ok) return cache.put(req, r); }).catch(() => {}));
      return hit;
    }
    try {
      const r = await fetch(req);
      if (r.ok) cache.put(req, r.clone());
      return r;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('message', async (e) => {
  if (e.data && e.data.t === 'status' && e.ports[0]) {
    const cache = await caches.open(VERSION);
    const missing = [];
    for (const u of ASSETS) if (!(await cache.match(u))) missing.push(u);
    e.ports[0].postMessage({ ready: missing.length === 0, missing, version: VERSION });
  }
});
