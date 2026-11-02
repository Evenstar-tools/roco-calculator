import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";

const serviceWorkerSource = readFileSync("public/sw.js", "utf8");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

function requestKey(request) {
  return typeof request === "string" ? request : request.url;
}

function createHarness({ cached = {}, cachedRequestHeaders = {}, fetchImpl, clientPaths = ["/"] } = {}) {
  const listeners = {};
  const stores = new Map();
  const match = async (request, { ignoreVary = false } = {}) => {
    const key = requestKey(request);
    const response = cached[key];
    if (!response) return undefined;
    const vary = response.headers.get("vary");
    const requestedHeaders = new Headers(typeof request === "string" ? {} : request.headers);
    const storedHeaders = new Headers(cachedRequestHeaders[key]);
    if (!ignoreVary && vary && vary.split(",").some((header) => {
      const name = header.trim().toLowerCase();
      return name === "*" || requestedHeaders.get(name) !== storedHeaders.get(name);
    })) return undefined;
    return response;
  };
  const cacheApi = {
    add: vi.fn(),
    addAll: vi.fn(async () => undefined),
    delete: vi.fn(async (request) => delete cached[requestKey(request)]),
    match: vi.fn(match),
    put: vi.fn(async (request, response) => {
      cached[requestKey(request)] = response;
      cachedRequestHeaders[requestKey(request)] = typeof request === "string" ? {} : request.headers;
    }),
  };
  const caches = {
    delete: vi.fn(async (key) => stores.delete(key)),
    keys: vi.fn(async () => [...stores.keys()]),
    match: vi.fn(async (request) => cached[requestKey(request)]),
    open: vi.fn(async (key) => {
      stores.set(key, cacheApi);
      return cacheApi;
    }),
  };
  const self = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => clientPaths.map((path) => ({ url: `https://calculator.test${path}` }))),
    },
    location: { origin: "https://calculator.test" },
    skipWaiting: vi.fn(async () => undefined),
  };
  vm.runInNewContext(serviceWorkerSource, {
    URL,
    Request,
    Response,
    caches,
    fetch: fetchImpl ?? vi.fn(),
    Promise,
    self,
  });
  return { cacheApi, caches, listeners, self, stores };
}

function dispatchFetch(listener, path, { mode = "cors", headers = {} } = {}) {
  const background = [];
  let responsePromise;
  listener({
    request: {
      method: "GET",
      mode,
      url: `https://calculator.test${path}`,
      headers: new Headers(headers),
    },
    respondWith(value) {
      responsePromise = Promise.resolve(value);
    },
    waitUntil(value) {
      background.push(Promise.resolve(value));
    },
  });
  return { background, responsePromise };
}

