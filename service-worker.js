const VERSION = '1.0.0';
const base = new URL(self.registration.scope);
const family = `coa-inventory:${base.pathname}:`;
const shellCache = `${family}${VERSION}`;
const routes = new Set([
  'index.html', 'dashboard.html', 'scanner.html', 'inventory.html', 'transactions.html',
  'personnel.html', 'property.html', 'physical-count.html', 'reports.html', 'settings.html', 'teacher.html'
]);
const assets = [
  'css/app.css', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/campus.jpg', 'fonts/inter-latin-wght-normal.woff2', 'fonts/inter-latin-ext-wght-normal.woff2'
];
const offlineKey = new URL('.offline-screen', base).href;

const offlinePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#132d51"><title>Offline • COA Inventory</title><link rel="stylesheet" href="${new URL('css/app.css',base).href}"></head><body><main class="login-page"><section class="login-card" aria-labelledby="offline-title"><div class="login-head"><img width="56" height="56" alt="" src="${new URL('icons/icon-192.png',base).href}"><h1 id="offline-title">Connection unavailable</h1></div><p>Inventory transactions require a connection to the school backend. Reconnect to continue working.</p><a class="btn primary" href="${new URL('index.html',base).href}">Return to sign in</a></section></main></body></html>`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    const files = assets.map(path => new Request(new URL(path, base), { cache: 'reload', credentials: 'omit' }));
    await cache.addAll(files);
    await cache.put(offlineKey, new Response(offlinePage, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(family) && key !== shellCache) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;

  const path = url.pathname.slice(base.pathname.length);
  if (request.mode === 'navigate' && (routes.has(path) || path === '')) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(shellCache);
      return (await cache.match(offlineKey)) ?? Response.error();
    }));
    return;
  }

  // Only the install-time asset allowlist is cached. Authenticated traffic bypasses the worker.
  if (!url.search && assets.includes(path) && !request.headers.has('Authorization')) {
    event.respondWith((async () => {
      const cache = await caches.open(shellCache);
      return (await cache.match(request)) ?? fetch(request);
    })());
  }
});
