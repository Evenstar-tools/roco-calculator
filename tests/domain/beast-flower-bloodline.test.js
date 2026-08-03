import { describe, expect, it } from "vitest";
import {
  BEAST_FLOWER_BLOODLINES,
  isBeastFlowerBloodline,
  resolveBeastFlowerBloodline,
} from "../../src/domain/beast-flower-bloodline.js";

const physicalCombo = {
  category: "physical",
  description: "造成物理伤害，3连击。",
  type: "普通",
};
const magicalSingle = {
  category: "magical",
  description: "造成魔法伤害。",
  type: "水",
};

describe("Beast Flower bloodlines", () => {
  it("提供互不重复的 18 种血脉", () => {
    expect(BEAST_FLOWER_BLOODLINES).toHaveLength(18);
    expect(new Set(BEAST_FLOWER_BLOODLINES.map(({ value }) => value)).size)
      .toBe(18);
    expect(BEAST_FLOWER_BLOODLINES.every(({ value }) =>
      isBeastFlowerBloodline(value),
    )).toBe(true);
  });

  it("未选择、未触发或未知血脉时不产生贡献", () => {
    expect(resolveBeastFlowerBloodline({ activated: true })).toMatchObject({
      active: false,
      fixedPowerAdd: 0,
      hitCountAdd: 0,
      targetStarfallStacksAdd: 0,
    });
    expect(resolveBeastFlowerBloodline({
      activated: false,
      bloodlineType: "normal",
    }).active).toBe(false);
    expect(resolveBeastFlowerBloodline({
      activated: true,
      bloodlineType: "unknown",
    }).active).toBe(false);
  });

  it.each([
    ["normal", { fixedPowerAdd: 40 }],
    ["grass", {}],
    ["fire", {}],
    ["water", {}],
    ["light", { attackLevelBonusByCategory: { physical: 0, magical: 8 } }],
    ["earth", { targetSpeedFlat: -60, targetHitCountAdd: -3 }],
    ["ice", {}],
    ["dragon", { targetDefenseLevelBonusByCategory: { physical: 0, magical: -8 } }],
    ["electric", { ownerSpeedFlat: 100 }],
    ["poison", {}],
    ["bug", { targetDefenseLevelBonusByCategory: { physical: -8, magical: 0 } }],
    ["martial", { attackLevelBonusByCategory: { physical: 8, magical: 0 } }],
    ["wing", { hitCountAdd: 3 }],
    ["cute", { targetAttackLevelBonusByCategory: { physical: -6, magical: -6 } }],
    ["ghost", {}],
    ["evil", {}],
    ["machine", { defenseLevelBonusByCategory: { physical: 6, magical: 6 } }],
    ["illusion", { targetStarfallStacksAdd: 2 }],
  ])("解析 %s 血脉", (bloodlineType, expected) => {
    expect(resolveBeastFlowerBloodline({
      activated: true,
      bloodlineType,
      skill: physicalCombo,
    })).toMatchObject({ active: true, bloodlineType, ...expected });
  });

  it("地与翼只改变明确声明连击的技能", () => {
    expect(resolveBeastFlowerBloodline({
      activated: true,
      bloodlineType: "earth",
      skill: magicalSingle,
    }).targetHitCountAdd).toBe(0);
    expect(resolveBeastFlowerBloodline({
      activated: true,
      bloodlineType: "wing",
      skill: magicalSingle,
    }).hitCountAdd).toBe(0);
  });

  it("幻血脉区分幻系与非幻系技能", () => {
    expect(resolveBeastFlowerBloodline({
      activated: true,
      bloodlineType: "illusion",
      skill: magicalSingle,
    }).settlement).toMatchObject({ status: "applied" });
    expect(resolveBeastFlowerBloodline({
      activated: true,
      bloodlineType: "illusion",
      skill: { ...magicalSingle, type: "幻" },
    }).settlement).toMatchObject({ status: "not-triggered" });
  });

  it("纯记录血脉不伪造伤害贡献", () => {
    for (const bloodlineType of ["grass", "fire", "water", "ice", "poison", "ghost", "evil"]) {
      const resolution = resolveBeastFlowerBloodline({
        activated: true,
        bloodlineType,
        skill: physicalCombo,
      });
      expect(resolution.fixedPowerAdd).toBe(0);
      expect(resolution.targetStarfallStacksAdd).toBe(0);
      expect(resolution.settlement.status).toBe("recorded");
    }
  });
});
