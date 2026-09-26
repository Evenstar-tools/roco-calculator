import { describe, expect, test, vi } from "vitest";
import { createMetrics } from "../../src/analytics/metrics-core.js";
import { filterRumRequest } from "../../src/analytics/rum.js";

function harness(overrides = {}) {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const send = vi.fn();
  const loadTransport = vi.fn(async () => ({ send }));
  let clock = 1000;
  let sequence = 0;
  const options = { enabled: true, storage: () => storage, now: () => clock, uuid: () => `uuid-${++sequence}`, loadTransport, ...overrides };
  return { metrics: createMetrics(options), options, send, loadTransport, advance: (ms) => { clock += ms; } };
}

describe("visitor metrics", () => {
  test("disabled collection never touches storage or loads the SDK", async () => {
    const storage = vi.fn();
    const h = harness({ enabled: false, storage });
    await h.metrics.start();
    h.metrics.track("download_click", "desktop");
    h.metrics.activity();
    expect(storage).not.toHaveBeenCalled();
    expect(h.loadTransport).not.toHaveBeenCalled();
  });

  test("starts once and distinguishes a page view from a session", async () => {
    const h = harness();
    await Promise.all([h.metrics.start(), h.metrics.start()]);
    expect(h.send.mock.calls.map(([event]) => event.name)).toEqual(["session_start", "page_view", "feature_view"]);
    const secondPage = createMetrics(h.options);
    await secondPage.start();
    expect(h.send.mock.calls.map(([event]) => event.name)).toEqual(["session_start", "page_view", "feature_view", "page_view", "feature_view"]);
    expect(h.loadTransport.mock.calls[0][0].visitorId).toBe(h.loadTransport.mock.calls[1][0].visitorId);
  });

  test("activity extends a session; 30 minutes of inactivity starts another", async () => {
    const h = harness();
    await h.metrics.start();
    h.advance(29 * 60 * 1000);
    h.metrics.activity();
    h.advance(29 * 60 * 1000);
    h.metrics.track("feature_view", "skills");
    expect(h.send.mock.calls.filter(([event]) => event.name === "session_start")).toHaveLength(1);
    h.advance(30 * 60 * 1000);
    h.metrics.track("download_click", "desktop");
    expect(h.send.mock.calls.filter(([event]) => event.name === "session_start")).toHaveLength(2);
  });

  test("allows only known events and fixed feature names", async () => {
    const h = harness();
    await h.metrics.start();
    h.send.mockClear();
    h.metrics.track("some-private-input", "calculator");
    h.metrics.track("feature_view", "private-team-name");
    h.metrics.track("lineup_use", "teams", { secret: "must not leave the browser" });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(Object.keys(h.send.mock.calls[0][0]).sort()).toEqual(["at", "feature", "id", "name", "sessionId"]);
  });

  test("storage denial and SDK failure cannot break calculations", async () => {
    const h = harness({ storage: () => { throw new Error("denied"); }, loadTransport: async () => { throw new Error("offline"); } });
    await expect(h.metrics.start()).resolves.toBeUndefined();
    expect(() => h.metrics.track("calculation_ready")).not.toThrow();
  });

  test("filters unwanted SDK traffic and removes full source URLs", () => {
    expect(filterRumRequest({ url: "https://rumt-zh.com/collect" })).toBe(false);
    expect(filterRumRequest({ url: "https://rumt-zh.com/speed" })).toBe(false);
    const result = filterRumRequest({ url: "https://rumt-zh.com/collect/pv?originFrom=https%3A%2F%2Frococalc.top%2F%3Fsecret%3D1&referer=secret" });
    expect(result.url).not.toContain("secret");
    expect(new URL(result.url).searchParams.get("from")).toBe("https://rococalc.top/");
  });
});

test("route changes count one view per transition including browser back", async () => {
  const h = harness({ initialFeature: "deer" });
  await h.metrics.start();
  h.metrics.route("deer");
  h.metrics.route("calculator");
  h.metrics.route("calculator");
  h.metrics.route("deer");
  h.metrics.route("private-query");
  expect(h.send.mock.calls.filter(([e]) => e.name === "page_view").map(([e]) => e.feature)).toEqual(["deer", "calculator", "deer"]);
  expect(h.send.mock.calls.filter(([e]) => e.name === "feature_view")).toHaveLength(3);
  expect(h.send.mock.calls.filter(([e]) => e.name === "session_start")).toHaveLength(1);
});
