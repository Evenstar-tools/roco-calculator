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
  const match = async (request) => {
    const key = requestKey(request);
    const response = cached[key];
    if (!response) return undefined;
    const vary = response.headers.get("vary");
    const requestedHeaders = new Headers(typeof request === "string" ? {} : request.headers);
    const storedHeaders = new Headers(cachedRequestHeaders[key]);
    if (vary && vary.split(",").some((header) => {
      const name = header.trim().toLowerCase();
      return name === "*" || requestedHeaders.get(name) !== storedHeaders.get(name);
    })) return undefined;
    return response;
  };
  const cacheApi = {
    add: vi.fn(),
    addAll: vi.fn(async () => undefined),
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
  test.each(["/pre", "/pre/", "/pre/?theme=s5", "/pre/assets/main-Ab12_cd9.js", "/pre/data/runtime.json"])("preview request %s bypasses the stable worker entirely", (path) => {
    const fetchImpl = vi.fn();
    const harness = createHarness({ fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path, { mode: "navigate" });
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
    const harness = createHarness({ cached: { [existing]: new Response("existing build") } });
    const reply = vi.fn();
    let caching;
    harness.listeners.message({
      data: { type: "CACHE_VISITED_ASSETS", urls: [existing, lazy, lazy,
        "https://external.test/assets/other.js", "https://calculator.test/api/location",
        "https://calculator.test/data/runtime.json", "https://calculator.test/assets/../api/location",
        "blob:https://calculator.test/assets/module", null, {}] },
      ports: [{ postMessage: reply }],
      waitUntil(value) { caching = value; },
    });
    await caching;
    expect(harness.cacheApi.add.mock.calls).toEqual([[lazy]]);
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

  test("Global first visit caches its own shell and never preloads CN runtime", async () => {
    const fetchImpl = vi.fn(async () => new Response('<script src="/assets/main-Ab12_cd9.js"></script>'));
    const harness = createHarness({ clientPaths: ["/global/ja/"], fetchImpl });
    let install;
    harness.listeners.install({ waitUntil(value) { install = value; } });
    await install;
    expect(fetchImpl).toHaveBeenCalledWith("/global/ja/", { cache: "reload" });
    expect(fetchImpl).not.toHaveBeenCalledWith("/", expect.anything());
    expect(harness.cacheApi.add).not.toHaveBeenCalledWith("/data/runtime.json");
    expect(harness.cacheApi.addAll.mock.calls.flat(2)).not.toContain("/data/runtime.json");
    expect(harness.cacheApi.add).toHaveBeenCalledWith("/assets/main-Ab12_cd9.js");
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

  test.each(["/en/", "/global/zh-CN/", "/global/ja/", "/cn/"])("offline %s returns its own shell", async (path) => {
    const target = new Response(path);
    const harness = createHarness({ cached: { [path]: target, "/": new Response("CN root") }, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, `${path}?source=pwa`, { mode: "navigate" });
    await expect(event.responsePromise).resolves.toBe(target);
  });

  test("Global offline navigation cannot return a cached CN shell", async () => {
    const harness = createHarness({ cached: { "/": new Response("CN root") }, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    const event = dispatchFetch(harness.listeners.fetch, "/en/", { mode: "navigate" });
    expect((await event.responsePromise).type).toBe("error");
  });

  test.each([
    ["/global/ja/", "/en/"],
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

  test("returns cached runtime immediately and refreshes it in the background", async () => {
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
        "https://calculator.test/data/runtime.json": cachedResponse,
      },
      fetchImpl,
    });
    const event = dispatchFetch(
      harness.listeners.fetch,
      "/data/runtime.json",
    );

    await expect(event.responsePromise).resolves.toBe(cachedResponse);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveNetwork(networkResponse);
    await Promise.all(event.background);
    expect(harness.cacheApi.put).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://calculator.test/data/runtime.json",
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
  test.each(["/assets/main-Ab12_cd9.js", "/assets/main-12345678.css"])("offline module request reuses the Origin-only precache variant for %s", async (path) => {
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
    ["/data/runtime.json", "Origin", "https://calculator.test"],
  ])("does not bypass Vary for %s with %s from %s", async (path, vary, origin) => {
    const cachedResponse = new Response("different variant", { headers: { Vary: vary } });
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const harness = createHarness({ cached: { [`https://calculator.test${path}`]: cachedResponse }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, path, { headers: { Origin: origin } });
    expect(await event.responsePromise).toBeFalsy();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each(["/assets/index-Ab12_cd9.js", "/assets/index-12345678.css", "/app-icon-192.png", "/app-icon-512.png"])("serves %s without a redundant network request", async (path) => {
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

  test("still refreshes mutable portraits rather than freezing their contents", async () => {
    const response = new Response("portrait");
    const fetchImpl = vi.fn(async () => new Response("updated portrait"));
    const harness = createHarness({ cached: { "https://calculator.test/assets/spirits/example.png": response }, fetchImpl });
    const event = dispatchFetch(harness.listeners.fetch, "/assets/spirits/example.png");
    await expect(event.responsePromise).resolves.toBe(response);
    await Promise.all(event.background);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("cache quota exhaustion does not discard successful network content", async () => {
    const response = new Response("online page");
    const harness = createHarness({ fetchImpl: vi.fn(async () => response) });
    harness.cacheApi.put.mockRejectedValue(new Error("quota exceeded"));
    const event = dispatchFetch(harness.listeners.fetch, "/", { mode: "navigate" });
    await expect(event.responsePromise).resolves.toBe(response);
  });
});