describe("service worker cache policy", () => {
  test.each(["/pre", "/pre/", "/pre/index.html", "/pre?source=pwa&theme=s5", "/pre/?theme=s5", "/pre/index.html?build-check=1"])("retired preview navigation %s redirects without replaying stale preview HTML", async (path) => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const harness = createHarness({ fetchImpl, cached: {
      [path]: new Response("old preview"),
      [`https://calculator.test${path}`]: new Response("old preview"),
      "/": new Response("current root"),
    } });
    const event = dispatchFetch(harness.listeners.fetch, path, { mode: "navigate" });
    const response = await event.responsePromise;
    expect(response?.status).toBe(301);
    const destination = new URL(path, "https://calculator.test");
    destination.pathname = "/";
    expect(response.headers.get("location")).toBe(destination.href);
    expect(event.background).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.caches.open).not.toHaveBeenCalled();
    expect(harness.cacheApi.match).not.toHaveBeenCalled();
    const rootEvent = dispatchFetch(harness.listeners.fetch, destination.pathname + destination.search, { mode: "navigate" });
    if (destination.searchParams.has("build-check")) expect(rootEvent.responsePromise).toBeUndefined();
    else await expect((await rootEvent.responsePromise).text()).resolves.toBe("current root");
  });

  test.each(["/pre", "/pre/", "/pre/index.html", "/pre/redirect.js", "/pre/assets/main-Ab12_cd9.js", "/pre/data/runtime.json"])("preview non-navigation request %s bypasses the stable worker entirely", (path) => {
    const fetchImpl = vi.fn();
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path);
    expect(event.responsePromise).toBeUndefined();
    expect(event.background).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.caches.open).not.toHaveBeenCalled();
  });

  test("similarly named stable paths retain the existing worker policy", async () => {
    const response = new Response("stable path");
    const fetchImpl = vi.fn(async () => response);
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, "/prefix/");
    await expect(event.responsePromise).resolves.toBe(response);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(harness.cacheApi.put).toHaveBeenCalledOnce();
  });
  test("visited asset messages cache lazy resources once and reject external/API/data URLs", async () => {
    const existing = "https://calculator.test/assets/main-Ab12_cd9.js";
    const lazy = "https://calculator.test/assets/GlobalWorkspace-NewBuild.js";
    const globalLazy = "https://calculator.test/global-assets/assets/GlobalWorkspace-NewBuild.js";
    const harness = createHarness({ cached: { [existing]: new Response("existing build") } });
    const reply = vi.fn();
    let caching;
    harness.listeners.message({
      data: { type: "CACHE_VISITED_ASSETS", urls: [existing, lazy, lazy, globalLazy, globalLazy + "#visited",
        "https://external.test/assets/other.js", "https://calculator.test/api/location",
        "https://calculator.test/data/runtime.json", "https://calculator.test/assets/../api/location",
        "https://calculator.test/global-assets/data/global-runtime.json", "https://calculator.test/global-assets/assets/../data/global-runtime.json",
        "https://calculator.test/pre/assets/preview.js",
        "blob:https://calculator.test/assets/module", null, {}] },
      ports: [{ postMessage: reply }],
      waitUntil(value) { caching = value; },
    });
    await caching;
    expect(harness.cacheApi.add.mock.calls).toEqual([[lazy], [globalLazy]]);
    expect(reply).toHaveBeenCalledWith({ type: "VISITED_ASSETS_CACHED", failed: 0 });
  });

  test("visited asset failures settle independently and are reported without disrupting the worker", async () => {
    const harness = createHarness();
    const reply = vi.fn();
    harness.cacheApi.add.mockImplementation(async (url) => {
      if (url.endsWith("missing.js")) throw new Error("offline");
    });
    let caching;
    harness.listeners.message({ data: { type: "CACHE_VISITED_ASSETS", urls: ["/assets/loaded.js", "/assets/missing.js"] },
      ports: [{ postMessage: reply }], waitUntil(value) { caching = value; } });
    await caching;
    expect(harness.cacheApi.add).toHaveBeenCalledTimes(2);
    expect(reply).toHaveBeenCalledWith({ type: "VISITED_ASSETS_CACHED", failed: 1 });
    const waitUntil = vi.fn();
    harness.listeners.message({ data: { type: "OTHER_MESSAGE", urls: [] }, waitUntil });
    harness.listeners.message({ data: { type: "CACHE_VISITED_ASSETS", urls: "not-an-array" }, waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test.each(["/en/", "/jp/", "/global/zh-CN/", "/global/ja/"])("Global first visit to %s caches its isolated shell/assets/runtime", async (shell) => {
    const fetchImpl = vi.fn(async () => new Response('<script src="/global-assets/assets/main-Ab12_cd9.js"></script><link rel="stylesheet" href="/global-assets/assets/main-12345678.css">'));
    const harness = createHarness({ clientPaths: [shell], fetchImpl });
    let install;
    harness.listeners.install({ waitUntil(value) { install = value; } });
    await install;
    expect(fetchImpl).toHaveBeenCalledWith(shell, { cache: "reload" });
    expect(fetchImpl).not.toHaveBeenCalledWith("/", expect.anything());
    expect(harness.cacheApi.add).not.toHaveBeenCalledWith("/data/runtime.json");
    expect(harness.cacheApi.addAll.mock.calls.flat(2)).not.toContain("/data/runtime.json");
    expect(harness.cacheApi.add).toHaveBeenCalledWith("/global-assets/assets/main-Ab12_cd9.js");
    expect(harness.cacheApi.add).toHaveBeenCalledWith("/global-assets/assets/main-12345678.css");
    expect(harness.cacheApi.add).toHaveBeenCalledWith("/global-assets/data/global-runtime.json");
  });

  test("CN first visit still prepares its runtime for offline startup", async () => {
    const harness = createHarness({ fetchImpl: vi.fn(async () => new Response("CN shell")) });
    let install;
    harness.listeners.install({ waitUntil(value) { install = value; } });
    await install;
    expect(harness.cacheApi.add).toHaveBeenCalledWith("/data/runtime.json");
  });

  test("activation removes only obsolete caches owned by this application", async () => {
    const harness = createHarness();
    const current = /const CACHE_NAME = "([^"]+)"/.exec(serviceWorkerSource)[1];
    for (const key of [current, "rock-calculator-webapp-v2.2.5", "another-tool-cache"]) harness.stores.set(key, harness.cacheApi);
    let activation;
    harness.listeners.activate({ waitUntil(value) { activation = value; } });
    await activation;
    expect(harness.caches.delete.mock.calls).toEqual([["rock-calculator-webapp-v2.2.5"]]);
  });

  test.each(["/en/", "/jp/", "/global/zh-CN/", "/global/ja/", "/cn/"])("offline %s returns its own shell", async (path) => {
    const target = new Response(path);
    const harness = createHarness({ cached: { [path]: target, "/": new Response("CN root") }, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, `${path}?source=pwa`, { mode: "navigate" });
    await expect(event.responsePromise).resolves.toBe(target);
  });

  test.each(["/en/", "/jp/"])("Global offline navigation %s cannot return a cached CN shell", async (shell) => {
    const harness = createHarness({ cached: { "/": new Response("CN root") }, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, shell, { mode: "navigate" });
    expect((await event.responsePromise).type).toBe("error");
  });

  test.each([
    ["/global/ja/", "/en/"],
    ["/jp/", "/en/"],
    ["/en/", "/jp/"],
    ["/en/", "/global/zh-CN/"],
    ["/global/zh-CN/", "/global/ja/"],
  ])("offline locale navigation %s can reuse the same-server shell %s", async (path, cachedPath) => {
    const target = new Response("Global shell");
    const harness = createHarness({ cached: { [cachedPath]: target, "/": new Response("CN") }, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, path, { mode: "navigate" });
    await expect(event.responsePromise).resolves.toBe(target);
  });

  test.each(["/cn/", "/", "/global/fr/", "/unknown/"])("offline %s cannot borrow a Global shell", async (path) => {
    const harness = createHarness({ cached: { "/en/": new Response("Global shell") }, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, path, { mode: "navigate" });
    expect((await event.responsePromise).type).toBe("error");
  });

  test("location responses bypass all SW and browser caches", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"countryCode":"JP"}'));
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, "/api/location");
    await event.responsePromise;
    expect(fetchImpl).toHaveBeenCalledWith(expect.objectContaining({ url: "https://calculator.test/api/location" }), { cache: "no-store" });
    expect(harness.caches.open).not.toHaveBeenCalled();
    expect(harness.cacheApi.put).not.toHaveBeenCalled();
  });

  test("uses a cache version matching the application release", () => {
    const cacheName = /const CACHE_NAME = "([^"]+)"/.exec(serviceWorkerSource)?.[1];
    expect(cacheName).toMatch(new RegExp(`^rock-calculator-webapp-v${packageVersion.replaceAll(".", "\\.")}(?:-[a-z0-9-]+)?$`));
  });

  test.each(["/data/runtime.json", "/global-assets/data/global-runtime.json"])("returns cached %s immediately and refreshes it in the background", async (runtime) => {
    let resolveNetwork;
    const cachedResponse = new Response("cached-runtime");
    const networkResponse = new Response("fresh-runtime");
    const fetchImpl = vi.fn(
      () => new Promise((resolve) => {
        resolveNetwork = resolve;
      }),
    );
    const harness = createHarness({
      cached: {
        [`https://calculator.test${runtime}`]: cachedResponse,
      },
      fetchImpl,
    });
    const event = dispatchFetch(
      harness.listeners.fetch,
      runtime,
    );

    await expect(event.responsePromise).resolves.toBe(cachedResponse);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveNetwork(networkResponse);
    await Promise.all(event.background);
    expect(harness.cacheApi.put).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://calculator.test${runtime}`,
      }),
      expect.anything(),
    );
  });

  test("navigation prefers the latest page and only falls back to the cached shell offline", async () => {
    const cachedResponse = new Response("old-page");
    const networkResponse = new Response("new-page");
    const harness = createHarness({
      cached: { "/": cachedResponse },
      fetchImpl: vi.fn(async () => networkResponse),
    });
    const event = dispatchFetch(harness.listeners.fetch, "/", { mode: "navigate" });

    await expect(event.responsePromise).resolves.toBe(networkResponse);
    expect(harness.cacheApi.put).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://calculator.test/" }),
      expect.anything(),
    );
  });

  test("keeps the most recent runtime available when the network fails", async () => {
    const cachedResponse = new Response("cached-runtime");
    const harness = createHarness({
      cached: {
        "https://calculator.test/data/runtime.json": cachedResponse,
      },
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const event = dispatchFetch(
      harness.listeners.fetch,
      "/data/runtime.json",
    );

    await expect(event.responsePromise).resolves.toBe(cachedResponse);
    await expect(Promise.all(event.background)).resolves.toBeDefined();
  });
});


