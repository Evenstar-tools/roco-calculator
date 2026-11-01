import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { buildS5BwikiRuntime } from "../../scripts/s5-bwiki-runtime.mjs";
import recommendations from "../../data/presets/s5-popular-configs.json";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";
import { createSpeedTargets, SPEED_TARGET_PROFILES } from "../../src/features/team-ability/domain/speed-targets.js";
import { createDurabilityRanking } from "../../src/features/team-ability/domain/durability-ranking.js";
import { createInitialState } from "../../src/state/defaults.js";
import { buildDamageComparisonInput, createSkillDamageRanking } from "../../src/domain/skill-damage-ranking.js";
import { getS5LevelIncomingDamagePercent } from "../../src/domain/s5-preview-traits.js";

const base = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const legacyPreview = withWebPreview(base);
const userPlaceholderId = "spirit_preview_s5_boss-abu";
const configuredIds = new Set(recommendations.entries.map(entry => entry.spiritId));
const ids = new Set([...configuredIds].filter(id => id !== userPlaceholderId));
let preview, spirits, subset;
beforeAll(async () => {
  preview = await buildS5BwikiRuntime();
  spirits = preview.spirits.filter(spirit => configuredIds.has(spirit.id));
  // A recommended subset can omit growth forms without losing recorded final/boss roles.
  subset = spirits.map(spirit => ({ ...spirit,
    evolutionChainIds: spirit.evolutionChainIds?.filter(id => configuredIds.has(id)),
  }));
}, 30000);

test.each(["完整S5", "普通版推荐子集"])("%s的17只已确认推荐进入速度和耐久榜，圣龙用户占位排除，冥古龙保留四档等级", label => {
  const candidates = label === "完整S5" ? spirits : subset;
  expect(candidates).toHaveLength(18);
  const confirmed = candidates.filter(spirit => ids.has(spirit.id));
  expect(confirmed).toHaveLength(17);
  const placeholders = candidates.filter(spirit => !ids.has(spirit.id));
  expect(placeholders.map(spirit => spirit.id)).toEqual([userPlaceholderId]);
  expect(placeholders[0]).toMatchObject({
    previewIdentity: { formalIdPending: true, raceStatsPlaceholder: true },
    previewDefaults: { authority: "user" },
  });
  expect(resolveSpiritFormRole(placeholders[0]).formRole).toBe("unknown");
  for (const spirit of confirmed) {
    expect(resolveSpiritFormRole(spirit)).toMatchObject({
      formRole: spirit.stage === "首领" ? "boss" : "final",
      formRoleStatus: "verified",
    });
  }
  const durability = createDurabilityRanking({ spirits: candidates });
  expect(durability.excluded).toEqual([expect.objectContaining({
    spiritId: userPlaceholderId, reason: "HIDDEN_FROM_DISCOVERY",
  })]);
  expect(new Set(durability.rows.map(row => row.spiritId))).toEqual(ids);
  for (const profileId of Object.keys(SPEED_TARGET_PROFILES)) {
    const speed = createSpeedTargets({ spirits: candidates, profileId });
    expect(new Set(speed.map(row => row.spiritId))).toEqual(ids);
    for (const spirit of confirmed) {
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
  const silver = legacyPreview.spirits.find(spirit => spirit.previewIdentity?.key === "underground-silver-dragon");
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
  const abu = legacyPreview.spirits.find(spirit => spirit.previewIdentity?.key === "abu");
  expect(abu.previewIdentity.raceStatsPlaceholder).toBe(true);
  expect(createSpeedTargets({ spirits: [abu] })).toEqual([]);
  expect(createDurabilityRanking({ spirits: [abu] }).rows).toEqual([]);
  const ming = legacyPreview.spirits.find(spirit => spirit.previewIdentity?.key === "minggulong");
  const pendingMing = { ...ming, raceStats: invalid[1].raceStats,
    previewIdentity: { ...ming.previewIdentity, raceStatsPlaceholder: true } };
  expect(createSpeedTargets({ spirits: [pendingMing] })).toEqual([]);
  expect(createDurabilityRanking({ spirits: [pendingMing] }).rows).toEqual([]);
  const growth = preview.spirits.filter(spirit => ["呆呆铃", "跳跳铃"].includes(spirit.fullName));
  expect(growth).toHaveLength(2);
  expect(growth.map(spirit => resolveSpiritFormRole(spirit).formRole)).toEqual(["growth", "growth"]);
  expect(createSpeedTargets({ spirits: growth })).toEqual([]);
  expect(createDurabilityRanking({ spirits: growth }).rows).toEqual([]);
  const unconfirmed = preview.spirits.find(spirit => spirit.fullName === "圣龙阿布");
  expect(unconfirmed.previewIdentity.raceStatsPlaceholder).toBe(true);
  expect(createSpeedTargets({ spirits: [unconfirmed] })).toEqual([]);
  expect(createDurabilityRanking({ spirits: [unconfirmed] }).rows).toEqual([]);
});

test("S4原有精灵角色不因新推荐目录改变", () => {
  const byId = new Map(legacyPreview.spirits.map(spirit => [spirit.id, spirit]));
  for (const spirit of base.spirits) {
    expect(resolveSpiritFormRole(byId.get(spirit.id))).toEqual(resolveSpiritFormRole(spirit));
  }
});

test("默认伤害对比含17只已确认推荐，排除圣龙用户占位并沿用各自用户预设性格及个体", async () => {
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
