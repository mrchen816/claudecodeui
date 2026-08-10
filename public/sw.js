// Service Worker for CloudCLI PWA
// App shell: precache `/` + manifest so iOS cold starts can paint offline/slow.
// Navigation: network-first with a short timeout, then cached shell fallback.
// Hashed /assets/*: cache-first (filenames change per build).
const CACHE_NAME = 'claude-ui-v3';
const NAV_TIMEOUT_MS = 1800;
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-152x152.png'
];

async function putInCache(request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function matchShell(request) {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(request)) ||
    (await cache.match('/')) ||
    (await cache.match('/index.html'))
  );
}

async function networkFirstNavigate(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    // SPA shell is the same for all routes — only keep `/` to avoid cache bloat.
    await putInCache(new Request('/'), response.clone());
    return response;
  } catch {
    clearTimeout(timer);
    const cached = await matchShell(request);
    if (cached) return cached;

    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body style="font-family:-apple-system,system-ui,sans-serif;padding:2rem"><h1>Offline</h1><p>Please check your connection.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => {
            // Individual shell assets may be missing in some deployments; ignore.
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never intercept API requests or WebSocket upgrades
  if (url.includes('/api/') || url.includes('/ws') || url.includes('/shell') || url.includes('/plugin-ws')) {
    return;
  }

  // Only cache GET; avoid caching auth POSTs etc.
  if (event.request.method !== 'GET') {
    return;
  }

  // Navigation requests (HTML) — network-first with timeout, then shell cache
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(event.request));
    return;
  }

  // Hashed assets (JS/CSS in /assets/) — cache-first since filenames change per build
  if (url.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => putInCache(event.request, response));
      })
    );
    return;
  }

  // Everything else — network-first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => putInCache(event.request, response))
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'CloudCLI', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/logo-256.png',
    badge: '/logo-128.png',
    data: payload.data || {},
    tag: payload.data?.tag || `${payload.data?.sessionId || 'global'}:${payload.data?.code || 'default'}`,
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'CloudCLI', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const sessionId = event.notification.data?.sessionId;
  const provider = event.notification.data?.provider || null;
  const urlPath = sessionId ? `/session/${sessionId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          client.postMessage({
            type: 'notification:navigate',
            sessionId: sessionId || null,
            provider,
            urlPath
          });
          return;
        }
      }
      return self.clients.openWindow(urlPath);
    })
  );
});
