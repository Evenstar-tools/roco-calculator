// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { getServerRelease } from "../../src/domain/server-environment.js";
import { getSnapshotIndexes } from "../../src/domain/snapshot-indexes.js";
import { getSkillChoices } from "../../src/domain/skill-loadout.js";
import { createGlobalPlaceholderCatalog } from "../../src/runtime/global-placeholder-catalog.js";
import { loadGlobalPlaceholderCatalog, loadServerSnapshot } from "../../src/runtime/load-snapshot.js";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";
import { assertRepositoryEnvironment } from "../../src/state/server-storage.js";
import { teamPresetsRepository } from "../../src/state/team-presets.js";

const sourceCatalog = () => ({
  meta: { id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10" },
  spirits: [{
    id: "wolf", fullName: "银月狼王", types: ["幽"], evolutionChainIds: ["cub", "wolf"],
    asset: { localUrl: "/assets/spirits/wolf.png" }, raceStats: { hp: 100 },
    previewDefaults: { natureId: "adamant", displayIvs: { hp: 60 } },
    traitIds: ["moon"], traitName: "铭记于月亮",
  }, { id: "cub", fullName: "新月狼灵", evolutionChainIds: ["cub", "wolf"] }],
  skills: [{ id: "claw", name: "掠影", type: "幽", category: "physical", description: "国服中文说明",
    iconUrl: "/assets/skills/claw.png", basePower: 80, cost: 2, ruleId: "conditional-power", ruleParams: { multiplier: 2 } }],
  traits: [{ id: "moon", name: "铭记于月亮", description: "国服特性说明", ruleId: "moon-memory", affectsDamage: true }],
  learnsets: [{ spiritId: "wolf", skillIds: ["claw"], defaultSkillIds: ["claw"], bloodlineSkillIds: ["claw"] }],
  rules: [{ id: "conditional-power" }], typeChart: { types: ["幽"], matrix: [[2]] },
});

afterEach(() => localStorage.clear());

test("explicit CN reference loading preserves names and assets under a distinct Global namespace", async () => {
  const source = sourceCatalog();
  const original = structuredClone(source);
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => source }));
  const catalog = await loadGlobalPlaceholderCatalog({ fetcher });
  expect(fetcher).toHaveBeenCalledWith("/data/runtime.json", { signal: undefined });
  expect(catalog.meta).toEqual({ serverId: "global", id: null, rulesVersion: null, status: "unverified",
    placeholderSource: { serverId: "cn", dataVersion: "s4-2026-09-10", locale: "zh-CN" } });
  expect(catalog.spirits[0]).toMatchObject({ id: "cn-placeholder:wolf", fullName: "银月狼王",
    asset: source.spirits[0].asset, types: ["幽"], evolutionChainIds: ["cn-placeholder:cub", "cn-placeholder:wolf"],
    reference: { sourceId: "wolf", traitName: "铭记于月亮", traitDescription: "国服特性说明" } });
  expect(catalog.learnsets).toEqual([{ spiritId: "cn-placeholder:wolf", skillIds: ["cn-placeholder:claw"] }]);
  expect(getSkillChoices(catalog, "cn-placeholder:wolf")[0]).toMatchObject({ name: "掠影", id: "cn-placeholder:claw", learnable: true });
  expect(getSnapshotIndexes(catalog).spirits.wolf).toBeUndefined();
  expect(getSnapshotIndexes(source).spirits.wolf).toBe(source.spirits[0]);
  expect(source).toEqual(original);
  catalog.spirits[0].asset.localUrl = "/changed.png";
  catalog.spirits[0].types.push("水");
  expect(source).toEqual(original);
});

test("reference data carries no executable CN mechanics and never enables Global calculation", () => {
  const catalog = createGlobalPlaceholderCatalog(sourceCatalog());
  for (const key of ["raceStats", "previewDefaults", "traitIds", "traitName", "traitDescription"]) {
    expect(catalog.spirits[0]).not.toHaveProperty(key);
  }
  for (const key of ["ruleId", "ruleParams", "basePower", "cost"]) expect(catalog.skills[0]).not.toHaveProperty(key);
  expect(catalog.skills[0].reference).toEqual({ sourceId: "claw", basePower: 80, cost: 2 });
  expect(catalog.traits).toEqual([]);
  expect(catalog.rules).toEqual([]);
  expect(catalog.typeChart).toEqual({ types: [], matrix: [] });
  expect(() => calculateMatchup(catalog, { serverId: "global" })).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SERVER_VERSION" }));
  expect(() => calculateMatchup(catalog, { serverId: "cn" })).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  expect(getServerRelease("global")).toMatchObject({ dataURL: "/data/global-runtime.json", capabilities: { calculate: true } });
});

