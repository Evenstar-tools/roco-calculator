import { describe, expect, test } from "vitest";
import { GLOBAL_LOCALE_KEY, MANUAL_PREFERENCE_KEY, parseRoute, readGlobalLocale, readManualPreference, resolveEntry, routeFor, writeManualPreference } from "../../src/runtime/routes.js";

const cn = { serverId: "cn", locale: "zh-CN" };
const global = { serverId: "global", locale: "en" };

describe("international entry routes", () => {
  test.each([
    ["/cn/", "cn", "zh-CN"],
    ["/dianlu/", "cn", "zh-CN"],
    ["/en/", "global", "en"],
    ["/global/zh-CN/", "global", "zh-CN"],
    ["/global/ja/", "global", "ja"],
  ])("explicit %s cannot be changed by geography, preference or readiness", (pathname, serverId, locale) => {
    expect(parseRoute(pathname)).toEqual({ serverId, locale, explicit: true });
    expect(parseRoute(pathname.slice(0, -1))).toEqual({ serverId, locale, explicit: true });
    expect(resolveEntry({ pathname, preference: global, countryCode: "CN", languages: ["ja"], globalReady: false }))
      .toMatchObject({ serverId, locale, explicit: true, reason: "path", conflict: null });
  });

  test("server and language produce stable entry URLs", () => {
    expect(routeFor("cn", "en")).toBe("/cn/");
    expect(routeFor("global", "en")).toBe("/en/");
    expect(routeFor("global", "zh-CN")).toBe("/global/zh-CN/");
    expect(routeFor("global", "ja")).toBe("/global/ja/");
    expect(routeFor("global", "fr")).toBe("/en/");
  });

  test("old CN shares beat preferences and require confirmation on a Global URL", () => {
    expect(resolveEntry({ hash: "#v1.legacy.payload", preference: global, countryCode: "JP", globalReady: true }))
      .toMatchObject({ ...cn, reason: "legacy-share", conflict: null });
    expect(resolveEntry({ pathname: "/global/ja/", hash: "#v1.legacy.payload" }))
      .toMatchObject({ serverId: "global", locale: "ja", conflict: {
        type: "legacy-cn-share", requested: { serverId: "global", locale: "ja" }, target: cn,
      } });
    expect(resolveEntry({ pathname: "/cn/", hash: "#v1.legacy.payload" }).conflict).toBeNull();
  });

  test("unrecognized share formats and paths are not reinterpreted as international requests", () => {
    expect(resolveEntry({ hash: "#v2.unknown", countryCode: "JP", globalReady: true }))
      .toMatchObject({ ...cn, reason: "unrecognized-share" });
    expect(resolveEntry({ pathname: "/something", countryCode: "JP", globalReady: true }))
      .toMatchObject({ ...cn, reason: "unrecognized-path" });
  });

  test("v2 shares identify the server independently of language and never enable automatic routing", () => {
    const globalShare = "#v2.global.ja.e30.000000000000";
    const cnShare = "#v2.cn.zh-CN.e30.000000000000";
    expect(resolveEntry({ hash: globalShare, preference: cn, globalReady: false }))
      .toMatchObject({ serverId: "global", locale: "ja", reason: "share", conflict: null });
    expect(resolveEntry({ pathname: "/en/", hash: globalShare }))
      .toMatchObject({ serverId: "global", locale: "en", reason: "path", conflict: null });
    expect(resolveEntry({ pathname: "/cn/", hash: globalShare }))
      .toMatchObject({ ...cn, conflict: { type: "server-share", target: { serverId: "global", locale: "ja" } } });
    expect(resolveEntry({ pathname: "/global/ja/", hash: cnShare }))
      .toMatchObject({ serverId: "global", locale: "ja", conflict: { type: "server-share", target: cn } });
    expect(resolveEntry({ countryCode: "JP", languages: ["ja"], globalReady: false }))
      .toMatchObject({ ...cn, reason: "auto-global-unavailable" });
  });

  test("explicit manual choices precede legacy data and readiness; legacy data precedes automatic inference", () => {
    expect(resolveEntry({ preference: global, hasLegacyCnData: true, globalReady: false }))
      .toMatchObject({ ...global, reason: "preference" });
    expect(resolveEntry({ hasLegacyCnData: true, countryCode: "JP", globalReady: true }))
      .toMatchObject({ ...cn, reason: "legacy-data" });
    expect(resolveEntry({ preference: cn, countryCode: "JP", globalReady: true }))
      .toMatchObject({ ...cn, reason: "preference" });
  });

  test("country selects server while browser preference independently selects Global language", () => {
    expect(resolveEntry({ countryCode: "US", languages: ["ja-JP", "en"], globalReady: true }))
      .toMatchObject({ serverId: "global", locale: "ja", reason: "country" });
    expect(resolveEntry({ countryCode: "jp", languages: ["zh-TW"], globalReady: true }))
      .toMatchObject({ serverId: "global", locale: "zh-CN", reason: "country" });
    expect(resolveEntry({ countryCode: "CN", languages: ["en"], globalReady: true }))
      .toMatchObject({ ...cn, reason: "country" });
  });

  test("unknown country falls back to language but unverified Global is never selected automatically", () => {
    expect(resolveEntry({ countryCode: "ZZ", languages: ["ja-JP"], globalReady: true }))
      .toMatchObject({ serverId: "global", locale: "ja", reason: "language" });
    expect(resolveEntry({ languages: ["zh-CN"], globalReady: true })).toMatchObject(cn);
    expect(resolveEntry({ countryCode: "US", languages: ["en"], globalReady: false }))
      .toMatchObject({ ...cn, reason: "auto-global-unavailable" });
    expect(resolveEntry({ languages: ["fr"], globalReady: true })).toMatchObject(global);
  });

  test("only manual writes persist preferences; automatic and shared visits leave them intact", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    expect(readManualPreference(storage)).toBeNull();
    resolveEntry({ languages: ["ja"], globalReady: true });
    expect(values.size).toBe(0);
    expect(writeManualPreference(global, storage)).toBe(true);
    resolveEntry({ hash: "#v1.legacy", preference: readManualPreference(storage) });
    expect(readManualPreference(storage)).toEqual(global);
    expect([...values.keys()]).toEqual([MANUAL_PREFERENCE_KEY, GLOBAL_LOCALE_KEY]);
    expect(writeManualPreference({ serverId: "global", locale: "invalid" }, storage)).toBe(false);
    expect(readManualPreference(storage)).toEqual(global);
    storage.setItem(MANUAL_PREFERENCE_KEY, "bad-json");
    expect(readManualPreference(storage)).toBeNull();
    const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
    expect(readManualPreference(unavailable)).toBeNull();
    expect(writeManualPreference(cn, unavailable)).toBe(false);
  });

  test("manual Global language survives a CN server selection without changing the next server", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    writeManualPreference({ serverId: "global", locale: "ja" }, storage);
    writeManualPreference(cn, storage);
    expect(readGlobalLocale(storage)).toBe("ja");
    expect(readManualPreference(storage)).toEqual(cn);
    expect(resolveEntry({ preference: readManualPreference(storage) })).toMatchObject(cn);
  });
});
