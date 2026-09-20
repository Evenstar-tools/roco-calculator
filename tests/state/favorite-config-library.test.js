import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import { getNature } from "../../src/domain/natures.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import {
  FAVORITE_CONFIG_LIBRARY_FORMAT,
  FAVORITE_CONFIG_LIBRARY_MAX_BYTES,
  applyFavoriteConfigLibraryImport,
  buildFavoriteConfigLibrary,
  parseFavoriteConfigLibrary,
  formatConfigLibraryImportResult,
} from "../../src/state/favorite-config-library.js";
import { canonicalTraitControlKey } from "../../src/state/trait-values.js";
import { POPULAR_CONFIG_COUNT } from "../../src/data/preset-metadata.js";

const IVS = {
  hp: 0,
  speed: 60,
  physicalAttack: 60,
  magicalAttack: 60,
  physicalDefense: 0,
  magicalDefense: 0,
};

const AUDITED_POPULAR_CONFIG_IDS = [
  "spirit_4c280ecf82adb90e",
  "spirit_f7e8528a743eaaf0",
  "spirit_03d719be9841704e",
  "spirit_3b52748976f979f2",
  "spirit_d4a7177497e7250e",
  "spirit_5ee78de2be28a163",
  "spirit_57fff877bf40ffd4",
  "spirit_7c31fbd89f093c5d",
  "spirit_800a0042f52851cf",
  "spirit_b83bc4598f48c604",
  "spirit_d4f6e1e80d4f396e",
  "spirit_f99f67a3721ea123",
  "spirit_ee30eb99632df5ce",
  "spirit_c245104fe73fad25",
  "spirit_3ba0ecc3da584c40",
  "spirit_c81d428eaaa8e87b",
];

function snapshot() {
  return {
    skills: [
      { id: "skill-a", name: "技能 A" },
      { id: "skill-b", name: "技能 B" },
    ],
    spirits: [
      { id: "spirit-a", fullName: "形态 A", traitIds: ["trait-ignite"] },
      { id: "spirit-b", fullName: "形态 B", traitIds: [] },
    ],
    traits: [
      {
        id: "trait-ignite",
        name: "点燃",
        description: "每层增加双攻双防。",
      },
    ],
  };
}

function config(spiritId = "spirit-a") {
  return {
    displayIvs: { ...IVS },
    natureId: "adamant",
    skills: {
      four: ["skill-a", { skillId: "skill-b" }, null, null],
      single: { skillId: "skill-a", overrides: { basePower: 999 } },
    },
    spiritId,
    traitValues: {},
    updatedAt: "2026-08-03T01:00:00.000Z",
  };
}

function library(entries) {
  return {
    format: FAVORITE_CONFIG_LIBRARY_FORMAT,
    schemaVersion: 1,
    appVersion: "1.3.1",
    versions: { data: "S3", rules: "2026-08-03" },
    exportedAt: "2026-08-03T01:02:00.000Z",
    entryCount: entries.length,
    entries,
  };
}