describe("repeat requests and cache failures", () => {
  test.each(["/data/runtime.json", "/data/global-runtime.json", "/data/user-release-notes.json",
    "/global-assets/data/global-runtime.json", "/global-assets/data/user-release-notes.json"])(
    "fixed static JSON %s reuses either Origin variant offline and still refreshes online", async (path) => {
      const key = `https://calculator.test${path}`;
      for (const [savedOrigin, requestOrigin] of [[null, "https://calculator.test"], ["https://calculator.test", null]]) {
        const cachedResponse = new Response("cached static data", { headers: { Vary: "Origin" } });
        const fetchImpl = vi.fn(async () => new Response("latest static data"));
        const harness = createHarness({ cached: { [key]: cachedResponse }, fetchImpl,
          cachedRequestHeaders: { [key]: savedOrigin ? { Origin: savedOrigin } : {} } });
        const event = dispatchFetch(harness.listeners.fetch, path, { headers: requestOrigin ? { Origin: requestOrigin } : {} });
        await expect(event.responsePromise).resolves.toBe(cachedResponse);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        await Promise.all(event.background);
        expect(harness.cacheApi.put).toHaveBeenCalledTimes(1);

        fetchImpl.mockRejectedValue(new Error("offline"));
        const offline = createHarness({ cached: { [key]: cachedResponse }, fetchImpl,
          cachedRequestHeaders: { [key]: savedOrigin ? { Origin: savedOrigin } : {} } });
        const retry = dispatchFetch(offline.listeners.fetch, path, { headers: requestOrigin ? { Origin: requestOrigin } : {} });
        await expect(retry.responsePromise).resolves.toBe(cachedResponse);
        await expect(Promise.all(retry.background)).resolves.toBeDefined();
      }
    });

  test.each([
    ["/data/runtime.json", "Origin, Accept-Language", "https://calculator.test"],
    ["/data/user-release-notes.json", "*", "https://calculator.test"],
    ["/global-assets/data/global-runtime.json", "Origin", "https://external.test"],
    ["/data/runtime.json?user=private", "Origin", "https://calculator.test"],
    ["/data/user-preferences.json", "Origin", "https://calculator.test"],
    ["/data/runtime.json", "Origin", "https://calculator.test", "Bearer private"],
  ])("static data compatibility does not bypass %s with %s from %s", async (path, vary, origin, authorization) => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const harness = createHarness({
      cached: { [`https://calculator.test${path}`]: new Response("isolated data", { headers: { Vary: vary } }) },
      fetchImpl,
    });
    const event = dispatchFetch(harness.listeners.fetch, path, { headers: { Origin: origin,
      ...(authorization ? { Authorization: authorization } : {}) } });
    expect(await event.responsePromise).toBeFalsy();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["/data/runtime.json", "/global-assets/data/global-runtime.json"],
    ["/global-assets/data/global-runtime.json", "/data/runtime.json"],
    ["/data/user-release-notes.json", "/global-assets/data/user-release-notes.json"],
  ])("missing %s cannot borrow the static data cached at %s", async (path, otherPath) => {
    const harness = createHarness({
      cached: { [`https://calculator.test${otherPath}`]: new Response("other region", { headers: { Vary: "Origin" } }) },
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
    });
    const event = dispatchFetch(harness.listeners.fetch, path, { headers: { Origin: "https://calculator.test" } });
    expect(await event.responsePromise).toBeFalsy();
  });

  test.each(["/assets/main-Ab12_cd9.js", "/assets/main-12345678.css", "/global-assets/assets/main-Ab12_cd9.js", "/global-assets/assets/main-12345678.css"])("offline module request reuses the Origin-only precache variant for %s", async (path) => {
    const cachedResponse = new Response("precached build", { headers: { Vary: "Origin" } });
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const harness = createHarness({ cached: { [`https://calculator.test${path}`]: cachedResponse }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path, { headers: { Origin: "https://calculator.test" } });
    await expect(event.responsePromise).resolves.toBe(cachedResponse);
    expect(harness.cacheApi.match.mock.calls).toHaveLength(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    ["/assets/main-Ab12_cd9.js", "Origin, Accept-Language", "https://calculator.test"],
    ["/assets/main-Ab12_cd9.js", "*", "https://calculator.test"],
    ["/assets/main-Ab12_cd9.js", "Origin", "https://external.test"],
    ["/assets/main.js", "Origin", "https://calculator.test"],
    ["/data/user-preferences.json", "Origin", "https://calculator.test"],
  ])("does not bypass Vary for %s with %s from %s", async (path, vary, origin) => {
    const cachedResponse = new Response("different variant", { headers: { Vary: vary } });
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const harness = createHarness({ cached: { [`https://calculator.test${path}`]: cachedResponse }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path, { headers: { Origin: origin } });
    expect(await event.responsePromise).toBeFalsy();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each(["/assets/index-Ab12_cd9.js", "/assets/index-12345678.css", "/global-assets/assets/index-Ab12_cd9.js", "/global-assets/assets/index-12345678.css", "/app-icon-192.png", "/app-icon-512.png"])("serves %s without a redundant network request", async (path) => {
    const cachedResponse = new Response("cached");
    const fetchImpl = vi.fn();
    const harness = createHarness({ cached: { [`https://calculator.test${path}`]: cachedResponse }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path);
    await expect(event.responsePromise).resolves.toBe(cachedResponse);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fetches and stores a previously unseen build asset", async () => {
    const response = new Response("new build");
    const fetchImpl = vi.fn(async () => response);
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, "/assets/index-NewBuild.js");
    await expect(event.responsePromise).resolves.toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.cacheApi.put).toHaveBeenCalledTimes(1);
  });

  test("serves cached stable images without touching the network", async () => {
    const response = new Response("portrait", { headers: { "Content-Type": "image/png" } });
    const fetchImpl = vi.fn();
    const url = "/assets/spirits/spirit_0123456789abcdef.png";
    const harness = createHarness({ cached: { [`https://calculator.test${url}`]: response }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, url);
    await expect(event.responsePromise).resolves.toBe(response);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.caches.open).toHaveBeenCalledWith("rock-calculator-images-__IMAGE_DIGEST__");
  });

  test.each([
    "/assets/skills/skill_0123456789abcdef.png",
    "/global-assets/assets/spirits/spirit_0123456789abcdef.png",
    "/assets/skills/skill_preview_s5_dream-building.png",
    "/global-assets/assets/skills/skill_preview_s5_dream-building.png",
    "/assets/skills/wish-power/7700003.png",
    "/global-assets/assets/skills/wish-power/7700018.png",
  ])("stores %s in the long-lived image cache", async (url) => {
    const fetchImpl = vi.fn(async () => new Response("image", { headers: { "Content-Type": "image/png" } }));
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, url);
    await event.responsePromise;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.caches.open).toHaveBeenCalledWith("rock-calculator-images-__IMAGE_DIGEST__");
    expect(harness.cacheApi.put).toHaveBeenCalledTimes(1);
  });

  test("a new image-cache generation bypasses the old immutable HTTP URL", async () => {
    const path = "/assets/spirits/spirit_0123456789abcdef.png";
    const fetchImpl = vi.fn(async () => new Response("new image", { headers: { "Content-Type": "image/png" } }));
    const harness = createHarness({ fetchImpl });
    await dispatchFetch(harness.listeners.fetch, path).responsePromise;
    expect(fetchImpl).toHaveBeenCalledWith(expect.objectContaining({
      url: `https://calculator.test${path}?image-cache=__IMAGE_DIGEST__`,
    }), { cache: "reload" });
    expect(harness.cacheApi.put.mock.calls[0][0].url).toBe(`https://calculator.test${path}`);
  });

  test("does not keep a successful HTML error response as an image", async () => {
    const path = "/assets/spirits/spirit_0123456789abcdef.png";
    const broken = new Response("error page", { headers: { "Content-Type": "text/html" } });
    const healthy = new Response("image", { headers: { "Content-Type": "image/png" } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(broken).mockResolvedValue(healthy);
    const harness = createHarness({ fetchImpl });
    await dispatchFetch(harness.listeners.fetch, path).responsePromise;
    expect(harness.cacheApi.put).not.toHaveBeenCalled();
    await expect(dispatchFetch(harness.listeners.fetch, path).responsePromise).resolves.toBe(healthy);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test.each([
    "/global-assets/assets/spirits/spirit_0123456789abcdef.png",
    "/assets/skills/skill_preview_s5_dream-building.png",
    "/global-assets/assets/skills/skill_preview_s5_dream-building.png",
    "/assets/skills/wish-power/7700003.png",
    "/global-assets/assets/skills/wish-power/7700018.png",
  ].flatMap(path => ["text/html", "image/png"].map(contentType => [path, contentType])))("explicit retry of %s replaces cached broken %s using one canonical key", async (path, contentType) => {
    const key = `https://calculator.test${path}`;
    const cached = { [key]: new Response("broken", { headers: { "Content-Type": contentType } }) };
    const healthy = new Response("valid image", { headers: { "Content-Type": "image/png" } });
    const fetchImpl = vi.fn(async () => healthy);
    const harness = createHarness({ cached, fetchImpl });
    await expect(dispatchFetch(harness.listeners.fetch, `${path}?image-retry=1`).responsePromise).resolves.toBe(healthy);
    expect(fetchImpl.mock.calls[0][1]).toEqual({ cache: "reload" });
    expect(harness.cacheApi.delete).toHaveBeenCalledWith(expect.objectContaining({ url: key }));
    expect(Object.keys(cached)).toEqual([key]);
    await expect(dispatchFetch(harness.listeners.fetch, path).responsePromise).resolves.toBe(cached[key]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("visited images use the same validated versioned path without replaying recovery requests", async () => {
    const path = "/assets/spirits/spirit_0123456789abcdef.png";
    const fetchImpl = vi.fn(async () => new Response("image", { headers: { "Content-Type": "image/png" } }));
    const harness = createHarness({ fetchImpl });
    let completed;
    const visit = () => harness.listeners.message({
      data: { type: "CACHE_VISITED_ASSETS", urls: [path, `${path}?image-retry=1`] },
      waitUntil(value) { completed = value; },
    });
    visit();
    await completed;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.cacheApi.add).not.toHaveBeenCalled();
    fetchImpl.mockClear();
    visit();
    await completed;
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("returns a network error for an uncached stable image while offline", async () => {
    const harness = createHarness({ fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, "/assets/spirits/spirit_0123456789abcdef.png");
    await expect(event.responsePromise).resolves.toBeInstanceOf(Response);
  });

  test("activation keeps the current image cache across releases and removes older ones", async () => {
    const harness = createHarness();
    for (const key of ["rock-calculator-images-__IMAGE_DIGEST__", "rock-calculator-images-oldversion"]) harness.stores.set(key, harness.cacheApi);
    let activation;
    harness.listeners.activate({ waitUntil(value) { activation = value; } });
    await activation;
    expect(harness.caches.delete.mock.calls).toEqual([["rock-calculator-images-oldversion"]]);
  });

  test("lets build checks reach the server directly", () => {
    const fetchImpl = vi.fn();
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, "/?build-check=123");
    expect(event.responsePromise).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    "/assets/spirits/example.png",
    "/assets/skills/example.png",
    "/assets/skills/skill_preview_s4_example.png",
    "/assets/skills/wish-power/7700006.png",
  ])("still refreshes %s rather than adding arbitrary images to the stable cache", async (path) => {
    const response = new Response("portrait");
    const fetchImpl = vi.fn(async () => new Response("updated portrait"));
    const harness = createHarness({ cached: { [`https://calculator.test${path}`]: response }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path);
    await expect(event.responsePromise).resolves.toBe(response);
    await Promise.all(event.background);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.caches.open).not.toHaveBeenCalledWith("rock-calculator-images-__IMAGE_DIGEST__");
  });

  test("cache quota exhaustion does not discard successful network content", async () => {
    const response = new Response("online page");
    const harness = createHarness({ fetchImpl: vi.fn(async () => response) });
    harness.cacheApi.put.mockRejectedValue(new Error("quota exceeded"));
    const event = dispatchFetch(harness.listeners.fetch, "/", { mode: "navigate" });
    await expect(event.responsePromise).resolves.toBe(response);
  });
});
