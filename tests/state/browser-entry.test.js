// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest";
import { browserEntry, startWebEntry } from "../../src/runtime/browser-entry.js";
import { MANUAL_PREFERENCE_KEY } from "../../src/runtime/routes.js";
import { legacyStorageKey } from "../../src/state/storage-namespace.js";
import { onRequestGet } from "../../edge-functions/api/location.js";

function visit({ path = "/", languages = ["en-US"], values = {}, state = null, protocol = "https:" } = {}) {
  const url = new URL(path, "https://calculator.test");
  const stored = new Map(Object.entries(values));
  const browser = {
    location: { protocol, pathname: url.pathname, search: url.search, hash: url.hash, replace: vi.fn() },
    navigator: { languages }, history: { state },
    localStorage: {
      getItem: vi.fn((key) => stored.get(key) ?? null),
      setItem: vi.fn((key, value) => stored.set(key, value)),
      removeItem: vi.fn((key) => stored.delete(key)),
    },
  };
  return { browser, stored, mount: vi.fn() };
}

const countryResponse = (countryCode) => ({ ok: true, json: async () => ({ countryCode }) });
const preference = (serverId, locale) => JSON.stringify({ serverId, locale });
afterEach(() => vi.useRealTimers());

describe("automatic entry before mounting a calculator", () => {
  test.each([
    ["CN", ["en-US"], null, "cn", "zh-CN"],
    ["JP", ["ja-JP", "en-US"], "/jp/", "global", "ja"],
    ["US", ["en-US"], "/en/", "global", "en"],
    ["HK", ["zh-HK", "en-US"], "/global/zh-CN/", "global", "zh-CN"],
    ["US", ["ja-JP"], "/jp/", "global", "ja"],
  ])("%s chooses the server while %j chooses the language", async (country, languages, target, serverId, locale) => {
    const { browser, mount, stored } = visit({ path: "/?source=entry", languages });
    let resolveCountry;
    const fetchImpl = vi.fn(() => new Promise((resolve) => { resolveCountry = resolve; }));
    const starting = startWebEntry(mount, { browser, fetchImpl });
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    expect(browser.location.replace).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith("/api/location", expect.objectContaining({
      cache: "no-store", credentials: "omit", signal: expect.any(AbortSignal),
    }));
    resolveCountry(countryResponse(country));
    await starting;
    if (target) {
      expect(browser.location.replace).toHaveBeenCalledExactlyOnceWith(`${target}?source=entry`);
      expect(mount).not.toHaveBeenCalled();
    } else {
      expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId, locale, reason: "country" }));
      expect(browser.location.replace).not.toHaveBeenCalled();
    }
    expect(stored.size).toBe(0);
    expect(browser.localStorage.setItem).not.toHaveBeenCalled();
    expect(browser.localStorage.removeItem).not.toHaveBeenCalled();
  });

  test.each([
    ["explicit CN", { path: "/cn/?keep=1", languages: ["ja"] }, "cn", null],
    ["explicit deer", { path: "/dianlu/", languages: ["en"] }, "cn", null],
    ["legacy CN share", { path: "/?keep=1#v1.legacy.payload", languages: ["ja"] }, "cn", null],
    ["Global share", { path: "/?keep=1#v2.global.ja.e30.000000000000" }, "global", "/jp/?keep=1#v2.global.ja.e30.000000000000"],
    ["unknown share", { path: "/#v2.unknown", languages: ["ja"] }, "cn", null],
    ["unknown path", { path: "/unknown/", languages: ["ja"] }, "cn", null],
    ["CN manual choice", { values: { [MANUAL_PREFERENCE_KEY]: preference("cn", "zh-CN") } }, "cn", null],
    ["Global manual choice", { values: { [MANUAL_PREFERENCE_KEY]: preference("global", "ja") } }, "global", "/jp/"],
    ["Back to CN", { state: { rocoEntry: { serverId: "cn", locale: "zh-CN" } }, values: { [MANUAL_PREFERENCE_KEY]: preference("global", "ja") } }, "cn", null],
  ])("%s skips geography and preserves the selected entry", async (_label, options, serverId, target) => {
    const { browser, mount } = visit(options);
    const fetchImpl = vi.fn();
    await startWebEntry(mount, { browser, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    if (target) {
      expect(browser.location.replace).toHaveBeenCalledExactlyOnceWith(target);
      expect(mount).not.toHaveBeenCalled();
    } else {
      expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId }));
      expect(browser.location.replace).not.toHaveBeenCalled();
    }
    expect(browser.localStorage.setItem).not.toHaveBeenCalled();
  });

  test.each(["teams.v1", "spirit-configs.v2", "spirit-configs.v1", "favorites.v1", "calculator.session.v1"])(
    "protects %s in current, server and legacy storage without migrating it", async (suffix) => {
      for (const key of [`rock-calculator.${suffix}`, `rock-calculator.servers.cn.${suffix}`, legacyStorageKey(suffix)]) {
        const { browser, mount, stored } = visit({ values: { [key]: "saved-or-recoverable-user-data" } });
        const fetchImpl = vi.fn();
        await startWebEntry(mount, { browser, fetchImpl });
        expect(fetchImpl, key).not.toHaveBeenCalled();
        expect(mount, key).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "cn", reason: "legacy-data" }));
        expect([...stored.entries()]).toEqual([[key, "saved-or-recoverable-user-data"]]);
        expect(browser.localStorage.setItem).not.toHaveBeenCalled();
        expect(browser.localStorage.removeItem).not.toHaveBeenCalled();
      }
    },
  );

  test("display settings and Global data alone do not classify a new visitor as a CN user", async () => {
    const { browser, mount } = visit({ values: {
      "rock-calculator.first-run-guide.v1": "1",
      "rock-calculator.servers.cn.settings.season-theme.v1": "s4",
      "rock-calculator.settings.theme.v1": "dark",
      "rock-calculator.servers.global.calculator.session.v1": "Global draft",
    } });
    const fetchImpl = vi.fn(async () => countryResponse("US"));
    await startWebEntry(mount, { browser, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(browser.location.replace).toHaveBeenCalledExactlyOnceWith("/en/");
    expect(mount).not.toHaveBeenCalled();
  });

  test.each([["/en/", "en"], ["/jp/", "ja"], ["/global/zh-CN/", "zh-CN"]])(
    "canonical %s mounts once without a redirect loop or geography request", async (path, locale) => {
      const { browser, mount } = visit({ path: `${path}?keep=1#retained` });
      const fetchImpl = vi.fn();
      await startWebEntry(mount, { browser, fetchImpl });
      expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "global", locale }));
      expect(browser.location.replace).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  test("Japanese alias preserves query and fragment when replacing its URL", async () => {
    const { browser, mount } = visit({ path: "/global/ja/?keep=1#retained" });
    const fetchImpl = vi.fn();
    await startWebEntry(mount, { browser, fetchImpl });
    expect(browser.location.replace).toHaveBeenCalledExactlyOnceWith("/jp/?keep=1#retained");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
  });

  test("desktop stays CN without geography or a document navigation", async () => {
    const { browser, mount } = visit({ protocol: "app:", languages: ["ja"], values: { [MANUAL_PREFERENCE_KEY]: preference("global", "ja") } });
    const fetchImpl = vi.fn();
    await startWebEntry(mount, { browser, fetchImpl });
    expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "cn" }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(browser.location.replace).not.toHaveBeenCalled();
  });

  test("browserEntry keeps its historical synchronous default until automatic routing is explicitly requested", () => {
    const { browser } = visit({ languages: ["ja"] });
    expect(browserEntry({ browser })).toMatchObject({ serverId: "cn", reason: "auto-global-unavailable" });
    expect(browserEntry({ browser, globalReady: true })).toMatchObject({ serverId: "global", locale: "ja" });
  });
});

