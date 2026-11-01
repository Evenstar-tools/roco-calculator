import { expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { decodeShareState, encodeShareState } from "../../src/state/share.js";
import { applyAttackStageChanges, positiveAttackStageGains, postAttackStageChanges } from "../../src/domain/attack-stages.js";

function fixture(mode = "four") {
  const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
  const snapshot = {
    meta: { id: "category-stages", rulesVersion: "test-rules" },
    spirits: ["attacker", "defender"].map(id => ({ id, fullName: id, raceStats: { ...stats }, types: ["普通"], traitIds: [] })),
    skills: ["physical", "magical", "dual", "status"].map(category => ({
      id: category, name: `测试${category}`, category, type: "普通", cost: 1,
      basePower: category === "status" ? 0 : 50,
    })),
    traits: [], learnsets: [], typeChart: { types: ["普通"], matrix: [[1]] },
  };
  const state = createInitialState(snapshot);
  state.mode = mode;
  for (const side of ["attacker", "defender"]) {
    state.sides[side].spiritId = side;
    state.sides[side].skills = { single: "physical", four: ["physical", "magical", "dual", "status"] };
  }
  return { snapshot, state };
}

test.each(["single", "four"])("%s 手动攻击等级始终同时改变双攻，独立物攻只改变物攻并可分享恢复", async mode => {
  const { snapshot, state } = fixture(mode);
  for (const [side, direction] of [["attacker", "forward"], ["defender", "reverse"]]) {
    state.directions[direction].overrides = { attackLevelStage: 2, physicalAttackLevelStageAdd: 7 };
    const changed = calculatorReducer(state, { type: "direction/update", direction, value: { overrides: { attackLevelStage: 3 } } });
    const restored = await decodeShareState(await encodeShareState(changed));
    for (const skill of ["physical", "magical", "dual", "status", null]) {
      restored.sides[side].skills.single = skill;
      restored.directions[direction].selectedSkillIndex = Math.max(0, ["physical", "magical", "dual", "status"].indexOf(skill));
      if (skill === null) restored.sides[side].skills.four = [null, null, null, null];
      const view = buildCalculatorViewModel({ snapshot, state: restored, activeDirection: direction });
      const panels = view.sides[side];
      expect(panels.finalPanelStats.physicalAttack, `${side}/${skill}`).toBe(Math.floor(panels.panelStats.physicalAttack * 2));
      expect(panels.finalPanelStats.magicalAttack, `${side}/${skill}`).toBe(Math.floor(panels.panelStats.magicalAttack * 1.3));
      expect(panels.abilityStageBonuses.attackByCategory).toEqual({ physical: 7, magical: 0 });
      expect(restored.directions[direction].overrides.attackLevelStage).toBe(3);
      expect(restored.directions[direction].overrides.physicalAttackLevelStageAdd).toBe(7);
    }
  }
});

test("双攻技能根据单项结算后面板择高，栏位覆盖仅作用该栏位", () => {
  const { snapshot, state } = fixture();
  state.directions.forward.overrides = { attackLevelStage: 2, physicalAttackLevelStageAdd: 4, magicalAttackLevelStageAdd: 7 };
  state.sides.attacker.skills.four[0] = { skillId: "physical", overrides: { physicalAttackLevelStageAdd: 8 } };
  const view = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
  expect(view.calculation.forward.results[0].combatPanel.attacker.physicalAttack).toBe(406);
  expect(view.calculation.forward.results[1].combatPanel.attacker.physicalAttack).toBe(324);
  expect(view.calculation.forward.results[2].totalDamage).toBe(view.calculation.forward.results[1].totalDamage);
  state.directions.forward.overrides.physicalAttackLevelStageAdd = 10;
  const physical = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
  expect(physical.calculation.forward.results[2].totalDamage).toBeGreaterThan(physical.calculation.forward.results[1].totalDamage);
});

test("正增益翻倍按合成后单项层数封顶，负共同层数不截断正单项差值", () => {
  expect(postAttackStageChanges({ attackLevelStageAdd: 2, source: "贪得无厌" })).toEqual({ attack: 0, physical: 2 });
  expect(postAttackStageChanges({ attackLevelStageAdd: 2, source: "通用加攻" })).toEqual({ attack: 2, physical: 0 });
  const before = { attackLevelStage: -80, physicalAttackLevelStageAdd: 99, magicalAttackLevelStageAdd: 7 };
  const after = applyAttackStageChanges(before, { doublePositive: true });
  expect(after).toEqual({ attackLevelStage: -80, physicalAttackLevelStageAdd: 118, magicalAttackLevelStageAdd: 7 });
  expect(applyAttackStageChanges(after)).toEqual(after);
  expect(positiveAttackStageGains(before, after)).toEqual({ attack: 0, physicalAttack: 19, magicalAttack: 0 });
  expect(applyAttackStageChanges(after, { physical: 150 }).physicalAttackLevelStageAdd + after.attackLevelStage).toBe(99);
});

test("刺肤物理特性伤害读取独立物攻，不受独立魔攻影响", () => {
  const { snapshot, state } = fixture();
  snapshot.traits.push({ id: "skin", name: "刺肤" });
  snapshot.spirits[0].traitIds = ["skin"];
  state.directions.forward.selectedDamageSource = "trait";
  const damage = () => buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" }).calculation.forward.traitResult.totalDamage;
  const baseline = damage();
  state.directions.forward.overrides.magicalAttackLevelStageAdd = 10;
  expect(damage()).toBe(baseline);
  state.directions.forward.overrides.physicalAttackLevelStageAdd = 10;
  expect(damage()).toBeGreaterThan(baseline);
});
