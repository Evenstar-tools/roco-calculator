import { expect, test, vi } from "vitest";
import { loadServerSnapshot } from "../../src/runtime/load-snapshot.js";

const current = { meta: { id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10" }, spirits: [] };

test("Global data has no implicit CN network fallback", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => current }));
  await expect(loadServerSnapshot("global", { fetcher })).rejects.toMatchObject({ code: "SERVER_MISMATCH" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith("/data/global-runtime.json", { signal: undefined });
});

test("CN loader passes cancellation through and verifies release versions before exposing data", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => current }));
  expect(await loadServerSnapshot("cn", { signal: controller.signal, fetcher })).toBe(current);
  expect(fetcher).toHaveBeenCalledWith("/data/runtime.json", { signal: controller.signal });
  for (const meta of [
    { ...current.meta, rulesVersion: "future-rules" },
    { ...current.meta, id: "stale-data" },
    { ...current.meta, serverId: "global" },
  ]) {
    await expect(loadServerSnapshot("cn", { fetcher: async () => ({ ok: true, json: async () => ({ meta }) }) })).rejects.toThrow();
  }
});
