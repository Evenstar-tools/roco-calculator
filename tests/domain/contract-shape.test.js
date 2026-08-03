import { describe, expect, it } from "vitest";
import {
  CONTRACT_BALLS,
  isContractBall,
  resolveContractShape,
} from "../../src/domain/contract-shape.js";

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

describe("契约的形状", () => {
  it("提供 13 种互不重复的咕噜球", () => {
    expect(CONTRACT_BALLS).toHaveLength(13);
    expect(new Set(CONTRACT_BALLS.map(({ value }) => value)).size).toBe(13);
    expect(CONTRACT_BALLS.every(({ value }) => isContractBall(value))).toBe(true);
  });

  it("未选择、未知或棱镜未指定效果时不产生贡献", () => {
    expect(resolveContractShape()).toMatchObject({ active: false });
    expect(resolveContractShape({ ballType: "unknown", skill: physicalCombo }))
      .toMatchObject({ active: false });
    expect(resolveContractShape({ ballType: "prism", skill: physicalCombo }))
      .toMatchObject({ active: false });
  });

  it.each([
    ["normal", { attackLevelBonusByCategory: { physical: 1, magical: 1 }, defenseLevelBonusByCategory: { physical: 1, magical: 1 }, ownerSpeedMultiplier: 1.1 }],
    ["advanced", { attackLevelBonusByCategory: { physical: 2, magical: 2 }, defenseLevelBonusByCategory: { physical: 2, magical: 2 }, ownerSpeedMultiplier: 1.2 }],
    ["king", { attackLevelBonusByCategory: { physical: 3, magical: 3 }, defenseLevelBonusByCategory: { physical: 3, magical: 3 }, ownerSpeedMultiplier: 1.3 }],
    ["beautiful", { targetAttackLevelBonusByCategory: { physical: -3, magical: -3 }, fixedPowerAdd: 20 }],
    ["temperature", {}],
    ["photosynthesis", { hitCountAdd: 1 }],
    ["net", { ownerSpeedFlat: 50, targetPoisonStacksAdd: 2 }],
    ["insulation", { targetSpeedFlat: -40, targetDefenseLevelBonusByCategory: { physical: -4, magical: 0 }, targetHitCountAdd: -2 }],
    ["sand", { defenseLevelBonusByCategory: { physical: 3, magical: 3 }, targetStarfallStacksAdd: 1 }],
    ["transform", {}],
    ["darkstar", { attackLevelBonusByCategory: { physical: 4, magical: 0 }, targetDefenseLevelBonusByCategory: { physical: 0, magical: -4 } }],
    ["capture", {}],
  ])("解析 %s 球", (ballType, expected) => {
    expect(resolveContractShape({ ballType, skill: physicalCombo }))
      .toMatchObject({ active: true, ballType, scale: 1, ...expected });
  });

  it("非连击技能不应用光合和绝缘的连击变化", () => {
    expect(resolveContractShape({
      ballType: "photosynthesis",
      skill: magicalSingle,
    }).hitCountAdd).toBe(0);
    expect(resolveContractShape({
      ballType: "insulation",
      skill: magicalSingle,
    }).targetHitCountAdd).toBe(0);
  });

  it("棱镜按指定球效果减半，离散量向零取整", () => {
    const beautiful = resolveContractShape({
      ballType: "prism",
      prismEffect: "beautiful",
      skill: physicalCombo,
    });
    expect(beautiful).toMatchObject({
      active: true,
      ballType: "prism",
      effectiveBallType: "beautiful",
      fixedPowerAdd: 10,
      scale: 0.5,
      targetAttackLevelBonusByCategory: { physical: -1.5, magical: -1.5 },
    });
    expect(beautiful.settlement.text).toContain("对方双攻 -15% · 威力 +10");
    expect(resolveContractShape({
      ballType: "prism",
      prismEffect: "photosynthesis",
      skill: physicalCombo,
    }).hitCountAdd).toBe(0);
    expect(resolveContractShape({
      ballType: "prism",
      prismEffect: "insulation",
      skill: physicalCombo,
    }).targetHitCountAdd).toBe(-1);
    expect(resolveContractShape({
      ballType: "prism",
      prismEffect: "net",
      skill: physicalCombo,
    }).targetPoisonStacksAdd).toBe(1);
  });

  it("纯记录效果不伪造伤害贡献", () => {
    for (const ballType of ["temperature", "transform", "capture"]) {
      const result = resolveContractShape({ ballType, skill: physicalCombo });
      expect(result.fixedPowerAdd).toBe(0);
      expect(result.hitCountAdd).toBe(0);
      expect(result.targetStarfallStacksAdd).toBe(0);
      expect(result.settlement).toBeTruthy();
    }
  });
});
