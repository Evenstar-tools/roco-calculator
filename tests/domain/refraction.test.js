import { describe, expect, test } from "vitest";
import {
  buildRefractionHint,
  resolveRefractionEffects,
} from "../../src/domain/refraction.js";

const skill = (name, type) => ({ id: `${name}-${type}`, name, type });

describe("refraction", () => {
  test("applies each carried type once and excludes Refraction itself", () => {
    const selectedSkill = skill("折射", "光");
    const result = resolveRefractionEffects({
      selectedSkill,
      carriedSkills: [
        selectedSkill,
        skill("追打", "普通"),
        skill("另一个普通技能", "普通"),
        skill("回旋风暴", "翼"),
      ],
    });

    expect(result.types).toEqual(["普通", "翼"]);
    expect(result.deltas).toMatchObject({
      ownFixedPower: 10,
      ownHitCountAdd: 1,
    });
    expect(result.summary).toBe("普·威力+10　翼·连击+1");
  });

  test("requires another light skill before granting the light bonus", () => {
    const selectedSkill = skill("折射", "光");
    expect(resolveRefractionEffects({
      selectedSkill,
      carriedSkills: [selectedSkill],
    }).types).toEqual([]);
    expect(resolveRefractionEffects({
      selectedSkill,
      carriedSkills: [selectedSkill, skill("虹光冲击", "光")],
    })).toMatchObject({
      deltas: { ownAttack: 3 },
      types: ["光"],
    });
  });

  test("uses the current S2 values for every damage-relevant type", () => {
    const selectedSkill = skill("折射", "光");
    const carriedSkills = [
      selectedSkill,
      skill("地技", "地"),
      skill("普技", "普通"),
      skill("机技", "机械"),
      skill("翼技", "翼"),
      skill("武技", "武"),
      skill("光技", "光"),
      skill("电技", "电"),
      skill("萌技", "萌"),
      skill("幻技", "幻"),
    ];
    const result = resolveRefractionEffects({ selectedSkill, carriedSkills });

    expect(result.deltas).toMatchObject({
      ownAttack: 6,
      ownDefense: 3,
      ownFixedPower: 10,
      ownHitCountAdd: 1,
      ownSpeedFlat: 20,
      targetAttack: -3,
      targetHitCountAdd: -2,
      targetSpeedFlat: -40,
    });
    expect(result.operations).toMatchObject({ targetStarfallStacks: 1 });
  });

  test("keeps all eighteen current type effects auditable", () => {
    const selectedSkill = skill("折射", "光");
    const types = [
      "地", "普通", "机械", "草", "火", "冰", "毒", "虫", "龙",
      "翼", "水", "武", "光", "幻", "幽", "恶", "电", "萌",
    ];
    const carriedSkills = [selectedSkill, ...types.map((type) => skill(`${type}技能`, type))];
    const result = resolveRefractionEffects({
      selectedSkill,
      carriedSkills,
    });

    expect(result.types).toEqual(types);
    expect(result.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "火", label: "敌方灼烧+4" }),
      expect.objectContaining({ type: "水", label: "全技能能耗-1" }),
      expect.objectContaining({ type: "恶", label: "吸血+30%" }),
    ]));
    expect(buildRefractionHint({ selectedSkill, carriedSkills }))
      .toContain("本次可得：");
  });
});
