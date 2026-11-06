const BUILD = 'local-v3';
const INTEGRITY = null;
const FILES = ["index.html","style.css","app.mjs","game.mjs","data.mjs","backup.mjs","manifest.webmanifest","crest.svg","march.svg","icon-192.png","icon-512.png"];
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'relic-company:' + SCOPE.pathname + ':';
const CACHE = PREFIX + BUILD;

self.addEventListener('install', event => {
  const requests = FILES.map(file => new Request(new URL(file, SCOPE), {
    cache: 'reload', integrity: INTEGRITY?.[file] ?? '',
  }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => (key.startsWith(PREFIX) && key !== CACHE) ||
      (SCOPE.hostname === 'localhost' && SCOPE.pathname === '/' && key === 'relic-company-v2'))
      .map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const localPath = url.pathname.slice(SCOPE.pathname.length);
  if (event.request.mode === 'navigate') {
    if (localPath === '' || localPath === 'index.html') {
      event.respondWith(caches.open(CACHE).then(cache => cache.match(new URL('index.html', SCOPE))).then(hit => hit || fetch(event.request)));
    }
    return;
  }
  if (FILES.includes(localPath)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request, { ignoreSearch: true })).then(hit => hit || fetch(event.request)));
  }
});
