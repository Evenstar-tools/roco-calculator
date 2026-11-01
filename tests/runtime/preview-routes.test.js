import { afterEach, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test("preview direct paths and share links stay in the CN preview despite a Global preference", async () => {
  vi.stubEnv("MODE", "pre");
  vi.resetModules();
  const { resolveEntry, routeFor } = await import("../../src/runtime/routes.js");
  const { previewRoute, unprefixedRoute } = await import("../../src/runtime/preview-channel.js");
  for (const pathname of ["/pre", "/pre/", "/pre/dianlu/"]) {
    expect(resolveEntry({ pathname, preference: { serverId: "global", locale: "en" } })).toMatchObject({ serverId: "cn", explicit: true });
  }
  expect(routeFor("cn")).toBe("/pre/");
  expect(previewRoute("/dianlu/")).toBe("/pre/dianlu/");
  expect(unprefixedRoute("/pre/dianlu/")).toBe("/dianlu/");
  expect(unprefixedRoute("/prefix/")).toBe("/prefix/");
  expect(routeFor("global", "en")).toBe("/en/");
});

test("ordinary builds preserve formal routes and the S4 default", async () => {
  vi.stubEnv("MODE", "production");
  vi.resetModules();
  const { routeFor } = await import("../../src/runtime/routes.js");
  const { previewRoute } = await import("../../src/runtime/preview-channel.js");
  const { resolveSeasonThemeId } = await import("../../src/theme/season-themes.js");
  expect(routeFor("cn")).toBe("/cn/");
  expect(previewRoute("/dianlu/")).toBe("/dianlu/");
  expect(resolveSeasonThemeId({ serverId: "cn" })).toBe("s4");
});

test("preview defaults to S5 appearance without claiming S5 calculation data", async () => {
  vi.stubEnv("MODE", "pre");
  vi.resetModules();
  const { resolveSeasonThemeId } = await import("../../src/theme/season-themes.js");
  const { getServerRelease } = await import("../../src/domain/server-environment.js");
  expect(resolveSeasonThemeId({ serverId: "cn" })).toBe("s5");
  expect(getServerRelease("cn").dataVersion).toBe("s4-2026-09-10");
});


test("preview build config defaults to its isolated channel without a CLI mode flag", async () => {
  const config = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
    'import config from "./config/vite.preview.config.mjs"; process.stdout.write(JSON.stringify({mode: config.mode, base: config.base, build: {rollupOptions: {input: config.build.rollupOptions.input}}}));'],
  { cwd: process.cwd(), encoding: "utf8" }));
  expect(config.mode).toBe("pre");
  expect(config.base).toBe("/pre/");
  expect(Object.keys(config.build.rollupOptions.input)).toEqual(["main", "deer"]);
  expect(config.build.rollupOptions.input.main.replaceAll("\\", "/")).toMatch(/\/pre\/index\.html$/u);
});


test("formal S5 builds keep CN routes and saved calculation versions while selecting S5 artwork", async () => {
  vi.stubEnv("MODE", "cn");
  vi.resetModules();
  const { routeFor } = await import("../../src/runtime/routes.js");
  const { IS_PREVIEW_BUILD, IS_S5_CN_BUILD } = await import("../../src/runtime/preview-channel.js");
  const { resolveSeasonThemeId } = await import("../../src/theme/season-themes.js");
  const { getServerRelease } = await import("../../src/domain/server-environment.js");
  expect(IS_PREVIEW_BUILD).toBe(false);
  expect(IS_S5_CN_BUILD).toBe(true);
  expect(routeFor("cn")).toBe("/cn/");
  expect(routeFor("global", "ja")).toBe("/jp/");
  expect(resolveSeasonThemeId({ serverId: "cn" })).toBe("s5");
  expect(resolveSeasonThemeId({ serverId: "cn", preference: "s3" })).toBe("s3");
  expect(resolveSeasonThemeId({ serverId: "global" })).toBe("s3");
  expect(getServerRelease("cn").dataVersion).toBe("s4-2026-09-10");
  const { POPULAR_CONFIG_COUNT } = await import("../../src/data/preset-metadata.js");
  const { buildS5PopularConfigLibrary } = await import("../../scripts/s5-preview-presets.mjs");
  expect(POPULAR_CONFIG_COUNT).toBe(buildS5PopularConfigLibrary().entryCount);
});

test("formal CN build includes S5 data and presets without mounting the preview or Global entry", () => {
  const config = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
    'import c from "./config/vite.cn.config.mjs"; process.stdout.write(JSON.stringify({mode:c.mode,base:c.base,input:c.build.rollupOptions.input,plugins:c.plugins.flat().map(p=>p.name)}));'],
  { cwd: process.cwd(), encoding: "utf8" }));
  expect(config.mode).toBe("cn");
  expect(config.base).toBe("/");
  expect(Object.keys(config.input)).toEqual(["main", "deer", "china"]);
  expect(config.input.main.replaceAll("\\", "/")).not.toContain("/pre/");
  expect(config.plugins).toEqual(expect.arrayContaining(["s5-bwiki-runtime", "s5-preview-presets", "cn-production-pruning"]));
});
