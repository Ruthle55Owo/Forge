'use strict';

const CACHE_NAME = 'forge-pwa-v10.0.0-20260710';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('forge-pwa-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always ask the network for the tiny build manifest so stale PWAs can warn.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match('./version.json'))
    );
    return;
  }

  // HTML/navigation: network first, cached app shell as the offline fallback.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        }
        return response;
      }).catch(async () => (
        (await caches.match(request)) ||
        (await caches.match('./index.html')) ||
        (await caches.match('./'))
      ))
    );
    return;
  }

  // Static assets: cached immediately, refreshed in the background.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
