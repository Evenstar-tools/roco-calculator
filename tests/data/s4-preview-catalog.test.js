import { existsSync, readFileSync } from "node:fs";
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

const BOSS_CONFIGS = [
  {
    name: "烈焰狂战士",
    baseSpiritFullName: "烈火守护",
    traitName: "蒸汽革命",
    adaptationStatus: "reviewed-rule",
    assetStrategy: "official-video-frame-temporary",
    assetEvidenceTimestamp: "02:00.700",
    assetSourceFile: "烈焰狂战士_进化完成_120.700s.png",
  },
  {
    name: "满月砣",
    baseSpiritFullName: "月亮砣（下弦的样子）",
    traitName: "月相",
    adaptationStatus: "description-only",
    assetStrategy: "official-video-frame-temporary",
    assetEvidenceTimestamp: "02:26.467",
    assetSourceFile: "满月砣_进化完成_146.4667s.png",
  },
];

const BOSS_NAMES = BOSS_CONFIGS.map(({ name }) => name);
const ALL_NAMES = [...FINAL_NAMES, ...PLACEHOLDER_NAMES, ...BOSS_NAMES];
const PREVIEW_SKILL_NAMES = new Set(
  candidate.families
    .flatMap(({ skills }) => skills)
    .filter(({ status }) => status === "placeholder")
    .map(({ name }) => name),
);

const PREVIEW_DEFAULTS_BY_NAME = {
  测风蝉: ["silent", ["hp", "physicalDefense", "magicalDefense"]],
  智辉章脑: ["smart", ["hp", "speed", "magicalAttack"]],
  玳塔: ["silent", ["hp", "physicalDefense", "magicalDefense"]],
  摇铃魔偶: ["silent", ["hp", "physicalDefense", "magicalDefense"]],
  未完虫: ["adamant", ["hp", "speed", "physicalAttack"]],
  黑手浣熊: ["timid", ["hp", "speed", "magicalAttack"]],
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
  "蒸汽革命",
  "月相",
];

