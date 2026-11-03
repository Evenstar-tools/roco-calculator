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


test("completed snapshots are immutable, reused and isolated across concurrent servers", async () => {
  const releases = {
    cn: { meta: { ...current.meta, serverId: "cn" }, spirits: [{ id: "cn-only", types: ["火"] }] },
    global: { meta: { serverId: "global", id: "global-s3-midseason-2026-08-13", rulesVersion: "global-s3-midseason-2026-08-13" }, spirits: [{ id: "global-only" }] },
  };
  const fetcher = vi.fn(async (url) => ({ ok: true, json: async () => url.includes("global-runtime") ? releases.global : releases.cn }));
  const [cn, global] = await Promise.all([loadServerSnapshot("cn", { fetcher }), loadServerSnapshot("global", { fetcher })]);
  expect(await loadServerSnapshot("cn", { fetcher })).toBe(cn);
  expect(await loadServerSnapshot("global", { fetcher })).toBe(global);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(() => { cn.spirits[0].types[0] = "水"; }).toThrow(TypeError);
  expect(global.spirits[0].id).toBe("global-only");
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(loadServerSnapshot("cn", { fetcher, signal: cancelled.signal })).rejects.toMatchObject({ name: "AbortError" });
});

test("failed and cancelled snapshot loads do not poison a later retry", async () => {
  const controller = new AbortController();
  let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  const json = vi.fn(() => delayed);
  const source = structuredClone(current);
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ ok: true, json })
    .mockResolvedValue({ ok: true, json: async () => source });
  await expect(loadServerSnapshot("cn", { fetcher })).rejects.toThrow("offline");
  const pending = loadServerSnapshot("cn", { fetcher, signal: controller.signal });
  await vi.waitFor(() => expect(json).toHaveBeenCalled());
  controller.abort();
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish(source);
  await rejected;
  expect(await loadServerSnapshot("cn", { fetcher })).toBe(source);
  expect(await loadServerSnapshot("cn", { fetcher })).toBe(source);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
