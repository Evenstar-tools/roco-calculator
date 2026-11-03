const CACHE_NAME = "rock-calculator-webapp-v2.3.1-20261103-balance-review";
const CACHE_PREFIX = "rock-calculator-webapp-";
// 图片长期缓存不随发布清空；摘要由 scripts/stamp-image-cache.mjs 按图片内容写入。
const IMAGE_CACHE_PREFIX = "rock-calculator-images-";
const IMAGE_VERSION = "__IMAGE_DIGEST__";
const IMAGE_CACHE = `${IMAGE_CACHE_PREFIX}${IMAGE_VERSION}`;
const pendingImages = new Map();
const VISITED_ASSET_CONCURRENCY = 2;
const visitedAssetQueue = [];
let activeVisitedAssets = 0;
const STABLE_IMAGE_RE = /^\/(?:global-assets\/)?assets\/(?:spirits\/spirit_[a-f0-9]{16}\.(?:png|webp)|skills\/(?:skill_(?:[a-f0-9]{16}|preview_s5_[a-z0-9][a-z0-9_-]*)\.(?:png|webp)|wish-power\/77000(?:0[1-57-9]|1[0-9])\.png))$/;
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
          await Promise.allSettled([
            cache.add("/data/runtime.json"),
            cache.add("/data/user-release-notes.json"),
          ]);
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
          keys.filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            || (key.startsWith(IMAGE_CACHE_PREFIX) && key !== IMAGE_CACHE)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// One queue covers all windows/messages. Foreground requests never enter it.
function queueVisitedAsset(load) {
  return new Promise((resolve, reject) => {
    visitedAssetQueue.push({ load, resolve, reject });
    drainVisitedAssets();
  });
}

function drainVisitedAssets() {
  while (activeVisitedAssets < VISITED_ASSET_CONCURRENCY && visitedAssetQueue.length) {
    const { load, resolve, reject } = visitedAssetQueue.shift();
    activeVisitedAssets += 1;
    Promise.resolve().then(load).then(resolve, reject).finally(() => {
      activeVisitedAssets -= 1;
      drainVisitedAssets();
    });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_VISITED_ASSETS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls.flatMap((value) => {
    if (typeof value !== "string") return [];
    try {
      const url = new URL(value, self.location.origin);
      if (!/^https?:$/.test(url.protocol) || url.origin !== self.location.origin
        || !(url.pathname.startsWith("/assets/") || url.pathname.startsWith("/global-assets/assets/")) || url.username || url.password) return [];
      url.hash = "";
      return [stableImageUrl(url.href)?.href ?? url.href];
    } catch {
      return [];
    }
  }))];
  event.waitUntil((async () => {
    let failed = 0;
    if (urls.length) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const results = await Promise.allSettled(urls.map(url => queueVisitedAsset(async () => {
          const imageUrl = stableImageUrl(url);
          if (imageUrl) {
            // 访问记录只补缓存，不重复触发组件已经发起的强制重试。
            const response = await cacheFirstImage(new Request(imageUrl.href), { background: true });
            if (!isImageResponse(response)) throw new Error("Image cache fill failed");
          } else if (!(await cache.match(url))) await cache.add(url);
        })));
        failed = results.filter(result => result.status === "rejected").length;
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
const STATIC_DATA_PATHS = new Set([
  "/data/runtime.json",
  "/data/global-runtime.json",
  "/data/user-release-notes.json",
  "/global-assets/data/global-runtime.json",
  "/global-assets/data/user-release-notes.json",
]);

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

function stableImageUrl(value) {
  const url = new URL(value, self.location.origin);
  if (url.origin !== self.location.origin || !STABLE_IMAGE_RE.test(url.pathname)
    || (url.search && url.search !== "?image-retry=1")) return null;
  url.search = "";
  return url;
}

function isImageResponse(response) {
  return response?.ok && /^image\//i.test(response.headers.get("content-type") ?? "");
}

async function cacheFirstImage(request, { background = false } = {}) {
  const url = stableImageUrl(request.url);
  // A CORS response, a no-CORS response and an explicit recovery request keep
  // separate in-flight entries. Header variants retain their existing meaning.
  const key = JSON.stringify([url.href, new URL(request.url).searchParams.has("image-retry"),
    request.mode ?? "cors", request.credentials ?? "same-origin", request.redirect ?? "follow",
    request.referrer ?? "about:client", request.referrerPolicy ?? "", request.integrity ?? "",
    [...(request.headers ?? [])].sort(([a], [b]) => a.localeCompare(b))]);
  let pending = pendingImages.get(key);
  if (!pending) {
    pending = loadImage(request, background);
    pendingImages.set(key, pending);
  }
  try {
    // Each client owns a body; consuming one response cannot disturb another.
    return (await pending).clone();
  } finally {
    if (pendingImages.get(key) === pending) pendingImages.delete(key);
  }
}

async function loadImage(request, background) {
  const url = stableImageUrl(request.url);
  const key = new Request(url.href, request);
  const retry = new URL(request.url).searchParams.get("image-retry") === "1";
  let cache;
  try {
    cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(key);
    if (!retry && isImageResponse(cached)) return cached;
    if (cached) await cache.delete(key);
  } catch { /* 缓存不可用时仍直接取图。 */ }
  // 图片 ID 固定：换代必须同时换网络 URL，避免把旧 HTTP/CDN 缓存写回新缓存。
  url.searchParams.set("image-cache", IMAGE_VERSION);
  if (retry) url.searchParams.set("image-retry", "1");
  try {
    // An image can serve several windows. Aborting the first requester must not
    // cancel the shared transfer or prevent the other clients filling the cache.
    const networkRequest = new Request(new Request(url.href, request), { signal: null });
    const response = await fetch(networkRequest, { cache: "reload", ...(background ? { priority: "low" } : {}) });
    if (isImageResponse(response) && cache) {
      try { await cache.put(key, response.clone()); }
      catch { /* 存储失败不影响在线图片。 */ }
    }
    return response;
  } catch {
    return Response.error();
  }
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
  let cached = await cache.match(fallbackRequest);
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // 固定静态 JSON 的内容不随 Origin 改变；只兼容单一 Origin 变体，
  // 保留精确 URL/地区隔离，查询参数、授权请求及其他 Vary 均不放宽。
  if (!cached && fallbackRequest === request && url.origin === self.location.origin &&
      !url.search && STATIC_DATA_PATHS.has(url.pathname) && !request.headers.has("authorization") &&
      (origin === null || origin === self.location.origin)) {
    const variant = await cache.match(request, { ignoreVary: true });
    if (variant?.headers.get("vary")?.trim().toLowerCase() === "origin") cached = variant;
  }
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
  // 旧入口直接回到主站，避免离线缓存重新打开已退役的抢先版。
  if (event.request.mode === "navigate" && ["/pre", "/pre/", "/pre/index.html"].includes(url.pathname)) {
    url.pathname = "/";
    event.respondWith(Response.redirect(url.href, 301));
    return;
  }
  // 保留历史资源独立加载，不进入正式版的离线缓存。
  if (url.pathname === "/pre" || url.pathname.startsWith("/pre/")) return;
  // 版本检查必须读到服务器当前 HTML。
  if (url.searchParams.has("build-check")) return;

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

  if (stableImageUrl(url.href)) {
    event.respondWith(cacheFirstImage(event.request));
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