describe("buildFavoriteConfigLibrary", () => {
  test("exports only configured manual favorites and removes battle-only skill state", () => {
    const result = buildFavoriteConfigLibrary({
      appVersion: "1.3.1",
      favorites: [
        { id: "spirit:spirit-a", kind: "spirit", spiritId: "spirit-a" },
        { id: "spirit:spirit-b", kind: "spirit", spiritId: "spirit-b" },
      ],
      now: () => "2026-08-03T01:02:00.000Z",
      snapshot: snapshot(),
      spiritConfigs: {
        configs: {
          "spirit-a": config(),
          "not-favorite": config("not-favorite"),
        },
      },
      versions: { data: "S3", rules: "2026-08-03" },
    });

    expect(result.exportedCount).toBe(1);
    expect(result.skippedUnconfiguredCount).toBe(1);
    expect(result.library.entries).toEqual([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: ["skill-a", "skill-b", null, null],
        traitValues: {},
      },
    ]);
    expect(result.library.entryCount).toBe(1);
  });

  test("exports complete remembered configurations even when they were not manually favorited", () => {
    const result = buildFavoriteConfigLibrary({
      appVersion: "1.3.2",
      favorites: [],
      now: () => "2026-08-03T01:02:00.000Z",
      snapshot: snapshot(),
      spiritConfigs: {
        configs: {
          "spirit-a": config(),
        },
      },
      versions: { data: "S3", rules: "2026-08-03" },
    });

    expect(result.exportedCount).toBe(1);
    expect(result.autoIncludedCount).toBe(1);
    expect(result.manualConfiguredCount).toBe(0);
    expect(result.library.entries[0].spiritId).toBe("spirit-a");
  });

  test("exports and parses all seven slots for a dazzling spirit", () => {
    const data = snapshot();
    data.skills.push(...["c", "d", "e", "f", "g"].map((suffix) => ({
      id: `skill-${suffix}`,
      name: `技能 ${suffix.toUpperCase()}`,
    })));
    data.traits.push({ id: "trait-dazzling", name: "夺目" });
    data.spirits.push({
      id: "rainbow-unicorn",
      fullName: "彩虹独角兽",
      traitIds: ["trait-dazzling"],
    });
    const sevenSkills = ["skill-a", "skill-b", "skill-c", "skill-d", "skill-e", "skill-f", "skill-g"];
    const result = buildFavoriteConfigLibrary({
      appVersion: "1.3.6",
      favorites: [{ kind: "spirit", spiritId: "rainbow-unicorn" }],
      snapshot: data,
      spiritConfigs: {
        configs: {
          "rainbow-unicorn": {
            ...config("rainbow-unicorn"),
            skills: { four: sevenSkills, single: "skill-a" },
          },
        },
      },
      versions: {},
    });

    expect(result.library.entries[0].skills).toEqual(sevenSkills);
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(result.library), {
      snapshot: data,
    });
    expect(parsed.entries[0].skills).toEqual(sevenSkills);
  });
});

