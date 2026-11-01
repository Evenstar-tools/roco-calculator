import { afterEach, expect, test, vi } from "vitest";
import { USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test.each(["/", "/pre/", "/global-assets/"])("history requests share a successful cache under %s", async base => {
  vi.resetModules();
  vi.stubEnv("BASE_URL", base);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => USER_RELEASE_NOTES });
  vi.stubGlobal("fetch", fetch);
  const { loadUserReleaseHistory, getCachedUserReleaseHistory } = await import("../../src/data/load-user-release-history.js");
  expect(getCachedUserReleaseHistory()).toBeNull();
  const first = loadUserReleaseHistory();
  expect(loadUserReleaseHistory()).toBe(first);
  expect(await first).toEqual(USER_RELEASE_NOTES);
  expect(getCachedUserReleaseHistory()).toBe(USER_RELEASE_NOTES);
  expect(await loadUserReleaseHistory()).toBe(USER_RELEASE_NOTES);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`${base}data/user-release-notes.json`);
});

test("HTTP and malformed history failures are not cached and can be retried", async () => {
  vi.resetModules();
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => USER_RELEASE_NOTES });
  vi.stubGlobal("fetch", fetch);
  const { loadUserReleaseHistory, getCachedUserReleaseHistory } = await import("../../src/data/load-user-release-history.js");
  await expect(loadUserReleaseHistory()).rejects.toThrow("版本记录加载失败");
  await expect(loadUserReleaseHistory()).rejects.toThrow("版本记录加载失败");
  expect(getCachedUserReleaseHistory()).toBeNull();
  expect(await loadUserReleaseHistory()).toEqual(USER_RELEASE_NOTES);
  expect(fetch).toHaveBeenCalledTimes(3);
});
