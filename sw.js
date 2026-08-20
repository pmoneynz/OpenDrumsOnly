/* OpenDrumsOnly service worker — caches scan shell + catalogue text only. */
const CACHE = 'odo-scan-v2';
const PRECACHE = [
  './',
  './index.html',
  './scan.html',
  './scan.js',
  './scan.css',
  './DrumBreaks.csv',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/GeistVF.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept gallery image payloads — leave those to the network.
  if (url.pathname.includes('/images/')) return;

  // Network-first for HTML so gallery/scan stay fresh; cache fallback offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./scan.html')))
    );
    return;
  }

  // Network-first for gallery CSS/JS so iPhone picks up vinyl icon fixes
  // without requiring a manual cache clear (do not cache-first these).
  if (url.pathname.endsWith('styles.css') || url.pathname.endsWith('script.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for scan assets + CSV + fonts/icons.
  const cacheable =
    url.pathname.endsWith('scan.js') ||
    url.pathname.endsWith('scan.css') ||
    url.pathname.endsWith('DrumBreaks.csv') ||
    url.pathname.endsWith('manifest.webmanifest') ||
    url.pathname.includes('/fonts/') ||
    url.pathname.includes('/icons/');

  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
