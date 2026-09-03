import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  applyS4PreviewCatalog,
  validateS4PreviewCatalog,
} from "../../scripts/bwiki/apply-s4-preview-catalog.mjs";
import { getNature } from "../../src/domain/natures.js";

const candidate = JSON.parse(
  readFileSync("data/candidates/s4-preview-new-spirits.json", "utf8"),
);
const current = JSON.parse(
  readFileSync("data/snapshots/current.json", "utf8"),
);
const popularConfigs = JSON.parse(
  readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"),
);

const FINAL_NAMES = [
  "测风蝉",
  "智辉章脑",
  "玳塔",
  "摇铃魔偶",
  "未完虫",
  "黑手浣熊",
  "布灵布灵",
  "星星眼",
  "月使鹭纳",
  "圣凯布米龙",
  "银月狼王",
];

const PLACEHOLDER_NAMES = [
  "量风碗",
  "章脑丸",
  "玳龟",
  "幽铃",
  "小浣蛋",
  "布灵",
  "新月鹭",
  "月辉鹭",
  "热团团",
  "焰米龙",
  "诅咒狼灵",
  "新月狼灵",
];

const ALL_NAMES = [...FINAL_NAMES, ...PLACEHOLDER_NAMES];

const PREVIEW_DEFAULTS_BY_NAME = {
  测风蝉: ["silent", ["hp", "physicalDefense", "magicalDefense"]],
  智辉章脑: ["smart", ["hp", "speed", "magicalAttack"]],
  玳塔: ["silent", ["hp", "physicalDefense", "magicalDefense"]],
  摇铃魔偶: ["silent", ["hp", "physicalDefense", "magicalDefense"]],
  未完虫: ["adamant", ["hp", "speed", "physicalAttack"]],
  黑手浣熊: ["cheerful", ["hp", "speed", "physicalAttack"]],
  布灵布灵: ["cheerful", ["hp", "speed", "physicalAttack"]],
  星星眼: ["smart", ["hp", "speed", "magicalAttack"]],
  月使鹭纳: ["hasty", ["hp", "speed", "magicalAttack"]],
  圣凯布米龙: ["peaceful", ["hp", "physicalDefense", "magicalDefense"]],
  银月狼王: ["cheerful", ["hp", "speed", "physicalAttack"]],
};

const TRAIT_NAMES = [
  "风速仪",
  "基因编辑",
  "乌龟塔理论",
  "盗魂铃",
  "活体标本",
  "翻垃圾桶",
  "旧玩具",
  "宇宙之眼",
  "冷光源",
  "热成像",
  "铭记于月亮",
];

function baselineSnapshot() {
  const baseline = structuredClone(current);
  const removedSpiritIds = new Set(
    baseline.spirits
      .filter(({ fullName }) => ALL_NAMES.includes(fullName))
      .map(({ id }) => id),
  );
  baseline.spirits = baseline.spirits.filter(
    ({ fullName }) => !ALL_NAMES.includes(fullName),
  );
  baseline.learnsets = baseline.learnsets.filter(
    ({ spiritId }) => !removedSpiritIds.has(spiritId),
  );
  baseline.skills = baseline.skills.filter(
    ({ calculationStatus }) => calculationStatus !== "pending-skill-data",
  );
  baseline.traits = baseline.traits.filter(
    ({ name }) => !TRAIT_NAMES.includes(name),
  );
  baseline.meta.counts = {
    ...baseline.meta.counts,
    spirits: baseline.spirits.length,
    skills: baseline.skills.length,
    learnsets: baseline.learnsets.length,
    traits: baseline.traits.length,
  };
  baseline.meta.diff = {
    ...baseline.meta.diff,
    spiritsAdded: Math.max(
      0,
      Number(baseline.meta.diff?.spiritsAdded ?? 0) - removedSpiritIds.size,
    ),
  };
  baseline.meta.sources = (baseline.meta.sources ?? []).filter(
    ({ url }) => url !== candidate.meta.source.url,
  );
  delete baseline.meta.s4PreviewCatalog;
  return baseline;
}

