import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import catalog from "../../data/candidates/candymo-hidden-spirits-20261101.json";
import { s5PreviewIds, validateS5PreviewCatalog, withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";
import { buildSpiritFamilyIndex } from "../../src/components/spirit-family.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { createInitialState } from "../../src/state/defaults.js";
import { createTeamMember } from "../../src/state/team-presets.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { favoritesRepository } from "../../src/state/favorites.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";

const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const ids = [3217, 3218, 3219, 3408, 3409, 3416, 3417, 3418, 3825, 3826, 5070,
  3849, 3850, 3851, 3863, 3864, 3865, 5069, 3640, 3641, 3642, 3643, 3644, 3645, 3646, 3647, 3648];
const spiritId = id => s5PreviewIds(`hidden-${id}`).spiritId;
const overlay = () => withS5PreviewCatalog(current, catalog, { useTestRaceStats: true });
afterEach(() => vi.unstubAllEnvs());

test("27 hidden records are traceable, searchable and never acquire assumed statistics, skills or mechanics", () => {
  expect(validateS5PreviewCatalog(catalog)).toBe(catalog);
  expect(catalog.entries.map(entry => entry.sourceId)).toEqual(ids);
  const snapshot = overlay();
  const index = createSpiritSearchIndex(snapshot.spirits);
  for (const entry of catalog.entries) {
    const spirit = index.search(entry.name).find(candidate => candidate.id === spiritId(entry.sourceId));
    expect(spirit).toMatchObject({ fullName: entry.name, sourceCategory: "未开放", raceStats: null,
      calculationStatus: "pending-race-stats", traitName: entry.traitName, traitDescription: entry.traitSummary,
      previewIdentity: { catalogId: catalog.catalogId, sourceId: entry.sourceId, raceStatsPlaceholder: false,
        source: { authority: "third-party-hidden", url: `https://app.candymo.com/pets/${entry.sourceId}` } } });
    const trait = snapshot.traits.find(item => spirit.traitIds.includes(item.id));
    expect(trait.description).toBe(entry.traitSummary);
    expect(getS5PreviewTraitInputs(trait, "attacker")).toBeNull();
    expect(trait).not.toHaveProperty("ruleId");
    expect(snapshot.learnsets.find(pool => pool.spiritId === spirit.id)).toEqual({
      spiritId: spirit.id, skillIds: [], defaultSkillIds: [],
    });
  }
  expect(withS5PreviewCatalog(snapshot, catalog, { useTestRaceStats: true })).toBe(snapshot);
  expect(snapshot.spirits.slice(0, current.spirits.length)).toEqual(current.spirits);
  expect(current.spirits.some(spirit => spirit.previewIdentity?.catalogId === catalog.catalogId)).toBe(false);
});

test("only eight distinct designs carry documented traits and reference portraits, never copied template traits", () => {
  const documented = catalog.entries.filter(entry => entry.traitName !== "特性待确认");
  expect(documented.map(entry => entry.sourceId)).toEqual(ids.slice(0, 8));
  expect(documented.map(entry => entry.asset.kind)).toEqual(Array(8).fill("reference-portrait"));
  expect(catalog.entries.filter(entry => entry.asset)).toHaveLength(8);
  for (const entry of documented) {
    expect(entry.sourceRecord.traitEvidence.sourceId).toBe(entry.sourceRecord.traitId);
    expect(Object.keys(entry.sourceRecord.candidateRaceStats)).toHaveLength(6);
  }
  for (const entry of catalog.entries.slice(8)) {
    expect(entry.traitSummary).toBe("特性待确认");
    expect(entry.sourceRecord).not.toHaveProperty("candidateRaceStats");
    expect(entry).not.toHaveProperty("asset");
  }
  expect(catalog.entries.some(entry => /旧玩具|月相|散发着危险/.test(entry.traitSummary))).toBe(false);
});

test("unreleased evidence cannot be promoted to official evidence or bypass the null-stat and empty-pool limits", () => {
  for (const mutate of [
    copy => { copy.source.authority = "official-image"; },
    copy => { copy.entries[0].evidence.url = "https://example.com/pets/3217"; },
    copy => { copy.entries[0].raceStats = { hp: 100 }; },
    copy => { copy.entries[0].raceStats = undefined; },
    copy => { copy.entries[0].skills = [{ id: "fake" }]; },
    copy => { copy.entries[0].asset.kind = "official-portrait"; },
  ]) {
    const copy = structuredClone(catalog);
    mutate(copy);
    expect(() => validateS5PreviewCatalog(copy)).toThrow();
  }
});

test("direct parents preserve mushroom and boat branches; fighting designs stay separate and missing parents stay metadata", () => {
  const snapshot = overlay();
  const family = buildSpiritFamilyIndex(snapshot.spirits);
  for (const group of [[3217, 3218, 3219], [3408, 3409], [3825, 3826, 5070], [3849, 3850, 3851],
    [3863, 3864, 3865], ids.slice(-9), [3416], [3417], [3418], [5069]]) {
    for (const id of group) expect(family.get(spiritId(id)).map(spirit => spirit.id).sort())
      .toEqual(group.map(spiritId).sort());
  }
  const boat = snapshot.spirits.find(spirit => spirit.id === spiritId(3851));
  expect(boat.previewIdentity.sourceRecord.evolvesFromId).toBe(3849);
  expect(boat.evolutionChainIds).toEqual([spiritId(3849), spiritId(3851)]);
  expect(snapshot.spirits.find(spirit => spirit.id === spiritId(3642)).evolutionChainIds)
    .toEqual([3640, 3641, 3642].map(spiritId));
  const ancient = snapshot.spirits.find(spirit => spirit.id === spiritId(5069));
  expect(ancient.previewIdentity.sourceRecord.evolvesFromId).toBe(3340);
  expect(ancient.evolutionChainIds).toBeUndefined();
  for (const entry of catalog.entries) for (const key of entry.evolutionChainKeys ?? []) {
    expect(catalog.entries.find(member => member.key === key).evolutionChainKeys).toContain(entry.key);
  }
});

test.each([false, true])("both legacy and complete S5 web paths keep hidden candidates; complete=%s", complete => {
  const base = { ...current, meta: { ...current.meta, s5NrcSync: { complete } } };
  const snapshot = withWebPreview(base);
  expect(snapshot.spirits.filter(spirit => spirit.previewIdentity?.catalogId === catalog.catalogId)).toHaveLength(27);
  expect(snapshot.spirits.find(spirit => spirit.id === spiritId(3217)).asset.localUrl)
    .toContain("/assets/spirits/candymo-hidden/3217.png");
  const global = { ...base, meta: { ...base.meta, serverId: "global" } };
  expect(withWebPreview(global)).toBe(global);
  expect(() => withS5PreviewCatalog(global, catalog)).toThrow("仅适用于国服");
});

test("/pre keeps reference portraits within its mount while retaining the unmodified evidence URL", () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const snapshot = withWebPreview({ ...current, meta: { ...current.meta, s5NrcSync: { complete: true } } });
  const spirit = snapshot.spirits.find(entry => entry.id === spiritId(3217));
  expect(spirit.asset.localUrl).toBe("/pre/assets/spirits/candymo-hidden/3217.png");
  expect(spirit.previewIdentity.asset.localUrl).toBe("/assets/spirits/candymo-hidden/3217.png");
  expect(spirit.previewIdentity.evidence.url).toBe("https://app.candymo.com/pets/3217");
});

