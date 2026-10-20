// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createServerStorage, serverStorageKey } from "../../src/state/server-storage.js";
import { spiritConfigsRepository, SPIRIT_CONFIG_STORAGE_KEY } from "../../src/state/spirit-configs.js";
import { teamPresetsRepository } from "../../src/state/team-presets.js";
import { favoritesRepository } from "../../src/state/favorites.js";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test("only CN migrates unlabelled keys, preserving the exact original and unknown entity data", () => {
  const legacyKey = "rock-calculator.spirit-configs.v2";
  const raw = JSON.stringify({ schemaVersion: 2, configs: { future: { spiritId: "future", skills: { four: ["unknown-skill"], single: null }, futureField: { value: 7 } } } });
  localStorage.setItem(legacyKey, raw);
  expect(createServerStorage("global").getItem(legacyKey)).toBeNull();
  const repository = spiritConfigsRepository();
  const restored = repository.load({ spirits: [], skills: [] });
  expect(restored.configs.future).toMatchObject({ spiritId: "future", needsRepair: true, futureField: { value: 7 } });
  repository.replace(restored);
  expect(JSON.parse(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).configs.future.skills.four).toEqual(["unknown-skill"]);
  expect(localStorage.getItem(legacyKey)).toBe(raw);
  expect(createServerStorage("global").getItem(legacyKey)).toBeNull();
});

test("unknown skill references are retained before a known spirit's slot normalization", () => {
  const config = { spiritId: "known", skills: { four: ["a", "b", "c", "d", "future-slot"], single: "a" }, extra: { preserved: true } };
  localStorage.setItem("rock-calculator.spirit-configs.v2", JSON.stringify({ schemaVersion: 2, configs: { known: config } }));
  const repository = spiritConfigsRepository();
  const snapshot = { spirits: [{ id: "known" }], skills: ["a", "b", "c", "d"].map(id => ({ id })) };
  const restored = repository.load(snapshot);
  expect(restored.configs.known).toMatchObject({ ...config, needsRepair: true });
  repository.replace(restored, snapshot);
  expect(repository.load(snapshot).configs.known.skills.four).toEqual(config.skills.four);
});

test("scope is fixed per adapter across refreshes, clear does not revive legacy or erase another server", () => {
  const key = "rock-calculator.teams.v1";
  localStorage.setItem(key, "legacy-cn");
  const cn = createServerStorage("cn");
  const global = createServerStorage("global");
  expect(cn.getItem(key)).toBe("legacy-cn");
  global.setItem(key, "global-archive");
  expect(createServerStorage("cn").getItem(key)).toBe("legacy-cn");
  cn.clear();
  expect(createServerStorage("cn").getItem(key)).toBeNull();
  expect(global.getItem(key)).toBe("global-archive");
  expect(localStorage.getItem(key)).toBe("legacy-cn");
  expect(global.length).toBe(1);
  expect(global.key(0)).toBe(key);
});

test("unknown servers and foreign keys or snapshots reject; Global empty directories use their own repositories", () => {
  expect(() => createServerStorage("other")).toThrow(expect.objectContaining({ code: "UNKNOWN_SERVER" }));
  expect(() => createServerStorage("global", createServerStorage("cn"))).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  expect(() => createServerStorage("global").getItem(serverStorageKey("cn", "teams.v1"))).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  for (const factory of [spiritConfigsRepository, teamPresetsRepository]) {
    expect(() => factory({ serverId: "global" }).load({ spirits: [], skills: [] })).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
    expect(() => factory({ serverId: "global" }).load({ meta: { serverId: "global", id: null, rulesVersion: null }, spirits: [], skills: [] })).not.toThrow();
    expect(() => factory().load({ meta: { serverId: "global" }, spirits: [], skills: [] })).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  }
  favoritesRepository().save({ id: "cn-only", kind: "spirit", spiritId: "cn-id" });
  expect(favoritesRepository(undefined, { serverId: "global" }).list()).toEqual([]);
});

test("migration quota failures retain the original and report failure; overwrites retain a recovery copy", () => {
  const key = "rock-calculator.favorites.v1";
  localStorage.setItem(key, "original");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  expect(() => createServerStorage("cn").getItem(key)).toThrow(expect.objectContaining({ code: "STORAGE_WRITE_FAILED" }));
  expect(localStorage.getItem(key)).toBe("original");
  write.mockRestore();
  const cn = createServerStorage("cn");
  expect(cn.getItem(key)).toBe("original");
  cn.setItem(key, "updated");
  expect(localStorage.getItem("rock-calculator.servers.cn.__recovery.favorites.v1")).toBe("original");
  expect(localStorage.getItem(key)).toBe("original");
});

test("two tabs cannot silently overwrite saved teams or configurations", () => {
  const snapshot = { spirits: [], skills: [] };
  const first = teamPresetsRepository({ idFactory: () => "first-team" });
  const second = teamPresetsRepository({ idFactory: () => "second-team" });
  const a = first.load(snapshot), b = second.load(snapshot);
  first.create(a, "First tab");
  expect(() => second.create(b, "Second tab")).toThrow(expect.objectContaining({ code: "STORAGE_CONFLICT" }));
  expect(teamPresetsRepository().load(snapshot).teams.map(team => team.name)).toEqual(["First tab"]);

  const firstConfigs = spiritConfigsRepository(), secondConfigs = spiritConfigsRepository();
  const firstState = firstConfigs.load(snapshot), secondState = secondConfigs.load(snapshot);
  firstConfigs.replace({ ...firstState, configs: { unknown: { spiritId: "unknown", needsRepair: true, extra: 3 } } });
  expect(() => secondConfigs.replace(secondState)).toThrow(expect.objectContaining({ code: "STORAGE_CONFLICT" }));
  expect(spiritConfigsRepository().load(snapshot).configs.unknown.extra).toBe(3);
});

test("renaming a CN team preserves unknown members and Global member edits never add CN defaults", () => {
  const rawMember = { spiritId: "future", skills: { four: ["unknown-skill"] }, extra: { original: 7 } };
  const teamRepo = teamPresetsRepository({ idFactory: () => "team" });
  let state = teamRepo.create(teamRepo.load({ spirits: [], skills: [] }), "Unknowns");
  state.teams[0].members[0] = { ...rawMember, needsRepair: true };
  teamRepo.rename(state, "team", "Renamed");
  expect(teamPresetsRepository().load({ spirits: [], skills: [] }).teams[0].members[0]).toMatchObject(rawMember);

  const globalSnapshot = { meta: { serverId: "global", id: null, rulesVersion: null }, spirits: [], skills: [] };
  const globalRepo = teamPresetsRepository({ serverId: "global", idFactory: () => "global-team" });
  const draft = globalRepo.create(globalRepo.load(globalSnapshot), "Global");
  const changed = globalRepo.updateMember(draft, "global-team", 0, rawMember);
  expect(changed.teams[0].members[0]).toEqual(rawMember);
});