describe("S4 前瞻新精灵候选目录", () => {
  test("活动快照使用 S4 前瞻身份", () => {
    expect(current.meta).toMatchObject({
      id: "s4-preview-2026-09-02",
      rulesVersion: "s4-preview-2026-09-02",
      seasonId: "S4前瞻",
    });
  });

  test("来源清单数量、精力映射、最终形态总和及占位边界自洽", () => {
    expect(validateS4PreviewCatalog(candidate)).toEqual({
      families: 11,
      finalForms: 11,
      forms: 23,
      placeholderForms: 12,
      skillSlots: 44,
      traits: 11,
      uniqueSkillNames: 43,
      existingSkillReferences: 18,
      newSkillPlaceholders: 26,
    });
  });

  test("把 23 个形态、11 个特性和 26 个展示占位技能写入活动快照", () => {
    const before = baselineSnapshot();
    const beforeSpiritNames = new Set(before.spirits.map(({ fullName }) => fullName));
    const beforeTraitNames = new Set(before.traits.map(({ name }) => name));
    expect(FINAL_NAMES.every((name) => !beforeSpiritNames.has(name))).toBe(true);
    expect(TRAIT_NAMES.every((name) => !beforeTraitNames.has(name))).toBe(true);

    const patched = applyS4PreviewCatalog(before, candidate);
    expect(patched.spirits).toHaveLength(before.spirits.length + 23);
    expect(patched.learnsets).toHaveLength(before.learnsets.length + 23);
    expect(patched.traits).toHaveLength(before.traits.length + 11);
    expect(patched.skills).toHaveLength(before.skills.length + 26);
    expect(
      patched.spirits.filter(({ fullName }) => FINAL_NAMES.includes(fullName)),
    ).toHaveLength(11);
    expect(
      patched.spirits.filter(({ fullName }) => PLACEHOLDER_NAMES.includes(fullName)),
    ).toHaveLength(12);
    expect(patched.meta.s4PreviewCatalog).toMatchObject({
      status: "candidate",
      counts: {
        finalForms: 11,
        placeholderForms: 12,
        newSkillPlaceholders: 26,
      },
    });
    expect(patched.meta.counts).toMatchObject({
      spirits: before.spirits.length + 23,
      learnsets: before.learnsets.length + 23,
      skills: before.skills.length + 26,
      traits: before.traits.length + 11,
    });
  });

  test("最终形态默认四技能严格保持高清图顺序，未知参数只作展示占位", () => {
    const patched = applyS4PreviewCatalog(baselineSnapshot(), candidate);
    const skillById = new Map(patched.skills.map((skill) => [skill.id, skill]));

    for (const family of candidate.families) {
      const finalForm = family.forms.find(({ isFinal }) => isFinal === true);
      const spirit = patched.spirits.find(
        ({ fullName }) => fullName === finalForm.name,
      );
      const learnset = patched.learnsets.find(
        ({ spiritId }) => spiritId === spirit.id,
      );
      const expectedNames = family.skills.map(({ name }) => name);
      expect(learnset.skillIds.map((id) => skillById.get(id)?.name)).toEqual(
        expectedNames,
      );
      expect(learnset.defaultSkillIds).toEqual(learnset.skillIds);
    }

    const placeholder = patched.skills.find(({ name }) => name === "广播");
    expect(placeholder).toMatchObject({
      basePower: null,
      calculationStatus: "pending-skill-data",
      category: null,
      cost: null,
      description: "对敌方精灵造成魔法伤害。",
      type: null,
    });
  });

  test("最终形态带有推导的默认性格和恰好三项 60 个体", () => {
    const patched = applyS4PreviewCatalog(baselineSnapshot(), candidate);

    for (const [name, [natureId, selectedStats]] of Object.entries(
      PREVIEW_DEFAULTS_BY_NAME,
    )) {
      const spirit = patched.spirits.find(({ fullName }) => fullName === name);
      const expectedIvs = Object.fromEntries(
        [
          "hp",
          "speed",
          "physicalAttack",
          "magicalAttack",
          "physicalDefense",
          "magicalDefense",
        ].map((stat) => [stat, selectedStats.includes(stat) ? 60 : 0]),
      );

      expect(spirit.previewDefaults).toEqual({
        natureId,
        displayIvs: expectedIvs,
      });
      expect(
        current.spirits.find(({ fullName }) => fullName === name)
          ?.previewDefaults,
      ).toEqual(spirit.previewDefaults);
      expect(
        Object.values(spirit.previewDefaults.displayIvs).filter(
          (value) => value === 60,
        ),
      ).toHaveLength(3);
      const nature = getNature(spirit.previewDefaults.natureId);
      expect(spirit.previewDefaults.displayIvs[nature.downStat]).toBe(0);
    }
  });

  test("旧版 213 套热门配置不注入 S4 前瞻精灵", () => {
    const patched = applyS4PreviewCatalog(baselineSnapshot(), candidate);
    const previewSpiritIds = new Set(
      patched.spirits
        .filter(({ sourceCategory }) => sourceCategory === "S4前瞻")
        .map(({ id }) => id),
    );

    expect(popularConfigs.entryCount).toBe(213);
    expect(popularConfigs.entries).toHaveLength(213);
    expect(
      popularConfigs.entries.some(({ spiritId }) => previewSpiritIds.has(spiritId)),
    ).toBe(false);
  });

  test("非最终形态只作为待核实占位实体，不伪造种族值、特性或学习面", () => {
    const patched = applyS4PreviewCatalog(baselineSnapshot(), candidate);
    const placeholders = patched.spirits.filter(({ fullName }) =>
      PLACEHOLDER_NAMES.includes(fullName)
    );

    expect(placeholders).toHaveLength(12);
    for (const spirit of placeholders) {
      expect(spirit).toMatchObject({
        calculationStatus: "pending-race-stats",
        raceStats: null,
        sourceCategory: "S4前瞻",
        traitIds: [],
      });
      expect(spirit.traitName).toBeNull();
      expect(
        patched.learnsets.find(({ spiritId }) => spiritId === spirit.id),
      ).toMatchObject({ spiritId: spirit.id, skillIds: [] });
      expect(
        patched.currentPatchChanges.spirits.find(
          ({ entityId }) => entityId === spirit.id,
        ),
      ).toMatchObject({
        entityName: spirit.fullName,
        isNew: true,
        items: [
          {
            after: "种族值待确认",
            kind: "new",
            label: "占位形态",
          },
        ],
      });
    }
  });

  test("最终形态字段、特性绑定和可复用学习面逐项正确", () => {
    const before = baselineSnapshot();
    const patched = applyS4PreviewCatalog(before, candidate);
    const spirit = patched.spirits.find(({ fullName }) => fullName === "月使鹭纳");
    const trait = patched.traits.find(({ name }) => name === "冷光源");
    const learnset = patched.learnsets.find(({ spiritId }) => spiritId === spirit.id);

    expect(spirit).toMatchObject({
      dexNo: null,
      stage: "三阶",
      sourceCategory: "S4前瞻",
      types: ["翼", "冰"],
      raceStats: {
        hp: 83,
        speed: 115,
        physicalAttack: 99,
        magicalAttack: 100,
        physicalDefense: 104,
        magicalDefense: 113,
        total: 614,
      },
      traitIds: [trait.id],
      traitName: "冷光源",
      evolutionChainNames: ["新月鹭", "月辉鹭", "月使鹭纳"],
    });
    expect(learnset.skillIds).toEqual([
      patched.skills.find(({ name }) => name === "惊鸿一瞥").id,
      patched.skills.find(({ name }) => name === "月影交错").id,
      before.skills.find(({ name }) => name === "打雪仗").id,
      before.skills.find(({ name }) => name === "羽翼庇护").id,
    ]);
    expect(learnset.defaultSkillIds).toEqual(learnset.skillIds);
  });

  test("铭记于月亮标记为前瞻实现而非待开发", () => {
    const patched = applyS4PreviewCatalog(baselineSnapshot(), candidate);
    const trait = patched.traits.find(({ name }) => name === "铭记于月亮");
    const currentTrait = current.traits.find(({ name }) => name === "铭记于月亮");

    expect(trait?.provenance?.previewStatus?.adaptationStatus)
      .toBe("preview-implemented");
    expect(currentTrait?.provenance?.previewStatus?.adaptationStatus)
      .toBe("preview-implemented");
  });

  test("补丁可重复执行且缺少既有技能时拒绝静默丢学习面", () => {
    const before = baselineSnapshot();
    const first = applyS4PreviewCatalog(before, candidate);
    expect(applyS4PreviewCatalog(first, candidate)).toEqual(first);

    const missingKnownSkill = {
      ...before,
      skills: before.skills.filter(({ name }) => name !== "打雪仗"),
    };
    expect(() => applyS4PreviewCatalog(missingKnownSkill, candidate))
      .toThrow("候选清单引用的既有技能不存在：打雪仗");
  });
});
