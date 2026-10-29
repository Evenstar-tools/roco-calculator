import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import recommendations from "../../data/presets/s5-popular-configs.json";
import { withCnRecommendedSpirits } from "../../src/features/s5-preview/with-cn-recommended.js";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";
import { createSpeedTargets, SPEED_TARGET_PROFILES } from "../../src/features/team-ability/domain/speed-targets.js";
import { createDurabilityRanking } from "../../src/features/team-ability/domain/durability-ranking.js";
import { createInitialState } from "../../src/state/defaults.js";
import { buildDamageComparisonInput, createSkillDamageRanking } from "../../src/domain/skill-damage-ranking.js";
import { getS5LevelIncomingDamagePercent } from "../../src/domain/s5-preview-traits.js";

const base = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const preview = withCnRecommendedSpirits(base);
const ids = new Set(recommendations.entries.map(entry => entry.spiritId));
const spirits = preview.spirits.filter(spirit => ids.has(spirit.id));
// Formal CN publishes the configured identities without their unconfirmed growth forms.
const subset = spirits.map(spirit => ({ ...spirit,
  evolutionChainIds: spirit.evolutionChainIds?.filter(id => ids.has(id)),
}));

test.each([["普通版完整投影", spirits], ["普通版推荐子集", subset]])("%s的14只推荐进入速度和耐久榜，冥古龙保留四档等级", (_label, candidates) => {
  expect(candidates).toHaveLength(14);
  for (const spirit of candidates) {
    expect(resolveSpiritFormRole(spirit)).toMatchObject({
      formRole: spirit.previewIdentity.kind === "boss" ? "boss" : "final",
      formRoleStatus: "preview",
    });
  }
  const durability = createDurabilityRanking({ spirits: candidates });
  expect(durability.excluded).toEqual([]);
  for (const profileId of Object.keys(SPEED_TARGET_PROFILES)) {
    const speed = createSpeedTargets({ spirits: candidates, profileId });
    expect(new Set(speed.map(row => row.spiritId))).toEqual(ids);
    for (const spirit of candidates) {
      const levels = spirit.previewIdentity.key === "minggulong" ? [69, 79, 89, 99] : [60];
      expect(speed.filter(row => row.spiritId === spirit.id).map(row => row.level).sort((a, b) => a - b)).toEqual(levels);
      expect(durability.rows.filter(row => row.spiritId === spirit.id).map(row => row.level).sort((a, b) => a - b)).toEqual(levels);
    }
  }
  for (const row of durability.rows.filter(row => row.spirit.previewIdentity.key === "minggulong")) {
    const incoming = 1 + getS5LevelIncomingDamagePercent(row.level) / 100;
    expect(row.incomingDamageMultiplier).toBe(incoming);
    expect(row.durability.raw.physical).toBe(row.panelDurability.raw.physical / incoming);
    expect(row.durability.raw.magical).toBe(row.panelDurability.raw.magical / incoming);
  }
});

test("未知六维、全100测试占位、未证实形态及成长形态不混入排行榜", () => {
  const silver = spirits.find(spirit => spirit.previewIdentity.key === "underground-silver-dragon");
  const identity = silver.previewIdentity;
  const invalid = [
    { ...silver, raceStats: null },
    { ...silver, raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 },
      previewIdentity: { ...identity, raceStatsPlaceholder: true } },
    { ...silver, previewIdentity: { ...identity, raceStatsEvidence: undefined } },
    { ...silver, previewIdentity: { ...identity, evolutionChainKeys: undefined } },
    { ...silver, previewIdentity: { ...identity, evolutionChainKeys: [identity.key, "unreleased-evolution"] } },
  ];
  expect(invalid.map(spirit => resolveSpiritFormRole(spirit).formRole)).toEqual(["unknown", "unknown", "unknown", "unknown", "growth"]);
  expect(createSpeedTargets({ spirits: invalid })).toEqual([]);
  expect(createDurabilityRanking({ spirits: invalid }).rows).toEqual([]);
  const abu = preview.spirits.find(spirit => spirit.previewIdentity?.key === "abu");
  expect(abu).toBeUndefined();
  const ming = spirits.find(spirit => spirit.previewIdentity.key === "minggulong");
  const pendingMing = { ...ming, raceStats: invalid[1].raceStats,
    previewIdentity: { ...ming.previewIdentity, raceStatsPlaceholder: true } };
  expect(createSpeedTargets({ spirits: [pendingMing] })).toEqual([]);
  expect(createDurabilityRanking({ spirits: [pendingMing] }).rows).toEqual([]);
});

test("S4原有精灵角色不因新推荐目录改变", () => {
  const byId = new Map(preview.spirits.map(spirit => [spirit.id, spirit]));
  for (const spirit of base.spirits) {
    expect(resolveSpiritFormRole(byId.get(spirit.id))).toEqual(resolveSpiritFormRole(spirit));
  }
});

test("默认伤害对比含14只推荐，并沿用各自用户预设性格及个体", async () => {
  const snapshot = { ...preview, spirits: subset };
  const state = createInitialState(snapshot);
  const ming = recommendations.entries[0];
  state.mode = "single";
  state.sides.attacker.spiritId = ming.spiritId;
  state.sides.attacker.skills.single = ming.skills[0];
  const presetsBySpirit = Object.fromEntries(recommendations.entries.map(entry => [entry.spiritId, {
    ...entry, skills: { single: entry.skills.find(Boolean) ?? null, four: entry.skills },
  }]));
  const options = { snapshot, state, templateId: "user-presets", presetsBySpirit };
  const ranking = await createSkillDamageRanking(options);
  expect(ranking.issue).toBeFalsy();
  expect(new Set(ranking.rows.map(row => row.spirit.id))).toEqual(ids);
  for (const row of ranking.rows) {
    const preset = presetsBySpirit[row.spirit.id];
    const input = buildDamageComparisonInput({ ...options, spirit: row.spirit });
    expect(row.template).toMatchObject({ natureId: preset.natureId, displayIvs: preset.displayIvs });
    expect(input.sides.defender).toMatchObject({ nature: preset.natureId, displayIvs: preset.displayIvs, skills: preset.skills });
  }
});
