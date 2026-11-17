const CACHE_NAME = 'swave-video-shell-v9';

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
    scopedUrl('icons/icon-maskable-512.png'),
    scopedUrl('icons/apple-touch-icon.png'),
    scopedUrl('icons/icon.svg'),
  ];
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

  // Never intercept API calls, uploads, media streams, or large WASM/ONNX binaries
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/media/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.onnx')
  ) {
    return;
  }

  // Navigation & same-origin JS/MJS/CSS assets: Network-First so deployed workers
  // and ORT runtime modules never mismatch stale shell cache; cache serves offline fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return (await caches.match(scopedUrl('index.html'))) || Response.error();
        }
        return Response.error();
      })
  );
});
