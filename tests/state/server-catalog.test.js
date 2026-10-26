import { afterEach, expect, test, vi } from "vitest";
import { getServerRelease } from "../../src/domain/server-environment.js";
import { getCachedCatalog, loadSkillCatalog } from "../../src/features/skill-query/load-catalog.js";

afterEach(() => vi.unstubAllGlobals());

test("failed CN catalogue can retry; a warm CN cache is never returned for Global", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, ...getServerRelease("cn"), currentSeason: getServerRelease("cn").seasonId, seasons: [{ id: getServerRelease("cn").seasonId, spirits: [], skills: [], relations: [] }] }) });
  vi.stubGlobal("fetch", fetcher);
  await expect(loadSkillCatalog()).rejects.toThrow();
  const [first, second] = await Promise.all([loadSkillCatalog(), loadSkillCatalog()]);
  expect(first).toBe(second);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenLastCalledWith("/data/skill-query/catalog.json");
  expect(getCachedCatalog()).toBe(first);
  expect(getCachedCatalog("global")).toBeNull();
  await expect(loadSkillCatalog("global")).rejects.toMatchObject({ code: "SERVER_DATA_UNVERIFIED" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