describe("bundled popular config library", () => {
  test("遁地鼠储水形态按截图使用平和、生命物攻速度个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find(({ spiritId }) => spiritId === "spirit_7da7428d895df131")).toEqual({
      spiritId: "spirit_7da7428d895df131", natureId: "peaceful",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 60, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_e8ae25185fcd9973", "skill_803bb4da56d33ce1", "skill_d2858245ecbdd89d", "skill_b67699fa9b91b710"],
      traitValues: {},
    });
  });
  test("星光狮月光形态按截图配招并保存电流刺激开启，电弧迸发默认开启", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    const entry = library.entries.find(({ spiritId }) => spiritId === "spirit_e0fd67c2b0e5c25a");
    expect(entry).toEqual({
      spiritId: "spirit_e0fd67c2b0e5c25a", natureId: "cheerful",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 60, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_794ee1751d9411e8", "skill_be1a16f6da08c932", "skill_50d37932783c1b9d", "skill_dbd391c5f03728c9"],
      traitValues: { "trait.burstTriggered.9472be83": true, "trait.traitEffect.3c554174": 40 },
    });
    const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
    const spirit = snapshot.spirits.find(({ id }) => id === entry.spiritId);
    const trigger = getTraitView(snapshot, spirit, "attacker").inputs.find(({ contextKey }) => contextKey === "burstTriggered");
    expect(entry.traitValues[canonicalTraitControlKey(trigger)]).toBe(true);
    const arc = snapshot.skills.find(({ id }) => id === entry.skills[2]);
    expect(getSkillEffectInputs(arc).find(({ contextKey }) => contextKey === "burstTriggered").defaultValue).toBe(true);
  });
  test.each([
    ["棋绮后（白子）", "spirit_b8395532616fe541"],
    ["棋绮后（黑子）", "spirit_03d719be9841704e"],
    ["棋契陛下（白棋棋绮后分支）", "spirit_d4a7177497e7250e"],
    ["棋契陛下（黑棋棋绮后分支）", "spirit_3b52748976f979f2"],
  ])("%s 按截图统一开朗、生命物攻速度个体、四技能及默认特性层数", (_name, spiritId) => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find((entry) => entry.spiritId === spiritId)).toEqual({
      spiritId, natureId: "cheerful",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 60, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_210a30ff4c9d8a00", "skill_dbd391c5f03728c9", "skill_d2b3e8ce739d1e22", "skill_3d69dc97bb34a4d3"],
      traitValues: {},
    });
  });
  test("水泡壳蜕皮形态按截图使用踏实、生命魔攻物防个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find(({ spiritId }) => spiritId === "spirit_fd0cadca98778205")).toEqual({
      spiritId: "spirit_fd0cadca98778205", natureId: "grounded",
      displayIvs: { hp: 60, speed: 0, physicalAttack: 0, magicalAttack: 60, physicalDefense: 60, magicalDefense: 0 },
      skills: ["skill_b563342aca04c471", "skill_a52aca8607fb6062", "skill_dd8c685af8c6ab28", "skill_193d9030cf2063a5"],
      traitValues: {},
    });
  });
  test("星星眼按截图使用聪明、生命魔攻速度个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find(({ spiritId }) => spiritId === "spirit_9f9a5018b4cb3927")).toEqual({
      spiritId: "spirit_9f9a5018b4cb3927", natureId: "smart",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 0, magicalAttack: 60, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_38827e39dbdda074", "skill_e7190f67c1436b31", "skill_de420bb66be86bf2", "skill_b1f12cdc4830276c"],
      traitValues: {},
    });
  });
  test("智辉章脑按截图使用聪明、生命魔攻速度个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find(({ spiritId }) => spiritId === "spirit_18d38a10544a16ea")).toEqual({
      spiritId: "spirit_18d38a10544a16ea", natureId: "smart",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 0, magicalAttack: 60, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_3790e75019a19a26", "skill_730f89409835a4b8", "skill_2ae4c263b33b942e", "skill_ad5b57d0e9427544"],
      traitValues: {},
    });
  });
  test("未完虫按截图使用固执、生命物攻速度个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find(({ spiritId }) => spiritId === "spirit_200b70f549b632c9")).toEqual({
      spiritId: "spirit_200b70f549b632c9", natureId: "adamant",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 60, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_dfe7184d14b2edcb", "skill_7023738b1f109dc1", "skill_5617ecc3caef7918", "skill_4375736cdfafd6a1"],
      traitValues: {},
    });
  });
  test("测风蝉按截图使用踏实、生命双防个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find(({ spiritId }) => spiritId === "spirit_8735efa1d0793f6a")).toEqual({
      spiritId: "spirit_8735efa1d0793f6a", natureId: "grounded",
      displayIvs: { hp: 60, speed: 0, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60 },
      skills: ["skill_7435a26c20c14c4f", "skill_87c9f33eaa047cf1", "skill_917448f6d23ba354", "skill_808e1f607ccd30fa"],
      traitValues: {},
    });
  });
  test("加尔按截图使用沉默、生命魔攻速度个体及指定四技能顺序", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    const entry = library.entries.find(({ spiritId }) => spiritId === "spirit_837f83264c04abe9");
    expect(entry).toEqual({
      spiritId: "spirit_837f83264c04abe9", natureId: "silent",
      displayIvs: { hp: 60, speed: 60, physicalAttack: 0, magicalAttack: 60, physicalDefense: 0, magicalDefense: 0 },
      skills: ["skill_5b63e27eb533acc7", "skill_36daddc54d5080ac", "skill_ae8d9f6a8367af02", "skill_87a6120cd7f66c8e"],
      traitValues: {},
    });
  });
  test("机幕方舟按截图使用沉默、满生命双防及电系愿力冲击", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    const entry = library.entries.find(({ spiritId }) => spiritId === "spirit_37e0a0d6a0d4b993");
    expect(entry).toEqual({
      spiritId: "spirit_37e0a0d6a0d4b993", natureId: "silent",
      displayIvs: { hp: 60, speed: 0, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60 },
      skills: ["skill_373ec31edf013da6", "skill_87c9f33eaa047cf1", "calculator_wish_power_electric", "skill_58d84e9ffcc63857"],
      traitValues: {},
    });
  });
  test.each([
    ["圣凯布米龙", "spirit_5f3ff5817d7871b8", ["暖阳", "星火", "热身", "虫击"]],
    ["波普鹿", "spirit_7d22156a66708de3", ["电弧", "裂石", "下注", "先发制人"]],
    ["银月狼王", "spirit_b689c0de815c95ef", ["岩脉崩毁", "撞鬼", "困兽", "月蚀"]],
    ["布灵布灵", "spirit_de488be076aaad90", ["闪光弹", "量子涨落", "透镜实验", "影袭"]],
    ["饮雪狂兽", "spirit_c0b03ac594c86309", ["雪原狩猎", "冷凝", "跺地", "力量增效"]],
  ])("keeps %s aligned with the requested preset", (_name, spiritId, skillNames) => {
    const library = JSON.parse(readFileSync(
      "public/data/presets/pvp-popular-configs.json", "utf8",
    ));
    const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
    const entry = library.entries.find((item) => item.spiritId === spiritId);

    expect(entry.natureId).toBe("cheerful");
    expect(entry.displayIvs).toEqual({
      hp: 60, speed: 60, physicalAttack: 60,
      magicalAttack: 0, physicalDefense: 0, magicalDefense: 0,
    });
    expect(entry.skills.map((id) => snapshot.skills.find((skill) => skill.id === id)?.name))
      .toEqual(skillNames);
  });

  test.each([
    ["布灵布灵", 7, ["闪光弹", "量子涨落", "透镜实验", "影袭"]],
    ["离心舞者", 1, ["翼击", "离子震荡", "大爆炸", "多维击打"]],
  ])("保留 9 月 14 日确认的 %s 层数及配招顺序", (name, stacks, skills) => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
    const spirit = snapshot.spirits.find((item) => item.fullName === name);
    const entry = library.entries.find((item) => item.spiritId === spirit.id);
    const control = getTraitView(snapshot, spirit, "attacker").inputs.find((item) => item.contextKey === "attackerTraitStacks");
    expect(entry.traitValues[canonicalTraitControlKey(control)]).toBe(stacks);
    expect(entry.skills.map((id) => snapshot.skills.find((skill) => skill.id === id)?.name)).toEqual(skills);
  });

  test("画间沉铁兽使用固执，不再由性格降低物防", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    const entry = library.entries.find((item) => item.spiritId === "spirit_4a91bd3db13b8a07");
    expect(entry.natureId).toBe("adamant");
  });

  test.each([
    ["女王蜂", "spirit_7ae10f79a1849af1"],
    ["声波缇塔", "spirit_24ff0f0e3504e1ca"],
    ["霜翼领主（夏天的样子）", "spirit_9f8c8d8139b244ab"],
  ])("%s 使用开朗，不再由性格降低魔防", (_name, id) => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    expect(library.entries.find((entry) => entry.spiritId === id).natureId).toBe("cheerful");
  });

  test("格兰球按截图携带色散、吹散、灵媒、叶绿光束，保留其余配置", () => {
    const library = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
    const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
    const entry = library.entries.find((item) => item.spiritId === "spirit_8de88e249e9a78f0");
    expect(entry.skills.map((id) => snapshot.skills.find((skill) => skill.id === id)?.name))
      .toEqual(["色散", "吹散", "灵媒", "叶绿光束"]);
    expect(entry.natureId).toBe("smart");
    expect(entry.displayIvs).toEqual({ hp: 60, speed: 0, physicalAttack: 0, magicalAttack: 60, physicalDefense: 60, magicalDefense: 0 });
    expect(entry.traitValues).toEqual({});
  });

  test("contains the declared number of valid spirit configurations", () => {
    const libraryText = readFileSync(
      "public/data/presets/pvp-popular-configs.json",
      "utf8",
    );
    const library = JSON.parse(libraryText);
    const currentSnapshot = withCalculatorExtras(JSON.parse(
      readFileSync("public/data/runtime.json", "utf8"),
    ));
    const parsed = parseFavoriteConfigLibrary(libraryText, {
      currentVersions: {
        data: currentSnapshot.meta.id,
        rules: currentSnapshot.meta.rulesVersion,
      },
      snapshot: currentSnapshot,
    });

    expect(library.format).toBe(FAVORITE_CONFIG_LIBRARY_FORMAT);
    expect(library.entryCount).toBe(POPULAR_CONFIG_COUNT);
    expect(library.entries).toHaveLength(POPULAR_CONFIG_COUNT);
    expect(parsed.entries).toHaveLength(POPULAR_CONFIG_COUNT);
    expect(parsed.preview.missingSpirits).toBe(0);
    expect(parsed.preview.unknownTraitFields).toBe(0);
    expect(parsed.preview.invalidEntries).toBe(0);
    expect(parsed.warnings).toEqual([]);
  });

  test("keeps exactly three full IVs and none in the nature-reduced stat", () => {
    const library = JSON.parse(readFileSync(
      "public/data/presets/pvp-popular-configs.json",
      "utf8",
    ));
    const natureConflicts = library.entries.flatMap((entry) => {
      const nature = getNature(entry.natureId);
      const reducedIv = nature.downStat
        ? Number(entry.displayIvs[nature.downStat] ?? 0)
        : 0;
      return reducedIv > 0
        ? [{
          natureId: entry.natureId,
          reducedIv,
          reducedStat: nature.downStat,
          spiritId: entry.spiritId,
        }]
        : [];
    });
    const invalidAllocations = library.entries.flatMap((entry) => {
      const values = Object.values(entry.displayIvs);
      const fullIvCount = values.filter((value) => value === 60).length;
      return values.length !== 6 ||
        values.some((value) => value !== 0 && value !== 60) ||
        fullIvCount !== 3
        ? [{ fullIvCount, spiritId: entry.spiritId }]
        : [];
    });

    expect(natureConflicts).toEqual([]);
    expect(invalidAllocations).toEqual([]);
  });

  test("keeps the audited presets aligned with their equipped attack skills", () => {
    const library = JSON.parse(readFileSync(
      "public/data/presets/pvp-popular-configs.json",
      "utf8",
    ));
    const currentSnapshot = JSON.parse(
      readFileSync("public/data/runtime.json", "utf8"),
    );
    const skillById = new Map(
      currentSnapshot.skills.map((skill) => [skill.id, skill]),
    );
    const entryBySpiritId = new Map(
      library.entries.map((entry) => [entry.spiritId, entry]),
    );

    for (const spiritId of AUDITED_POPULAR_CONFIG_IDS) {
      const entry = entryBySpiritId.get(spiritId);
      const attackCategories = new Set(entry.skills
        .map((skillId) => skillById.get(skillId)?.category)
        .filter((category) => category === "physical" || category === "magical"));
      expect([...attackCategories]).toHaveLength(1);
      const category = [...attackCategories][0];
      const investedStat = category === "physical"
        ? "physicalAttack"
        : "magicalAttack";
      const reducedStat = category === "physical"
        ? "magicalAttack"
        : "physicalAttack";

      expect(entry.displayIvs[investedStat]).toBe(60);
      expect(entry.displayIvs[reducedStat]).toBe(0);
      expect(getNature(entry.natureId).downStat).toBe(reducedStat);
    }
  });
});

