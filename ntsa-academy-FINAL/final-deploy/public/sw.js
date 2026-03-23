/* ══════════════════════════════════════════════════════════
   NTSA Driving Academy — Service Worker  v2.0
   Stale-while-revalidate caching for full offline support
══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'ntsa-academy-v2';

/* Files cached on install — must all exist for install to succeed */
const PRECACHE = [
  './',
  './index.html',
  './landing.html',
  './system.js',
  './accounts.js',
  './progress.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
];

/* ── Install: pre-cache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: remove old cache versions ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: stale-while-revalidate ── */
self.addEventListener('fetch', event => {
  /* Only handle GET; skip API calls (always need fresh data) */
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        /* Fetch fresh copy in background */
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        /* Return cached immediately, or wait for network if no cache */
        return cached || fetchPromise.then(r => r || caches.match('./index.html'));
      })
    )
  );
});
