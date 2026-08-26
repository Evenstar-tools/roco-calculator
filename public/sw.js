const CACHE_NAME = "rock-calculator-webapp-v1.6.3";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/data/runtime.json",
  "/assets/elements/manifest.json",
];
const BUILD_ASSET_RE = /(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g;

async function cacheBuildAssets(cache) {
  if (typeof fetch !== "function") return;
  try {
    const response = await fetch("/", { cache: "reload" });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put("/", response);
    const assets = [...html.matchAll(BUILD_ASSET_RE)]
      .map((match) => new URL(match[1], self.location.origin).pathname)
      .filter((path, index, list) => list.indexOf(path) === index);
    await Promise.allSettled(assets.map((asset) => cache.add(asset)));
  } catch {
    // 构建资源发现失败不阻塞基础离线缓存。
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        await cacheBuildAssets(cache);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function refreshCache(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return null;
  }
}

async function staleWhileRevalidate(event, request, fallbackRequest = request) {
  const cache = await caches.open(CACHE_NAME);
  const cached =
    (await cache.match(fallbackRequest)) ??
    (await caches.match(fallbackRequest));
  const refresh = refreshCache(cache, request);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) ?? caches.match(fallbackRequest);
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      staleWhileRevalidate(event, event.request, "/").then(
        (response) => response ?? caches.match("/index.html"),
      ),
    );
    return;
  }

  if (url.pathname === "/data/runtime.json") {
    event.respondWith(staleWhileRevalidate(event, event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, event.request));
});