const OFFICIAL_SKILL_PARAMETERS = {
  掠影: ["幽", "physical", 3, 65],
  离魂术: ["幽", "status", 3, null],
  重组: ["幻", "status", 1, null],
  月蚀: ["幻", "physical", 5, 130],
  暖阳: ["火", "physical", 2, 70],
  星火: ["火", "status", 3, null],
  月影交错: ["翼", "physical", 2, 25],
  惊鸿一瞥: ["翼", "status", 2, null],
  分光: ["光", "status", 1, null],
  汇流: ["水", "status", 1, null],
  无风: ["翼", "defense", 2, null],
  广播: ["机械", "magical", 5, 140],
  迁飞扩散: ["虫", "physical", 3, 55],
  信息素: ["虫", "status", 4, null],
  掉包: ["恶", "status", 2, null],
  暴打: ["恶", "magical", 3, 100],
  小型打劫: ["幽", "status", 2, null],
  回收: ["幽", "magical", 3, 80],
  观测者效应: ["幻", "status", 3, null],
  仰望夜空: ["幻", "status", 2, null],
  量子涨落: ["幻", "physical", 3, 75],
  闪光弹: ["光", "physical", 2, 40],
  奇点: ["幻", "magical", 4, 60],
  引力旋转: ["幻", "defense", 2, null],
};

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
    ({ name }) => !PREVIEW_SKILL_NAMES.has(name),
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
      bossPlaceholders: 2,
      bossTraits: 2,
      skillSlots: 46,
      traits: 11,
      uniqueSkillNames: 44,
      existingSkillReferences: 20,
      newSkillPlaceholders: 26,
    });
  });

  test("把 23 个新形态、2 个首领占位、13 个特性和 26 个展示占位技能写入活动快照", () => {
    const before = baselineSnapshot();
    const beforeSpiritNames = new Set(before.spirits.map(({ fullName }) => fullName));
    const beforeTraitNames = new Set(before.traits.map(({ name }) => name));
    expect(FINAL_NAMES.every((name) => !beforeSpiritNames.has(name))).toBe(true);
    expect(TRAIT_NAMES.every((name) => !beforeTraitNames.has(name))).toBe(true);

    const patched = applyS4PreviewCatalog(before, candidate);
    expect(patched.spirits).toHaveLength(before.spirits.length + 25);
    expect(patched.learnsets).toHaveLength(before.learnsets.length + 25);
    expect(patched.traits).toHaveLength(before.traits.length + 13);
    expect(patched.skills).toHaveLength(before.skills.length + 26);
    const previewSkills = patched.skills.filter(({ name }) =>
      PREVIEW_SKILL_NAMES.has(name)
    );
    expect(previewSkills).toHaveLength(26);
    expect(previewSkills.every((skill) =>
      skill.asset?.status === "temporary-preview" &&
      skill.asset?.replacementPending === true &&
      skill.asset?.sourceUrl === `/assets/skills/${skill.id}.png` &&
      existsSync(`public${skill.asset.sourceUrl}`)
    )).toBe(true);
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
        bossPlaceholders: 2,
        newSkillPlaceholders: 26,
      },
    });
    expect(patched.meta.counts).toMatchObject({
      spirits: before.spirits.length + 25,
      learnsets: before.learnsets.length + 25,
      skills: before.skills.length + 26,
      traits: before.traits.length + 13,
    });
  });

  test("最终形态学习面严格保持资料顺序，未知参数只作展示占位", () => {
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

    expect(Object.fromEntries(
      Object.keys(OFFICIAL_SKILL_PARAMETERS).map((name) => {
        const skill = patched.skills.find((candidate) => candidate.name === name);
        return [name, [skill.type, skill.category, skill.cost, skill.basePower]];
      }),
    )).toEqual(OFFICIAL_SKILL_PARAMETERS);

    for (const name of Object.keys(OFFICIAL_SKILL_PARAMETERS)) {
      const skill = patched.skills.find((entry) => entry.name === name);
      expect(skill).not.toHaveProperty("calculationStatus");
      expect(skill.provenance.cost.url).toBe(
        candidate.meta.skillParameterSource.url,
      );
    }

    for (const name of ["降雨", "午夜爆音"]) {
      expect(patched.skills.find((skill) => skill.name === name)).toMatchObject({
        basePower: null,
        calculationStatus: "pending-skill-data",
        category: null,
        cost: null,
        type: null,
      });
    }

    const wolf = patched.spirits.find(({ fullName }) => fullName === "银月狼王");
    const wolfLearnset = patched.learnsets.find(({ spiritId }) => spiritId === wolf.id);
    expect(wolfLearnset.skillIds.map((id) => skillById.get(id)?.name)).toEqual([
      "离魂术",
      "掠影",
      "重组",
      "月蚀",
      "撞鬼",
      "火焰切割",
    ]);
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

  test("226 套热门配置包含 11 只 S4 最终形态和两只首领的完整预设", () => {
    const patched = applyS4PreviewCatalog(baselineSnapshot(), candidate);
    const skillByName = new Map(patched.skills.map((skill) => [skill.name, skill.id]));
    const entryBySpiritId = new Map(
      popularConfigs.entries.map((entry) => [entry.spiritId, entry]),
    );

    expect(popularConfigs.entryCount).toBe(226);
    expect(popularConfigs.entries).toHaveLength(226);
    for (const family of candidate.families) {
      const form = family.forms.find(({ isFinal }) => isFinal);
      const spirit = patched.spirits.find(({ fullName }) => fullName === form.name);
      const entry = entryBySpiritId.get(spirit.id);
      expect(entry).toMatchObject({
        natureId: form.previewDefaults.natureId,
        displayIvs: form.previewDefaults.displayIvs,
        skills: family.skills.slice(0, 4).map(({ name }) => skillByName.get(name)),
      });
    }
    for (const expected of [
      {
        name: "烈焰狂战士",
        natureId: "peaceful",
        displayIvs: {
          hp: 60,
          speed: 0,
          physicalAttack: 60,
          magicalAttack: 0,
          physicalDefense: 60,
          magicalDefense: 0,
        },
        skills: ["撕咬", "双响炮", "先发制人", "力量增效"],
      },
      {
        name: "满月砣",
        natureId: "silent",
        displayIvs: {
          hp: 60,
          speed: 0,
          physicalAttack: 0,
          magicalAttack: 0,
          physicalDefense: 60,
          magicalDefense: 60,
        },
        skills: ["不可接触", "疫病吐息", "毒孢子", "毒雾"],
      },
    ]) {
      const spirit = patched.spirits.find(
        ({ fullName }) => fullName === expected.name,
      );
      expect(entryBySpiritId.get(spirit.id)).toMatchObject({
        natureId: expected.natureId,
        displayIvs: expected.displayIvs,
        skills: expected.skills.map((name) => skillByName.get(name)),
        traitValues: {},
      });
    }
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

  test("两个首领占位继承基础战斗数据，并分别采用声明的头像策略", () => {
    const before = baselineSnapshot();
    const patched = applyS4PreviewCatalog(before, candidate);

    for (const expected of BOSS_CONFIGS) {
      const catalogEntry = candidate.bossPlaceholders.find(
        ({ name }) => name === expected.name,
      );
      const baseSpirit = before.spirits.find(
        ({ fullName }) => fullName === expected.baseSpiritFullName,
      );
      const baseLearnset = before.learnsets.find(
        ({ spiritId }) => spiritId === baseSpirit.id,
      );
      const boss = patched.spirits.find(
        ({ fullName }) => fullName === expected.name,
      );
      const trait = patched.traits.find(
        ({ name }) => name === expected.traitName,
      );
      const learnset = patched.learnsets.find(
        ({ spiritId }) => spiritId === boss.id,
      );

      expect(catalogEntry).toMatchObject({
        baseSpiritId: baseSpirit.id,
        baseSpiritFullName: expected.baseSpiritFullName,
        dexNoStrategy: "copy-base-exact",
        raceStatsStrategy: "copy-base-exact",
        assetStrategy: expected.assetStrategy,
      });
      expect(boss).toMatchObject({
        dexNo: baseSpirit.dexNo,
        fullName: expected.name,
        stage: "首领",
        sourceCategory: "首领形态",
        traitIds: [trait.id],
        traitName: expected.traitName,
      });
      expect(boss.types).toEqual(baseSpirit.types);
      expect(boss.raceStats).toEqual(baseSpirit.raceStats);
      const expectedEvolutionChainNames = [
        ...new Set([
          ...(baseSpirit.evolutionChainNames ?? [baseSpirit.fullName]),
          expected.name,
        ]),
      ];
      expect(boss.evolutionChainNames).toEqual(expectedEvolutionChainNames);
      for (const chainName of expectedEvolutionChainNames) {
        const chainSpirit = patched.spirits.find(
          ({ fullName }) => fullName === chainName,
        );
        expect(chainSpirit.evolutionChainNames).toContain(expected.name);
      }
      if (expected.assetStrategy === "official-video-frame-temporary") {
        expect(boss.asset).toMatchObject({
          sourceUrl: `/assets/spirits/${boss.id}.png`,
          width: 128,
          height: 128,
          status: "temporary-preview",
          replacementPending: true,
        });
        expect(boss.provenance.asset).toMatchObject({
          url: candidate.meta.skillParameterSource.url,
          evidenceTimestamp: expected.assetEvidenceTimestamp,
          sourceFile: expected.assetSourceFile,
          usage: "temporary-video-frame",
        });
        expect(boss.provenance.previewIdentity.inheritedFields)
          .not.toContain("asset");
      } else {
        expect(boss.asset).toMatchObject({
          sourceUrl: baseSpirit.asset.sourceUrl,
          status: "inherited-placeholder",
          replacementPending: true,
        });
        expect(boss.provenance.previewIdentity.inheritedFields)
          .toContain("asset");
      }
      expect(boss.provenance.previewIdentity).toMatchObject({
        baseSpiritId: baseSpirit.id,
        catalogId: candidate.meta.id,
        formalDataPending: true,
      });
      expect(boss.traitIds).not.toContain(baseSpirit.traitIds[0]);
      expect(trait.provenance.previewStatus.adaptationStatus)
        .toBe(expected.adaptationStatus);
      expect(learnset.skillIds).toEqual(baseLearnset.skillIds);
      expect(learnset.defaultSkillIds).toEqual(baseLearnset.defaultSkillIds);
      expect(learnset.acquisitions).toEqual(baseLearnset.acquisitions);
      expect(
        patched.currentPatchChanges.spirits.find(
          ({ entityId }) => entityId === boss.id,
        ),
      ).toMatchObject({
        entityName: expected.name,
        isNew: true,
        items: [
          expect.objectContaining({ kind: "new", label: "新增首领占位" }),
        ],
      });
    }
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
