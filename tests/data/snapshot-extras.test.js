import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";

describe("withCalculatorExtras", () => {
  test("提塔只命中声波缇塔，不混入缇塔", () => {
    const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
    const index = createSpiritSearchIndex(withCalculatorExtras(snapshot).spirits);
    expect(index.search("提塔").map((spirit) => spirit.fullName)).toEqual(["声波缇塔"]);
  });

  test.each([
    ["冰布丁", "椰浆布丁"],
    ["草布丁", "抹茶布丁"],
    ["火布丁", "熔岩布丁"],
  ])("%s 只命中对应的布丁形态", (alias, name) => {
    const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
    const index = createSpiritSearchIndex(withCalculatorExtras(snapshot).spirits);
    expect(index.search(alias).map((spirit) => spirit.fullName)).toEqual([name]);
  });

  test.each([
    ["红鸟", "岚鸟（夏天的样子）"],
    ["绿鸟", "岚鸟（春天的样子）"],
    ["蓝鸟", "岚鸟"],
    ["灰鸟", "岚鸟（秋天的样子）"],
  ])("%s 只命中对应的岚鸟形态", (alias, name) => {
    const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
    const index = createSpiritSearchIndex(withCalculatorExtras(snapshot).spirits);
    expect(index.search(alias).map((spirit) => spirit.fullName)).toEqual([name]);
  });

  test("adds community aliases without changing official spirit names or mutating source data", () => {
    const snapshot = {
      meta: {},
      spirits: [
        {
          aliases: ["已有别名"],
          fullName: "白金独角兽",
          id: "spirit_07cdb4d4a94ac1bd",
        },
        {
          fullName: "水蓝蓝",
          id: "spirit_77c2085d2f6e8e87",
        },
      ],
      skills: [],
      learnsets: [],
    };

    const enriched = withCalculatorExtras(snapshot);

    expect(enriched.spirits[0]).toMatchObject({
      aliases: ["已有别名", "马头"],
      fullName: "白金独角兽",
    });
    expect(enriched.spirits[1]).toMatchObject({
      aliases: ["塑料袋", "大牌姐"],
      fullName: "水蓝蓝",
    });
    expect(snapshot.spirits[0].aliases).toEqual(["已有别名"]);
    expect(snapshot.spirits[1]).not.toHaveProperty("aliases");
    expect(withCalculatorExtras(enriched).spirits).toEqual(enriched.spirits);
  });

  test("covers every supplied community alias against the current roster", () => {
    const snapshot = JSON.parse(
      readFileSync("data/snapshots/current.json", "utf8"),
    );
    const enriched = withCalculatorExtras(snapshot);
    const aliasesByName = new Map(
      enriched.spirits.map((spirit) => [spirit.fullName, spirit.aliases ?? []]),
    );

    expect(aliasesByName.get("白金独角兽")).toContain("马头");
    expect(aliasesByName.get("彩虹独角兽")).toContain("马头");
    expect(aliasesByName.get("水蓝蓝")).toEqual(
      expect.arrayContaining(["塑料袋", "大牌姐"]),
    );
    expect(aliasesByName.get("烈火守护")).toContain("教练");
    expect(aliasesByName.get("大耳帽兜")).toContain("毛豆");
    expect(aliasesByName.get("雪影娃娃")).toContain("毛豆");
    expect(aliasesByName.get("喵喵")).toContain("胖猫");
    expect(aliasesByName.get("魔力猫")).toContain("胖猫");
    expect(aliasesByName.get("冰钻布鲁斯")).toContain("马超");
    for (const name of [
      "爬爬",
      "化蝶（平常的样子）",
      "化蝶（幽冥眼的样子）",
      "化蝶（喵喵的样子）",
      "化蝶（奇丽花的样子）",
    ]) {
      expect(aliasesByName.get(name)).toEqual(
        expect.arrayContaining(["凶", "区", "蛆"]),
      );
    }
    expect(aliasesByName.get("绒光优优")).toContain("uu");
    expect(aliasesByName.get("迷嶂布莱克")).toEqual(
      expect.arrayContaining(["石王", "布莱克岩"]),
    );
    expect(aliasesByName.get("古卷执政官")).toContain("书王");
    expect(aliasesByName.get("恶魔红钻")).toContain("我红");
    expect(aliasesByName.get("瞌睡王")).toContain("科比");
    expect(aliasesByName.get("音速犬")).toContain("火狗");
    expect(aliasesByName.get("电球咩咩")).toContain("电羊");
    expect(aliasesByName.get("圣凯布米龙")).toContain("圣甲虫");
    expect(aliasesByName.get("彩蝶鲨")).toContain("莎莎");
    expect(aliasesByName.get("嗜波螺")).toContain("菠萝");
    expect(aliasesByName.get("蜜果骸")).toContain("苹果");
    expect(aliasesByName.get("半朽蜜果灵")).toContain("苹果");
    expect(aliasesByName.get("食尘短绒")).toEqual(
      expect.arrayContaining(["UFO", "扫地机器人"]),
    );
    for (const [name, alias] of [
      ["雅丹鬃", "火马"],
      ["巨噬针鼹", "食蚁兽"],
      ["加油蟹（两只海葵的样子）", "螃蟹"],
      ["加油蟹（单只海葵的样子）", "螃蟹"],
      ["尖嘴狐仙", "狐狸"],
      ["混乱鱿彩", "鱿鱼"],
      ["秩序鱿墨", "鱿鱼"],
      ["针叶巡林", "草鹿"],
      ["波普鹿", "电鹿"],
      ["窃光蚊", "蚊子"],
      ["巨鼓象", "大象"],
      ["玳塔", "乌龟"],
    ]) {
      expect(aliasesByName.get(name)).toContain(alias);
    }
  });

  test("adds all 18 typed Wish Power variants without mutating the snapshot count", () => {
    const snapshot = {
      meta: { counts: { skills: 553 } },
      skills: [{ id: "fixture", name: "测试技能" }],
    };
    const enriched = withCalculatorExtras(snapshot);
    const wishPower = enriched.skills.filter(
      (skill) => skill.name === "愿力冲击",
    );

    expect(wishPower).toHaveLength(18);
    expect(new Set(wishPower.map((skill) => skill.id))).toHaveProperty(
      "size",
      18,
    );
    expect(new Set(wishPower.map((skill) => skill.type))).toHaveProperty(
      "size",
      18,
    );
    expect(enriched.meta.counts.skills).toBe(553);
    expect(snapshot.skills).toHaveLength(1);
  });

  test("does not duplicate variants already present in a later snapshot", () => {
    const snapshot = withCalculatorExtras({ meta: {}, skills: [] });

    expect(withCalculatorExtras(snapshot).skills).toHaveLength(
      snapshot.skills.length,
    );
  });

  test("makes every Wish Power variant cost 2 and learnable for non-boss spirits", () => {
    const snapshot = {
      meta: {},
      spirits: [
        { id: "spirit_regular", stage: "二阶" },
        { id: "spirit_boss", stage: "首领" },
      ],
      skills: [],
      learnsets: [
        { spiritId: "spirit_regular", skillIds: ["regular_skill"] },
        { spiritId: "spirit_boss", skillIds: ["boss_skill"] },
      ],
    };

    const enriched = withCalculatorExtras(snapshot);
    const wishPowerIds = enriched.skills
      .filter((skill) => skill.name === "愿力冲击")
      .map((skill) => skill.id);
    const regularLearnset = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_regular",
    );
    const bossLearnset = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_boss",
    );

    expect(
      enriched.skills
        .filter((skill) => wishPowerIds.includes(skill.id))
        .every((skill) => skill.cost === 2),
    ).toBe(true);
    expect(regularLearnset.skillIds).toEqual(
      expect.arrayContaining(wishPowerIds),
    );
    expect(bossLearnset.skillIds).not.toEqual(
      expect.arrayContaining(wishPowerIds),
    );
    expect(snapshot.learnsets[0].skillIds).toEqual(["regular_skill"]);
  });

  test("gives Dimo boss forms only the Wish Power type named by their trait", () => {
    const snapshot = {
      meta: {},
      spirits: [
        {
          id: "spirit_dimo_light_boss",
          stage: "首领",
          traitIds: ["trait_judgement"],
        },
        {
          id: "spirit_other_boss",
          stage: "首领",
          traitIds: ["trait_other"],
        },
      ],
      skills: [],
      traits: [
        {
          id: "trait_judgement",
          description: "造成克制伤害后，首个技能替换为光系愿力冲击。",
        },
        {
          id: "trait_other",
          description: "攻击时，技能威力+100%。",
        },
      ],
      learnsets: [
        { spiritId: "spirit_dimo_light_boss", skillIds: [] },
        { spiritId: "spirit_other_boss", skillIds: [] },
      ],
    };

    const enriched = withCalculatorExtras(snapshot);
    const lightBoss = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_dimo_light_boss",
    );
    const otherBoss = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_other_boss",
    );

    expect(lightBoss.skillIds).toEqual(["calculator_wish_power_light"]);
    expect(otherBoss.skillIds).toEqual([]);
  });

  test("does not give calculator-only skills to pending preview placeholders", () => {
    const snapshot = {
      meta: {},
      spirits: [
        {
          calculationStatus: "pending-race-stats",
          id: "spirit_preview",
          raceStats: null,
          stage: "一阶",
        },
      ],
      skills: [],
      learnsets: [{ spiritId: "spirit_preview", skillIds: [] }],
    };

    const enriched = withCalculatorExtras(snapshot);
    expect(enriched.learnsets[0].skillIds).toEqual([]);
  });

  test("keeps the real S3 roster aligned with regular and trait-specific boss Wish Power rules", () => {
    const snapshot = JSON.parse(
      readFileSync("data/snapshots/current.json", "utf8"),
    );
    const enriched = withCalculatorExtras(snapshot);
    const wishPowerIds = enriched.skills
      .filter((skill) => skill.name === "愿力冲击")
      .map((skill) => skill.id);
    const spiritsById = new Map(
      enriched.spirits.map((spirit) => [spirit.id, spirit]),
    );
    const traitsById = new Map(
      enriched.traits.map((trait) => [trait.id, trait]),
    );

    expect(wishPowerIds).toHaveLength(18);
    for (const learnset of enriched.learnsets) {
      const spirit = spiritsById.get(learnset.spiritId);
      const learnedWishPower = learnset.skillIds.filter((skillId) =>
        wishPowerIds.includes(skillId),
      );
      const traitDescription = (spirit.traitIds ?? [])
        .map((traitId) => traitsById.get(traitId)?.description ?? "")
        .join("\n");
      const bossWishPowerType = traitDescription.match(
        /替换为([^，。；\s]+)系愿力冲击/,
      )?.[1];

      if (spirit.calculationStatus === "pending-race-stats") {
        expect(learnedWishPower).toHaveLength(0);
      } else if (spirit.stage !== "首领") {
        expect(learnedWishPower).toHaveLength(18);
      } else if (bossWishPowerType) {
        expect(learnedWishPower).toEqual([
          enriched.skills.find(
            (skill) =>
              skill.name === "愿力冲击" && skill.type === bossWishPowerType,
          ).id,
        ]);
      } else {
        expect(learnedWishPower).toHaveLength(0);
      }
    }
  });
});
