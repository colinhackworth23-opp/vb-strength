// VB Strength — service worker
// Caches the page plus app.css, program.js, sync.js, app.js and icon.png as they're fetched.
// Strategy: network-first with a short timeout. Every open tries the network for
// fresh code (so deploys show up on the next open with decent signal), but if the
// network hasn't answered within NETWORK_TIMEOUT_MS and a saved copy exists, the
// saved copy is shown instead of making you wait on bad gym/beach signal.
// The late network response still refreshes the saved copy for next time.
const CACHE = 'vb-strength-sw-v1';
const NETWORK_TIMEOUT_MS = 2000;

self.addEventListener('install', () => {
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
  // the app keeps its own copy of training data; the service worker never caches it.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const network = caches.open(CACHE).then((cache) =>
    fetch(e.request).then((res) => {
      if (res && res.ok) {
        cache.put(e.request, res.clone());
        // Drop older versions of the same file (app.js?v=old) so the cache doesn't grow with every deploy
        if (url.search) cache.keys().then((keys) => keys.forEach((k) => {
          const ku = new URL(k.url);
          if (ku.pathname === url.pathname && ku.search !== url.search) cache.delete(k);
        }));
      }
      return res;
    })
  );
  // Keep the worker alive until the network finishes, so a late response
  // still updates the saved copy even after we've answered from cache.
  e.waitUntil(network.catch(() => {}));

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (!cached) return network; // first visit: nothing saved yet, wait for the network
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    try {
      return await Promise.race([network, timeout]);
    } catch (err) {
      return cached; // offline → last known good
    }
  })());
});
