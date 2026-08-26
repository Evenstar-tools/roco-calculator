import { describe, expect, test } from "vitest";
import {
  CONTRACT_BALLS,
  resolveContractShape,
} from "../src/shared/domain/contract-shape.js";

const comboSkill = {
  category: "physical",
  description: "造成物理伤害，3连击。",
  type: "普通",
};

describe("陨星虫契约的形状", () => {
  test("按桌面端顺序提供14种咕噜球和正确说明", () => {
    expect(CONTRACT_BALLS.map(({ label, summary }) => `${label}｜${summary}`))
      .toEqual([
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
  });

  test("不再错位应用网兜、绝缘、淘沙和变幻球效果", () => {
    expect(resolveContractShape({
      ballType: "net",
      skill: comboSkill,
    })).toMatchObject({
      hitCountAdd: 1,
      ownerSkillCostAdd: -1,
      ownerSpeedFlat: 0,
      targetPoisonStacksAdd: 0,
    });
    expect(resolveContractShape({
      ballType: "insulation",
      skill: comboSkill,
    })).toMatchObject({
      hitCountAdd: 0,
      ownerSpeedFlat: 50,
      targetPoisonStacksAdd: 1,
    });
    expect(resolveContractShape({
      ballType: "sand",
      skill: comboSkill,
    })).toMatchObject({
      hitCountAdd: 2,
      targetDefenseLevelBonusByCategory: { physical: -4, magical: 0 },
      targetSpeedFlat: -40,
    });
    expect(resolveContractShape({
      ballType: "transform",
      skill: comboSkill,
    })).toMatchObject({
      defenseLevelBonusByCategory: { physical: 3, magical: 3 },
      targetStarfallStacksAdd: 1,
    });
  });

  test("棱镜球沿用指定球的半值规则并对离散量向零取整", () => {
    expect(resolveContractShape({
      ballType: "prism",
      prismEffect: "beautiful",
      skill: comboSkill,
    })).toMatchObject({
      fixedPowerAdd: 10,
      scale: 0.5,
      targetAttackLevelBonusByCategory: { physical: -1.5, magical: -1.5 },
    });
    expect(resolveContractShape({
      ballType: "prism",
      prismEffect: "net",
      skill: comboSkill,
    })).toMatchObject({ hitCountAdd: 0, ownerSkillCostAdd: 0 });
  });
});
