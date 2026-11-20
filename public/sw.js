// Fetch pages and manifests network-first with an offline fallback; cache other assets first.
const CACHE = 'cloudcover-v2';
const SHELL = ['./', './index.html', './board.html', './manifest.webmanifest', './icon.svg'];

/** Cache the built pages' local assets before the first offline visit. */
async function cacheAssets(cache) {
  const scope = self.registration.scope;
  const assets = new Set();
  for (const page of ['./index.html', './board.html']) {
    const response = await cache.match(page);
    const html = await response.text();
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
      const url = new URL(match[1], new URL(page, scope));
      if (url.href.startsWith(scope)) assets.add(url.href);
    }
  }
  await cache.addAll([...assets]);
  const fonts = new Set();
  for (const url of assets) {
    if (!new URL(url).pathname.endsWith('.css')) continue;
    const response = await cache.match(url);
    const css = await response.text();
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const asset = new URL(match[1].trim(), url);
      if (asset.href.startsWith(scope)) fonts.add(asset.href);
    }
  }
  await cache.addAll([...fonts]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(SHELL);
    await cacheAssets(cache);
    await self.skipWaiting();
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('cloudcover-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.webmanifest')) {
      try {
        const controller = new AbortController();
        let timeout;
        const response = await Promise.race([
          fetch(request, { signal: controller.signal }),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              reject(new Error('Network request timed out'));
              controller.abort();
            }, 3000);
          }),
        ]).finally(() => clearTimeout(timeout));
        if (!response.ok) throw new Error(`Network request failed: ${response.status}`);
        try {
          await cache.put(request, response.clone());
        } catch {
          // A full or unavailable cache must not break an online request.
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallback = await cache.match(url.pathname.endsWith('board.html') ? './board.html' : './index.html');
          if (fallback) return fallback;
        }
        throw error;
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // A full or unavailable cache must not break an online request.
      }
    }
    return response;
  })());
});