test("existing favorites and saved configurations retain hidden identities while damage stays unavailable on either side", () => {
  const snapshot = overlay();
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
  const configs = spiritConfigsRepository({ storage });
  const favorites = favoritesRepository(storage);
  const member = createTeamMember(snapshot, spiritId(3219));
  expect(member.skills).toEqual({ four: [null, null, null, null], single: null });
  configs.save(configs.load(snapshot), member, snapshot);
  expect(configs.load(snapshot).configs[member.spiritId].spiritId).toBe(member.spiritId);
  favorites.save({ id: member.spiritId, name: "健猫教练" });
  expect(favoritesRepository(storage).list()).toEqual([{ id: member.spiritId, name: "健猫教练" }]);
  for (const side of ["attacker", "defender"]) {
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = current.spirits.find(spirit => spirit.fullName === "烈火守护").id;
    state.sides.defender.spiritId = state.sides.attacker.spiritId;
    state.sides[side].spiritId = member.spiritId;
    const view = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    expect(view.configurationReady).toBe(false);
    expect(view.configurationIssue).toBe("种族值待确认");
    expect(view.result).toBeNull();
    expect(view.sides[side].panelStats).toBeNull();
    const comparison = buildBalanceComparison({ snapshot, state, activeDirection: "forward",
      customEnabled: { [side]: { [member.spiritId]: true } },
      customStats: { [side]: { [member.spiritId]: { hp: 100, physicalAttack: 100, magicalAttack: 100,
        physicalDefense: 100, magicalDefense: 100, speed: 100 } } } });
    expect(comparison.issue).toBe("种族值待确认，暂不支持自定义试算");
    expect(comparison.afterView.configurationReady).toBe(false);
  }
});