test("the verified Global loader still rejects without an implicit CN fallback", async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => sourceCatalog() }));
  await expect(loadServerSnapshot("global", { fetcher })).rejects.toMatchObject({ code: "SERVER_MISMATCH" });
  expect(fetcher).toHaveBeenCalledWith("/data/global-runtime.json", { signal: undefined });
});

test("reference loading rejects an aborted request before fetch or after a delayed JSON response", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  const unused = vi.fn();
  await expect(loadGlobalPlaceholderCatalog({ signal: cancelled.signal, fetcher: unused })).rejects.toMatchObject({ name: "AbortError" });
  expect(unused).not.toHaveBeenCalled();

  const controller = new AbortController();
  let finish;
  const body = new Promise((resolve) => { finish = resolve; });
  const json = vi.fn(() => body);
  const fetcher = vi.fn(async () => ({ ok: true, json }));
  const pending = loadGlobalPlaceholderCatalog({ signal: controller.signal, fetcher });
  await vi.waitFor(() => expect(json).toHaveBeenCalled());
  controller.abort();
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish(sourceCatalog());
  await rejected;
  expect(fetcher).toHaveBeenCalledWith("/data/runtime.json", { signal: controller.signal });
});

test.each([
  { serverId: "global", id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10" },
  { id: "stale-cn", rulesVersion: "s4-2026-09-10" },
  { id: "s4-2026-09-10", rulesVersion: "future-cn" },
])("reference projection verifies the source release before exposing it: %j", async (meta) => {
  const source = { ...sourceCatalog(), meta };
  expect(() => createGlobalPlaceholderCatalog(source)).toThrow();
  await expect(loadGlobalPlaceholderCatalog({ fetcher: async () => ({ ok: true, json: async () => source }) })).rejects.toThrow();
});

test("Global repositories accept only explicit reference catalogs or empty fixtures, retaining unknown saved IDs", () => {
  const catalog = createGlobalPlaceholderCatalog(sourceCatalog());
  expect(assertRepositoryEnvironment("global", catalog).serverId).toBe("global");
  expect(() => assertRepositoryEnvironment("global", UNVERIFIED_GLOBAL_SNAPSHOT)).not.toThrow();
  expect(() => assertRepositoryEnvironment("global", sourceCatalog())).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  expect(() => assertRepositoryEnvironment("cn", catalog)).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));

  const repo = teamPresetsRepository({ serverId: "global", idFactory: () => "global-draft" });
  const state = repo.create(repo.load(catalog), "草稿");
  const unknown = { spiritId: "wolf", skills: { four: ["future-skill"], single: null }, custom: { keep: true } };
  repo.updateMember(state, "global-draft", 0, unknown);
  expect(teamPresetsRepository({ serverId: "global" }).load(catalog).teams[0].members[0]).toMatchObject({ ...unknown, needsRepair: true });
  expect(teamPresetsRepository().load(sourceCatalog()).teams).toEqual([]);
});

test.each([
  (catalog) => { delete catalog.meta.placeholderSource; },
  (catalog) => { catalog.meta.placeholderSource.dataVersion = "unverified-source"; },
  (catalog) => { catalog.meta.status = "verified"; },
  (catalog) => { catalog.meta.id = "s4-2026-09-10"; },
  (catalog) => { catalog.spirits[0].id = "wolf"; },
  (catalog) => { catalog.spirits[0].raceStats = { hp: 100 }; },
  (catalog) => { catalog.spirits[0].traitName = "铭记于月亮"; },
  (catalog) => { catalog.skills[0].ruleId = "conditional-power"; },
  (catalog) => { catalog.skills[0].basePower = 80; },
  (catalog) => { catalog.learnsets[0].skillIds = ["claw"]; },
  (catalog) => { catalog.typeChart = { types: ["幽"], matrix: [[2]] }; },
  (catalog) => { catalog.traits = [{ id: "moon", name: "铭记于月亮" }]; },
])("a marker cannot bless a foreign or executable catalog (%#)", (alter) => {
  const catalog = createGlobalPlaceholderCatalog(sourceCatalog());
  alter(catalog);
  expect(() => assertRepositoryEnvironment("global", catalog)).toThrow(expect.objectContaining({ code: "SERVER_DATA_UNVERIFIED" }));
});
