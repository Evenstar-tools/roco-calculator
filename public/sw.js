const CACHE_NAME = "rock-calculator-webapp-v2.2.8-global-terms-20261030";
const CACHE_PREFIX = "rock-calculator-webapp-";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/manifest-global-en.webmanifest",
  "/manifest-global-zh-CN.webmanifest",
  "/manifest-global-ja.webmanifest",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/assets/elements/manifest.json",
];
const BUILD_ASSET_RE = /(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g;

function navigationShell(pathname) {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/") return path;
  return ["/en", "/jp", "/global/zh-CN", "/global/ja", "/cn", "/dianlu"].includes(path) ? `${path}/` : null;
}

function isGlobalShell(path) {
  return path === "/en/" || path === "/jp/" || path.startsWith("/global/");
}

function navigationFallbacks(pathname) {
  const shell = navigationShell(pathname);
  if (!shell) return [];
  return isGlobalShell(shell)
    ? [...new Set([shell, "/en/", "/jp/", "/global/zh-CN/", "/global/ja/"])]
    : [shell];
}

async function openedShells() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const paths = clients.map((client) => new URL(client.url))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => navigationShell(url.pathname)).filter(Boolean);
  return [...new Set(clients.length ? paths : ["/"])];
}

async function cacheBuildAssets(cache, path) {
  if (typeof fetch !== "function") return;
  try {
    const response = await fetch(path, { cache: "reload" });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put(path, response);
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
        const paths = await openedShells();
        await Promise.all(paths.map((path) => cacheBuildAssets(cache, path)));
        // 初次加载发生在 SW 接管前；仅国服窗口补缓存已有国服数据。
        if (paths.some(isGlobalShell)) {
          await Promise.allSettled([cache.add("/global-assets/data/global-runtime.json")]);
        }
        if (paths.some((path) => !isGlobalShell(path))) {
          await Promise.allSettled([cache.add("/data/runtime.json")]);
        }
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
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_VISITED_ASSETS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls.flatMap((value) => {
    if (typeof value !== "string") return [];
    try {
      const url = new URL(value, self.location.origin);
      if (!/^https?:$/.test(url.protocol) || url.origin !== self.location.origin
        || !(url.pathname.startsWith("/assets/") || url.pathname.startsWith("/global-assets/assets/")) || url.username || url.password) return [];
      url.hash = "";
      return [url.href];
    } catch {
      return [];
    }
  }))];
  event.waitUntil((async () => {
    let failed = 0;
    if (urls.length) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const results = await Promise.allSettled(urls.map(async (url) => {
          if (!(await cache.match(url))) await cache.add(url);
        }));
        failed = results.filter((result) => result.status === "rejected").length;
      } catch {
        failed = urls.length;
      }
    }
    event.ports?.[0]?.postMessage({ type: "VISITED_ASSETS_CACHED", failed });
  })());
});

// 构建指纹随内容变化；图标由当前发布缓存隔离，发布时更新 CACHE_NAME。
const IMMUTABLE_ASSET_RE = /^\/(?:global-assets\/)?assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;
const RELEASE_ASSETS = new Set(["/app-icon-192.png", "/app-icon-512.png"]);

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  // cache.add(URL) 预缓存时没有 Origin；浏览器的同源模块请求会带 Origin。
  // 带指纹的构建文件内容不随 CORS 响应头变化，只复用仅按 Origin 区分的预缓存。
  if (IMMUTABLE_ASSET_RE.test(new URL(request.url).pathname)
    && request.headers.get("origin") === self.location.origin) {
    const precached = await cache.match(request.url);
    if (precached?.headers.get("vary")?.trim().toLowerCase() === "origin") return precached;
  }
  return refreshCache(cache, request);
}

async function refreshCache(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // 存储额度不足时仍返回已取得的在线内容。
      }
    }
    return response;
  } catch {
    return null;
  }
}

async function staleWhileRevalidate(event, request, fallbackRequest = request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(fallbackRequest);
  const refresh = refreshCache(cache, request);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) ?? cache.match(fallbackRequest);
}

async function networkFirst(request, fallbackRequests) {
  const cache = await caches.open(CACHE_NAME);
  const response = (await refreshCache(cache, request)) ?? (await cache.match(request));
  if (response) return response;
  for (const fallback of fallbackRequests) {
    const cached = await cache.match(fallback);
    if (cached) return cached;
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // 抢先版自行加载独立资源，不进入正式版的离线缓存。
  if (url.pathname === "/pre" || url.pathname.startsWith("/pre/")) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      networkFirst(event.request, navigationFallbacks(url.pathname)).then(
        (response) => response ?? Response.error(),
      ),
    );
    return;
  }

  if (IMMUTABLE_ASSET_RE.test(url.pathname) || RELEASE_ASSETS.has(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (url.pathname === "/data/runtime.json") {
    event.respondWith(staleWhileRevalidate(event, event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, event.request));
});
