import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";

const serviceWorkerSource = readFileSync("public/sw.js", "utf8");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

function requestKey(request) {
  return typeof request === "string" ? request : request.url;
}

function createHarness({ cached = {}, fetchImpl } = {}) {
  const listeners = {};
  const stores = new Map();
  const cacheApi = {
    add: vi.fn(),
    addAll: vi.fn(async () => undefined),
    match: vi.fn(async (request) => cached[requestKey(request)]),
    put: vi.fn(async (request, response) => {
      cached[requestKey(request)] = response;
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
    clients: { claim: vi.fn(async () => undefined) },
    location: { origin: "https://calculator.test" },
    skipWaiting: vi.fn(async () => undefined),
  };
  vm.runInNewContext(serviceWorkerSource, {
    URL,
    caches,
    fetch: fetchImpl ?? vi.fn(),
    Promise,
    self,
  });
  return { cacheApi, caches, listeners, self, stores };
}

function dispatchFetch(listener, path, { mode = "cors" } = {}) {
  const background = [];
  let responsePromise;
  listener({
    request: {
      method: "GET",
      mode,
      url: `https://calculator.test${path}`,
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
  test("uses a cache version matching the application release", () => {
    expect(serviceWorkerSource).toContain(
      `const CACHE_NAME = "rock-calculator-webapp-v${packageVersion}"`,
    );
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
