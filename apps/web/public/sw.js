const CACHE_NAME = 'velocut-app-shell-v2';

function scopedUrl(relPath) {
  return new URL(relPath, self.registration.scope).toString();
}

function getAppShellUrls() {
  return [
    scopedUrl('./'),
    scopedUrl('index.html'),
    scopedUrl('manifest.webmanifest'),
    scopedUrl('icons/icon-192.png'),
    scopedUrl('icons/icon-512.png'),
    scopedUrl('icons/icon.svg'),
  ];
}

function withIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  if (!headers.has('Cross-Origin-Opener-Policy')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  }
  if (!headers.has('Cross-Origin-Embedder-Policy')) {
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(getAppShellUrls()))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls, chunk uploads, or byte-range media streams
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    return;
  }

  // Navigation requests: network-first with COOP/COEP-preserving cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return withIsolationHeaders(res);
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match(scopedUrl('index.html')));
          return cached ? withIsolationHeaders(cached) : Response.error();
        })
    );
    return;
  }

  // Static JS/CSS/icon assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => cached || Response.error());

      return cached || networkFetch;
    })
  );
});