describe("unavailable or changing geography", () => {
  test.each([
    ["HTTP error", async () => ({ ok: false, json: vi.fn() })],
    ["malformed JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } })],
    ["network failure", async () => { throw new Error("offline"); }],
    ["unknown country", async () => countryResponse("ZZ")],
    ["absent country", async () => countryResponse(null)],
  ])("%s uses the browser language without persisting an inferred choice", async (_label, response) => {
    const { browser, mount } = visit({ languages: ["ja-JP"] });
    await startWebEntry(mount, { browser, fetchImpl: vi.fn(response) });
    expect(browser.location.replace).toHaveBeenCalledExactlyOnceWith("/jp/");
    expect(mount).not.toHaveBeenCalled();
    expect(browser.localStorage.setItem).not.toHaveBeenCalled();
  });

  test("800 ms timeout mounts the language fallback once and ignores a late overseas result", async () => {
    vi.useFakeTimers();
    const { browser, mount } = visit({ languages: ["zh-CN"] });
    let resolveCountry;
    const fetchImpl = vi.fn(() => new Promise((resolve) => { resolveCountry = resolve; }));
    const starting = startWebEntry(mount, { browser, fetchImpl });
    await vi.advanceTimersByTimeAsync(799);
    expect(mount).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await starting;
    expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "cn", reason: "language" }));
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    resolveCountry(countryResponse("JP"));
    await Promise.resolve();
    await Promise.resolve();
    expect(mount).toHaveBeenCalledOnce();
    expect(browser.location.replace).not.toHaveBeenCalled();
  });

  test("a user's explicit navigation during the request beats its eventual result", async () => {
    const { browser, mount } = visit();
    let resolveCountry;
    const starting = startWebEntry(mount, { browser, fetchImpl: () => new Promise((resolve) => { resolveCountry = resolve; }) });
    await Promise.resolve();
    browser.location.pathname = "/cn/";
    resolveCountry(countryResponse("JP"));
    await starting;
    expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "cn", reason: "path" }));
    expect(browser.location.replace).not.toHaveBeenCalled();
  });

  test("blocked storage still permits geography and leaves browser history available", async () => {
    const { browser, mount } = visit({ state: { rocoEntry: { serverId: "cn", locale: "zh-CN" } } });
    browser.localStorage.getItem.mockImplementation(() => { throw new Error("blocked"); });
    const fetchImpl = vi.fn(async () => countryResponse("US"));
    await startWebEntry(mount, { browser, fetchImpl });
    expect(mount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "cn", reason: "preference" }));
    expect(fetchImpl).not.toHaveBeenCalled();
    browser.history.state = null;
    mount.mockClear();
    await startWebEntry(mount, { browser, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(browser.location.replace).toHaveBeenCalledExactlyOnceWith("/en/");
    expect(mount).not.toHaveBeenCalled();
  });
});

describe("same-origin EdgeOne country response", () => {
  test("returns only coarse country and makes the result private and uncacheable", async () => {
    const response = onRequestGet({ request: { eo: { geo: { countryCodeAlpha2: "jp", cityName: "private-city" }, clientIp: "192.0.2.1" } } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ countryCode: "JP" });
  });

  test.each([undefined, null, "", "XX", "ZZ", "JPN", 123, { country: "JP" }])(
    "unavailable or invalid edge country %j is unknown instead of CN", async (countryCodeAlpha2) => {
      const response = onRequestGet({ request: { eo: { geo: { countryCodeAlpha2 } } } });
      expect(await response.json()).toEqual({ countryCode: null });
    },
  );

  test("untrusted request headers cannot supply a missing edge country", async () => {
    const response = onRequestGet({ request: { headers: new Headers({ "x-country-code": "JP", "cf-ipcountry": "US" }) } });
    expect(await response.json()).toEqual({ countryCode: null });
  });
});
