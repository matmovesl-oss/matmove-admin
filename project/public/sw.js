/* MatMove Admin: static app shell only. Never cache API, auth, staff or financial data. */
const CACHE_PREFIX = 'matmove-admin-static-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const SHELL = ['/', '/index.html', '/offline.html', '/logo.png', '/manifest.webmanifest', '/image-unavailable.svg'];
const HASHED_ASSET = /\/assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2?|svg)$/i;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async path => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok && response.type === 'basic') await cache.put(path, response);
      } catch {
        // A missing optional icon or offline page must not block installation.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes, authentication callbacks or dynamic admin data.
  if (/^\/(?:api|auth|rest|storage|functions|realtime)(?:\/|$)/i.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && (url.pathname === '/' || url.pathname === '/index.html') && !url.search) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || (await cache.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }

  // Only immutable, fingerprinted build assets are eligible for cache-first reuse.
  if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    })());
  }
});
