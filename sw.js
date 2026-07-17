// VB Strength — service worker
// Strategy: network-first for the app shell. Every open tries the network for
// fresh code (so deploys show up immediately); the cache is only a fallback
// for offline use (beach with no signal).
const CACHE = 'vb-strength-sw-v1';

self.addEventListener('install', (e) => {
  // Take over immediately — don't wait for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only handle same-origin GETs (the app shell itself).
  // Google Apps Script calls (script.google.com) pass through untouched —
  // never cache training data reads or writes.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Fresh copy fetched — update the offline fallback
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)) // offline → serve last known good
  );
});
