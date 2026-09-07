import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

test("预取与打开共用请求，关闭重开复用已解析资料", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, currentSeason: "S4", seasons: [] }) });
  vi.stubGlobal("fetch", fetcher);
  const { loadSkillCatalog, getCachedCatalog } = await import("../../src/features/skill-query/load-catalog.js");
  expect(getCachedCatalog()).toBeNull();
  const first = loadSkillCatalog();
  expect(loadSkillCatalog()).toBe(first);
  const data = await first;
  expect(await loadSkillCatalog()).toBe(data);
  expect(getCachedCatalog()).toBe(data);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("预取失败不污染后续打开与手动重试", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("网络不可用")).mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, currentSeason: "S4", seasons: [] }) });
  vi.stubGlobal("fetch", fetcher);
  const { loadSkillCatalog, getCachedCatalog } = await import("../../src/features/skill-query/load-catalog.js");
  await expect(loadSkillCatalog()).rejects.toThrow("网络不可用");
  expect(getCachedCatalog()).toBeNull();
  await expect(loadSkillCatalog()).resolves.toMatchObject({ currentSeason: "S4" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
