const CACHE = 'cloudcover-v1';
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
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        try {
          await cache.put(request, response.clone());
        } catch {
          // A full or unavailable cache must not break an online request.
        }
      }
      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});