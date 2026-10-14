/* Service worker English Coach — généré au build (voir vite.config.ts). */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `english-coach-${VERSION}`;

// Installation : l'application (code, styles, icônes, programme des 90 jours) est mise en cache
// pour fonctionner sans réseau. Les services en ligne (/api : IA, synchronisation) ne le sont jamais.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('english-coach-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// La nouvelle version attend l'accord de l'utilisateur (bouton « Mettre à jour ») pour ne pas couper une leçon.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    const shell = new URL('index.html', self.registration.scope).href;
    event.respondWith(
      caches.match(shell).then((cached) => cached || fetch(request).catch(() => Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
