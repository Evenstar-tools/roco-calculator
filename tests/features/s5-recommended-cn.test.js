import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { withCnRecommendedSpirits } from "../../src/features/s5-preview/with-cn-recommended.js";
import { withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import { buildS5PopularConfigLibrary } from "../../scripts/s5-preview-presets.mjs";
import { parseFavoriteConfigLibrary } from "../../src/state/favorite-config-library.js";
import recommendations from "../../data/presets/s5-popular-configs.json";

const raw = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const base = withCalculatorExtras(raw);

test("普通CN仅增加14只已配置新精灵，旧精灵技能特性学习面逐项不变", () => {
  const result = withCnRecommendedSpirits(raw);
  for (const collection of ["spirits", "skills", "traits", "learnsets"]) {
    expect(result[collection].slice(0, base[collection].length)).toEqual(base[collection]);
  }
  expect(result.spirits.slice(base.spirits.length).map(spirit => spirit.id).sort())
    .toEqual(recommendations.entries.map(entry => entry.spiritId).sort());
  expect(result.seasonAnnouncement).toBeUndefined();
  const available = new Set(result.spirits.map(spirit => spirit.id));
  for (const spirit of result.spirits.slice(base.spirits.length)) {
    expect(spirit.previewIdentity.raceStatsPlaceholder).toBe(false);
    expect(spirit.evolutionChainIds?.every(id => available.has(id)) ?? true).toBe(true);
  }
  expect(withCnRecommendedSpirits(result)).toEqual(result);
  const global = { ...raw, meta: { ...raw.meta, serverId: "global" } };
  expect(withCnRecommendedSpirits(global)).toBe(global);
});

test("普通版新精灵使用已录入数据，森巨人保持原值，245份配置完整可导入", () => {
  const cn = withCnRecommendedSpirits(raw), recorded = withS5PreviewCatalog(base, catalog);
  for (const { spiritId } of recommendations.entries) {
    const spirit = cn.spirits.find(entry => entry.id === spiritId);
    expect(spirit.raceStats).toEqual(recorded.spirits.find(entry => entry.id === spiritId).raceStats);
  }
  const mori = list => list.spirits.find(spirit => spirit.fullName === "森巨人");
  expect(mori(cn).raceStats).toEqual(mori(base).raceStats);
  const library = buildS5PopularConfigLibrary();
  for (const snapshot of [cn]) {
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library), { snapshot });
    expect(parsed.entries).toHaveLength(245);
    expect(parsed.preview).toMatchObject({ missingSpirits: 0, missingSkills: 0, invalidEntries: 0 });
    expect(parsed.warnings).toEqual([]);
  }
});