describe("parseFavoriteConfigLibrary", () => {
  test("previews additions, overwrites, duplicate entries, missing skills and missing spirits", () => {
    const first = {
      spiritId: "spirit-a",
      natureId: "adamant",
      displayIvs: IVS,
      skills: ["skill-a", "missing-skill", null, null],
      traitValues: { "trait.unknown.deadbeef": true },
    };
    const replacement = { ...first, natureId: "smart" };
    const parsed = parseFavoriteConfigLibrary(
      JSON.stringify(library([
        first,
        { ...first, spiritId: "missing-spirit" },
        replacement,
      ])),
      {
        currentVersions: { data: "S4", rules: "2026-08-04" },
        existingFavorites: [],
        existingSpiritConfigs: { configs: { "spirit-a": config() } },
        snapshot: snapshot(),
      },
    );

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      natureId: "smart",
      skills: ["skill-a", null, null, null],
      traitValues: {},
    });
    expect(parsed.preview).toMatchObject({
      added: 0,
      duplicateEntries: 1,
      favoritesAdded: 1,
      missingSkills: 1,
      missingSpirits: 1,
      overwritten: 0,
      different: 1,
      unknownTraitFields: 1,
    });
    expect(parsed.warnings).toHaveLength(2);
  });

  test("keeps the last valid duplicate when a later duplicate is invalid", () => {
    const valid = {
      spiritId: "spirit-a",
      natureId: "adamant",
      displayIvs: IVS,
      skills: ["skill-a", null, null, null],
      traitValues: {},
    };
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      valid,
      { ...valid, natureId: "not-a-nature" },
    ])), { snapshot: snapshot(), currentVersions: {} });

    expect(parsed.entries).toEqual([valid]);
    expect(parsed.preview.duplicateEntries).toBe(1);
    expect(parsed.preview.invalidEntries).toBe(1);
    expect(parsed.issueDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "已跳过，继续使用文件中上一条有效配置",
        entryIndex: 2,
        spiritId: "spirit-a",
        type: "invalidEntries",
      }),
    ]));
  });

  test("rejects invalid entries instead of silently fixing nature or IVs", () => {
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "not-a-nature",
        displayIvs: { ...IVS, hp: 61 },
        skills: [null, null, null, null],
        traitValues: {},
      },
    ])), { snapshot: snapshot(), currentVersions: {} });

    expect(parsed.entries).toEqual([]);
    expect(parsed.preview.invalidEntries).toBe(1);
    expect(parsed.issueDetails).toEqual([
      expect.objectContaining({
        entryIndex: 1,
        reason: expect.stringContaining("性格"),
        spiritId: "spirit-a",
        spiritName: "形态 A",
        type: "invalidEntries",
      }),
    ]);
  });

  test("pads legacy four-skill entries when the current spirit has seven slots", () => {
    const data = snapshot();
    data.traits.push({ id: "trait-dazzling", name: "夺目" });
    data.spirits.push({
      id: "rainbow-unicorn",
      fullName: "彩虹独角兽",
      traitIds: ["trait-dazzling"],
    });
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([{
      spiritId: "rainbow-unicorn",
      natureId: "timid",
      displayIvs: IVS,
      skills: ["skill-a", "skill-b", null, null],
      traitValues: {},
    }])), { snapshot: data, currentVersions: {} });

    expect(parsed.entries[0].skills).toEqual([
      "skill-a",
      "skill-b",
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(parsed.preview.invalidEntries).toBe(0);
    expect(parsed.preview.repairedEntries).toBe(1);
    expect(parsed.issueDetails).toEqual([
      expect.objectContaining({
        action: "已保留原四技能，并补齐 3 个空技能槽",
        entryIndex: 1,
        spiritId: "rainbow-unicorn",
        spiritName: "彩虹独角兽",
        type: "repairedEntries",
      }),
    ]);
  });

  test("keeps valid trait values but ignores values outside current bounds", () => {
    const data = snapshot();
    const stackControl = getTraitView(
      data,
      data.spirits[0],
      "attacker",
    ).inputs.find((control) => control.contextKey === "attackerTraitStacks");
    const traitKey = canonicalTraitControlKey(stackControl);
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: [null, null, null, null],
        traitValues: { [traitKey]: 999 },
      },
    ])), { snapshot: data, currentVersions: {} });

    expect(parsed.entries[0].traitValues).toEqual({});
    expect(parsed.preview.unknownTraitFields).toBe(1);
  });

  test("converts legacy favorite arrays without inventing empty configs", () => {
    const parsed = parseFavoriteConfigLibrary(JSON.stringify([
      { kind: "spirit", spiritId: "spirit-b" },
      {
        kind: "spirit",
        spiritId: "spirit-a",
        state: {
          sides: {
            attacker: {
              ...config(),
              nature: "adamant",
            },
          },
        },
      },
    ]), { snapshot: snapshot(), currentVersions: {} });

    expect(parsed.format).toBe("legacy-favorites");
    expect(parsed.entries.map((entry) => entry.spiritId)).toEqual(["spirit-a"]);
    expect(parsed.favoriteSpiritIds).toEqual(["spirit-b", "spirit-a"]);
  });

  test("rejects unsupported schemas and oversized entry sets", () => {
    expect(() => parseFavoriteConfigLibrary(
      "{broken",
      { snapshot: snapshot(), currentVersions: {} },
    )).toThrow(/无法解析/);

    expect(() => parseFavoriteConfigLibrary(JSON.stringify({
      ...library([]),
      schemaVersion: 99,
    }), { snapshot: snapshot(), currentVersions: {} })).toThrow(/版本/);

    expect(() => parseFavoriteConfigLibrary(JSON.stringify(library(
      Array.from({ length: 2001 }, () => ({ })),
    )), { snapshot: snapshot(), currentVersions: {} })).toThrow(/2000/);

    const oversized = " ".repeat(FAVORITE_CONFIG_LIBRARY_MAX_BYTES + 1);
    expect(() => parseFavoriteConfigLibrary(
      oversized,
      { snapshot: snapshot(), currentVersions: {} },
    )).toThrow(/5 MB/);
  });
});

