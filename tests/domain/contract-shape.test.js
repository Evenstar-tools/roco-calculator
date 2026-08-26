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
  it("提供 14 种互不重复且效果对应正确的咕噜球", () => {
    expect(CONTRACT_BALLS.map(({ label, summary }) => `${label}｜${summary}`)).toEqual([
      "普通球｜攻防速 +5%",
      "高级球｜攻防速 +10%",
      "国王球｜攻防速 +15%",
      "美妙球｜对方双攻 -30% · 威力 +20",
      "调温球｜对方灼烧 ×4 · 冻结 ×1",
      "光合球｜回复 9% · 魔攻 +40%",
      "网兜球｜能耗 -1 · 连击 +1",
      "绝缘球｜速度 +50 · 对方中毒 ×1",
      "淘沙球｜对方速度 -40 · 物防 -40% · 连击 +2",
      "变幻球｜双防 +30% · 对方星陨 ×1",
      "暗星球｜吸血 +30% · 对方能量 -1",
      "好战球｜物攻 +40% · 对方魔防 -40%",
      "捕光球｜无效果",
      "棱镜球｜指定随机球效果 · 数值减半",
    ]);
    expect(new Set(CONTRACT_BALLS.map(({ value }) => value)).size).toBe(14);
    expect(CONTRACT_BALLS.every(({ value }) => isContractBall(value))).toBe(true);
  });

  it("未选择、未知或棱镜未指定效果时不产生贡献", () => {
    expect(resolveContractShape()).toMatchObject({ active: false });
    expect(resolveContractShape({ ballType: "unknown", skill: physicalCombo }))
      .toMatchObject({ active: false });
    expect(resolveContractShape({ ballType: "prism", skill: physicalCombo }))
      .toMatchObject({ active: false });
  });

  it("绝缘球提升自身速度50点并赋予对手1层中毒", () => {
    expect(resolveContractShape({
      ballType: "insulation",
      skill: physicalCombo,
    })).toMatchObject({
      ownerSpeedFlat: 50,
      targetPoisonStacksAdd: 1,
      targetSpeedFlat: 0,
      targetDefenseLevelBonusByCategory: { physical: 0, magical: 0 },
      targetHitCountAdd: 0,
      settlement: { text: "绝缘球｜速度 +50 · 对方中毒 ×1" },
    });
  });

  it("淘沙球降低对手速度和物防并为自身连击技能增加2段", () => {
    expect(resolveContractShape({
      ballType: "sand",
      skill: physicalCombo,
    })).toMatchObject({
      hitCountAdd: 2,
      targetSpeedFlat: -40,
      targetDefenseLevelBonusByCategory: { physical: -4, magical: 0 },
      targetStarfallStacksAdd: 0,
      settlement: { text: "淘沙球｜对方速度 -40 · 物防 -40% · 连击 +2" },
    });
  });

  it("光合球记录9%回复并提升40%魔攻", () => {
    expect(resolveContractShape({
      ballType: "photosynthesis",
      skill: magicalSingle,
    })).toMatchObject({
      attackLevelBonusByCategory: { physical: 0, magical: 4 },
      ownerHealingPercent: 9,
      hitCountAdd: 0,
      settlement: { text: "光合球｜回复 9% · 魔攻 +40%" },
    });
  });

  it("网兜球为连击技能增加1段并记录能耗减少1点", () => {
    expect(resolveContractShape({
      ballType: "net",
      skill: physicalCombo,
    })).toMatchObject({
      hitCountAdd: 1,
      ownerSkillCostAdd: -1,
      ownerSpeedFlat: 0,
      targetPoisonStacksAdd: 0,
      settlement: { text: "网兜球｜能耗 -1 · 连击 +1" },
    });
  });

  it("变幻球提升30%双防并赋予对手1层星陨", () => {
    expect(resolveContractShape({
      ballType: "transform",
      skill: physicalCombo,
    })).toMatchObject({
      defenseLevelBonusByCategory: { physical: 3, magical: 3 },
      targetStarfallStacksAdd: 1,
      settlement: { text: "变幻球｜双防 +30% · 对方星陨 ×1" },
    });
  });

  it("暗星球记录30%吸血并扣除对手1点能量", () => {
    expect(resolveContractShape({
      ballType: "darkstar",
      skill: physicalCombo,
    })).toMatchObject({
      ownerLifestealPercent: 30,
      targetEnergyAdd: -1,
      attackLevelBonusByCategory: { physical: 0, magical: 0 },
      targetDefenseLevelBonusByCategory: { physical: 0, magical: 0 },
      settlement: {
        status: "recorded",
        text: "暗星球｜吸血 +30% · 对方能量 -1 · 仅记录",
      },
    });
  });

  it("好战球提升40%物攻并降低对手40%魔防", () => {
    expect(resolveContractShape({
      ballType: "combat",
      skill: physicalCombo,
    })).toMatchObject({
      active: true,
      attackLevelBonusByCategory: { physical: 4, magical: 0 },
      targetDefenseLevelBonusByCategory: { physical: 0, magical: -4 },
      settlement: { text: "好战球｜物攻 +40% · 对方魔防 -40%" },
    });
  });

  it("调温球记录对手4回合灼烧和1回合冻结", () => {
    expect(resolveContractShape({
      ballType: "temperature",
      skill: physicalCombo,
    })).toMatchObject({
      targetBurnRoundsAdd: 4,
      targetFreezeRoundsAdd: 1,
      settlement: {
        status: "recorded",
        text: "调温球｜对方灼烧 ×4、冻结 ×1 · 本次伤害不追加",
      },
    });
  });

  it.each([
    ["normal", { attackLevelBonusByCategory: { physical: 0.5, magical: 0.5 }, defenseLevelBonusByCategory: { physical: 0.5, magical: 0.5 }, ownerSpeedMultiplier: 1.05 }],
    ["advanced", { attackLevelBonusByCategory: { physical: 1, magical: 1 }, defenseLevelBonusByCategory: { physical: 1, magical: 1 }, ownerSpeedMultiplier: 1.1 }],
    ["king", { attackLevelBonusByCategory: { physical: 1.5, magical: 1.5 }, defenseLevelBonusByCategory: { physical: 1.5, magical: 1.5 }, ownerSpeedMultiplier: 1.15 }],
    ["beautiful", { targetAttackLevelBonusByCategory: { physical: -3, magical: -3 }, fixedPowerAdd: 20 }],
    ["temperature", {}],
    ["photosynthesis", { attackLevelBonusByCategory: { physical: 0, magical: 4 }, ownerHealingPercent: 9 }],
    ["net", { hitCountAdd: 1, ownerSkillCostAdd: -1 }],
    ["insulation", { ownerSpeedFlat: 50, targetPoisonStacksAdd: 1 }],
    ["sand", { hitCountAdd: 2, targetSpeedFlat: -40, targetDefenseLevelBonusByCategory: { physical: -4, magical: 0 } }],
    ["transform", { defenseLevelBonusByCategory: { physical: 3, magical: 3 }, targetStarfallStacksAdd: 1 }],
    ["darkstar", { ownerLifestealPercent: 30, targetEnergyAdd: -1 }],
    ["combat", { attackLevelBonusByCategory: { physical: 4, magical: 0 }, targetDefenseLevelBonusByCategory: { physical: 0, magical: -4 } }],
    ["capture", {}],
  ])("解析 %s 球", (ballType, expected) => {
    expect(resolveContractShape({ ballType, skill: physicalCombo }))
      .toMatchObject({ active: true, ballType, scale: 1, ...expected });
  });

  it("非连击技能不应用网兜球的连击变化，绝缘球不改变连击", () => {
    expect(resolveContractShape({
      ballType: "net",
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
    }).targetPoisonStacksAdd).toBe(0);
    expect(resolveContractShape({
      ballType: "prism",
      prismEffect: "net",
      skill: physicalCombo,
    })).toMatchObject({ hitCountAdd: 0, ownerSkillCostAdd: 0 });
  });

  it("纯记录效果不伪造伤害贡献", () => {
    for (const ballType of ["temperature", "darkstar", "capture"]) {
      const result = resolveContractShape({ ballType, skill: physicalCombo });
      expect(result.fixedPowerAdd).toBe(0);
      expect(result.hitCountAdd).toBe(0);
      expect(result.targetStarfallStacksAdd).toBe(0);
      expect(result.settlement).toBeTruthy();
    }
  });
});