describe("applyFavoriteConfigLibraryImport", () => {
  function memoryStores(initialConfigs = {}, initialFavorites = []) {
    let configs = { configs: structuredClone(initialConfigs), schemaVersion: 2 };
    let favorites = structuredClone(initialFavorites);
    return {
      spiritConfigsRepository: { load: () => configs, replace: vi.fn((next) => (configs = next)) },
      favoritesRepository: { list: () => favorites, replace: vi.fn((next) => (favorites = next)) },
    };
  }
  function encodedConfig() {
    return { spiritId: "spirit-a", natureId: "adamant", displayIvs: IVS, skills: ["skill-a", "skill-b", null, null], traitValues: {} };
  }

  test("重复导入内容相同的配置零写入，保留时间和手动技能参数", () => {
    const local = config();
    const favorites = [{ id: "spirit:spirit-a", kind: "spirit", spiritId: "spirit-a", note: "本地信息" }];
    const stores = memoryStores({ "spirit-a": local }, favorites);
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([encodedConfig()])), {
      snapshot: snapshot(), existingSpiritConfigs: stores.spiritConfigsRepository.load(), existingFavorites: favorites,
    });
    expect(parsed.preview).toMatchObject({ same: 1, different: 0, added: 0 });
    expect(parsed.changes).toEqual([]);
    const result = applyFavoriteConfigLibraryImport({ ...stores, parsed, snapshot: snapshot() });
    expect(result.configs.configs["spirit-a"]).toEqual(local);
    expect(stores.spiritConfigsRepository.replace).not.toHaveBeenCalled();
    expect(stores.favoritesRepository.replace).not.toHaveBeenCalled();
    expect(formatConfigLibraryImportResult(result.preview)).toBe("配置与本地一致，无需更新。");
  });

  test("不同项只报告字段差异，新增可导入，确认时保护预览后新建的本地配置", () => {
    const local = config();
    const changed = { ...encodedConfig(), natureId: "timid", skills: ["skill-b", "skill-a", null, null] };
    const stores = memoryStores({ "spirit-a": local });
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([changed, { ...encodedConfig(), spiritId: "spirit-b" }])), {
      snapshot: snapshot(), existingSpiritConfigs: stores.spiritConfigsRepository.load(),
    });
    expect(parsed.preview).toMatchObject({ same: 0, different: 1, added: 1 });
    expect(parsed.changes[0].differences.map((d) => d.field)).toEqual(["性格", "技能1", "技能2"]);
    const newLocal = { ...config("spirit-b"), natureId: "smart" };
    stores.spiritConfigsRepository.load().configs["spirit-b"] = newLocal;
    const result = applyFavoriteConfigLibraryImport({ ...stores, parsed, snapshot: snapshot() });
    expect(result.preview).toMatchObject({ added: 0, different: 2, overwritten: 0 });
    expect(result.configs.configs).toEqual({ "spirit-a": local, "spirit-b": newLocal });
    expect(stores.spiritConfigsRepository.replace).not.toHaveBeenCalled();
    expect(formatConfigLibraryImportResult(result.preview)).toContain("保留手改 2 条");
  });

  test("新增后再次导入为相同，配置和收藏不重复写入", () => {
    const stores = memoryStores();
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([encodedConfig()])), { snapshot: snapshot() });
    expect(applyFavoriteConfigLibraryImport({ ...stores, parsed, snapshot: snapshot() }).preview.added).toBe(1);
    const result = applyFavoriteConfigLibraryImport({ ...stores, parsed, snapshot: snapshot() });
    expect(result.preview).toMatchObject({ added: 0, same: 1, favoritesAdded: 0 });
    expect(stores.spiritConfigsRepository.replace).toHaveBeenCalledTimes(1);
    expect(stores.favoritesRepository.replace).toHaveBeenCalledTimes(1);
  });

  test("显式默认特性值和省略默认值视为相同，特性层数变化能显示", () => {
    const control = getTraitView(snapshot(), snapshot().spirits[0], "attacker").inputs.find((input) => input.type === "number" && input.defaultValue !== undefined);
    expect(control).toBeDefined();
    const key = canonicalTraitControlKey(control);
    const local = { ...config(), traitValues: { [key]: control.defaultValue } };
    const parse = (traitValues) => parseFavoriteConfigLibrary(JSON.stringify(library([{ ...encodedConfig(), traitValues }])), {
      snapshot: snapshot(), existingSpiritConfigs: { configs: { "spirit-a": local } },
    });
    expect(parse({}).preview.same).toBe(1);
    const changed = parse({ [key]: control.defaultValue + 1 });
    expect(changed.preview.different).toBe(1);
    expect(changed.changes[0].differences[0].field).toContain("特性·");
  });

  test("commits both stores and rolls both back if the second write fails", () => {
    let favorites = [{ id: "spirit:local", kind: "spirit", spiritId: "local" }];
    let configs = { configs: { local: config("local") }, schemaVersion: 2 };
    const favoritesRepository = {
      list: () => structuredClone(favorites),
      replace: vi.fn((next) => {
        if (next.some((favorite) => favorite.spiritId === "spirit-a")) {
          throw new Error("disk full");
        }
        favorites = structuredClone(next);
        return favorites;
      }),
    };
    const spiritConfigsRepository = {
      load: () => structuredClone(configs),
      replace: vi.fn((next) => {
        configs = structuredClone(next);
        return configs;
      }),
    };
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: ["skill-a", null, null, null],
        traitValues: {},
      },
    ])), { snapshot: snapshot(), currentVersions: {} });

    expect(() => applyFavoriteConfigLibraryImport({
      favoritesRepository,
      parsed,
      snapshot: snapshot(),
      spiritConfigsRepository,
    })).toThrow(/disk full/);
    expect(favorites).toEqual([
      { id: "spirit:local", kind: "spirit", spiritId: "local" },
    ]);
    expect(configs.configs.local.spiritId).toBe("local");
    expect(configs.configs["spirit-a"]).toBeUndefined();
  });

  test("attempts every rollback and reports rollback failures after a partial favorite write", () => {
    const beforeFavorites = [
      { id: "spirit:local", kind: "spirit", spiritId: "local" },
    ];
    let favorites = structuredClone(beforeFavorites);
    let configs = { configs: { local: config("local") }, schemaVersion: 2 };
    const mainError = new Error("favorite write failed after mutation");
    const configRollbackError = new Error("config rollback failed");
    const favoritesRepository = {
      list: () => structuredClone(favorites),
      replace: vi.fn((next) => {
        favorites = structuredClone(next);
        if (favoritesRepository.replace.mock.calls.length === 1) {
          throw mainError;
        }
        return structuredClone(favorites);
      }),
    };
    const spiritConfigsRepository = {
      load: () => structuredClone(configs),
      replace: vi.fn((next) => {
        if (spiritConfigsRepository.replace.mock.calls.length === 2) {
          throw configRollbackError;
        }
        configs = structuredClone(next);
        return structuredClone(configs);
      }),
    };
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: ["skill-a", null, null, null],
        traitValues: {},
      },
    ])), { snapshot: snapshot(), currentVersions: {} });

    let thrown;
    try {
      applyFavoriteConfigLibraryImport({
        favoritesRepository,
        parsed,
        snapshot: snapshot(),
        spiritConfigsRepository,
      });
    } catch (error) {
      thrown = error;
    }

    expect(favoritesRepository.replace).toHaveBeenCalledTimes(2);
    expect(favorites).toEqual(beforeFavorites);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown.cause).toBe(mainError);
    expect(thrown.errors[0]).toBe(mainError);
    expect(thrown.errors[1]).toMatchObject({ cause: configRollbackError });
    expect(thrown.errors[1].message).toMatch(/精灵配置回滚失败/u);
    expect(thrown.message).toMatch(/导入失败.*回滚失败/u);
  });
});
