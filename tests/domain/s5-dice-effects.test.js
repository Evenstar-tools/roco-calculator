import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { getS5PreviewTraitEvaluation, getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { withS5PreviewCalculationGuard } from "../../src/features/s5-preview/calculation-guard.js";
import { getS5PreviewTraitPresentation } from "../../src/features/s5-preview/trait-presentation.js";
import { createInitialState } from "../../src/state/defaults.js";

const reviewed = JSON.parse(readFileSync("data/reviewed/nrc-s5-20261101.json", "utf8")).modules;
const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
const skills = [
  { id: "physical", name: "普通物攻", category: "physical", type: "普通", basePower: 50, cost: 5 },
  { id: "magical", name: "普通魔攻", category: "magical", type: "普通", basePower: 50, cost: 5 },
  { id: "multi", name: "五连击", category: "physical", type: "普通", basePower: 10, cost: 5, description: "造成物伤，5连击。" },
  { id: "defense", name: "防守", category: "defense", type: "普通", basePower: 0, cost: 0, description: "减伤50%。" },
];

function fixture(maximum = 6, owner = "attacker") {
  const official = Object.values(reviewed.Skills).find(skill => skill.name === "游戏的本质" && skill.desc.includes(`1~${maximum}点`));
  const trait = { id: `dice-${maximum}`, name: official.name, description: official.desc, effectDetails: official.effect_details,
    previewIdentity: { catalogId: "s5-nrc-test", key: maximum === 6 ? "diliutun" : "diniantun", mechanicKey: "diliutun" } };
  const snapshot = { meta: { id: "s5-dice-test" }, skills, traits: [trait], spirits: [
    { id: "a", fullName: "甲", stage: "三阶", types: ["普通"], raceStats, traitIds: owner === "attacker" ? [trait.id] : [] },
    { id: "b", fullName: "乙", stage: "三阶", types: ["普通"], raceStats, traitIds: owner === "defender" ? [trait.id] : [] },
  ] };
  const state = createInitialState(snapshot);
  state.mode = "four";
  for (const side of Object.values(state.sides)) side.skills = { four: skills.map(skill => skill.id), single: "physical" };
  return { snapshot, state, trait, owner };
}

function roll(fixture, face) {
  const { state, trait, owner } = fixture;
  for (const [direction, role] of [[owner === "attacker" ? "forward" : "reverse", "attacker"], [owner === "attacker" ? "reverse" : "forward", "defender"]]) {
    for (const control of getS5PreviewTraitInputs(trait, role)) {
      state.directions[direction].context[control.id] = control.contextKey.endsWith("DiceRolled") ? true : face;
    }
  }
}

const view = ({ snapshot, state }) => withS5PreviewCalculationGuard(buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" }), snapshot, state);

describe.each(["attacker", "defender"])("S5公开骰子效果，持有方为%s", owner => {
  test.each([[6, 2, "physicalAttack", "physical"], [6, 3, "magicalAttack", "magical"], [20, 12, "physicalAttack", "physical"], [20, 13, "magicalAttack", "magical"]])(
    "%i面骰点%i只提高双方对应攻击，另一类伤害保持", (maximum, face, stat, category) => {
      const data = fixture(maximum, owner);
      const baseline = view(data);
      roll(data, face);
      const actual = view(data);
      for (const side of ["attacker", "defender"]) expect(actual.sides[side].finalPanelStats[stat]).toBe(304);
      for (const direction of ["forward", "reverse"]) {
        const changedIndex = category === "physical" ? 0 : 1;
        const unchangedIndex = 1 - changedIndex;
        expect(actual.calculation[direction].results[changedIndex].status).toBe("exact");
        expect(actual.calculation[direction].results[changedIndex].totalDamage).toBeGreaterThan(baseline.calculation[direction].results[changedIndex].totalDamage);
        expect(actual.calculation[direction].results[unchangedIndex].totalDamage).toBe(baseline.calculation[direction].results[unchangedIndex].totalDamage);
      }
    });

  test.each([[6, 4, "physicalDefense", 0], [6, 5, "magicalDefense", 1], [20, 14, "physicalDefense", 0], [20, 15, "magicalDefense", 1]])(
    "%i面骰点%i只降低双方对应防御，面板和技能类别一致", (maximum, face, stat, index) => {
      const data = fixture(maximum, owner);
      const baseline = view(data);
      roll(data, face);
      const actual = view(data);
      const other = stat === "physicalDefense" ? "magicalDefense" : "physicalDefense";
      for (const side of ["attacker", "defender"]) {
        expect(actual.sides[side].finalPanelStats[stat]).toBe(112);
        expect(actual.sides[side].finalPanelStats[other]).toBe(203);
        expect(actual.sides[side].abilityStageBonuses.defenseByCategory).toEqual({ physical: index === 0 ? -8 : 0, magical: index === 1 ? -8 : 0 });
      }
      for (const direction of ["forward", "reverse"]) {
        expect(actual.calculation[direction].results[index].totalDamage).toBeGreaterThan(baseline.calculation[direction].results[index].totalDamage);
        expect(actual.calculation[direction].results[1 - index].totalDamage).toBe(baseline.calculation[direction].results[1 - index].totalDamage);
      }
    });

  test.each([[6, 6], [20, 16]])("%i面骰点%i给双方固定速度+50，无技能也显示", (maximum, face) => {
    const data = fixture(maximum, owner);
    roll(data, face);
    for (const side of Object.values(data.state.sides)) side.skills = { four: [], single: null };
    const actual = view(data);
    for (const side of ["attacker", "defender"]) expect(actual.sides[side].finalPanelStats.speed).toBe(253);
  });

  test("20面骰点2双方固定威力+20，点9双攻-50%，点18双防+50%", () => {
    const data = fixture(20, owner);
    const baseline = view(data);
    roll(data, 2);
    const power = view(data);
    for (const direction of ["forward", "reverse"]) {
      expect(power.calculation[direction].results[0].traitContributions).toContainEqual(expect.objectContaining({ values: expect.objectContaining({ fixedPowerAdd: 20 }) }));
      expect(power.calculation[direction].results[0].totalDamage).toBeGreaterThan(baseline.calculation[direction].results[0].totalDamage);
    }
    roll(data, 9);
    const weaker = view(data);
    for (const side of ["attacker", "defender"]) {
      expect(weaker.sides[side].finalPanelStats.physicalAttack).toBe(135);
      expect(weaker.sides[side].finalPanelStats.magicalAttack).toBe(135);
    }
    roll(data, 18);
    const defense = view(data);
    for (const side of ["attacker", "defender"]) {
      expect(defense.sides[side].finalPanelStats.physicalDefense).toBe(304);
      expect(defense.sides[side].finalPanelStats.magicalDefense).toBe(304);
    }
  });

  test.each([[6, 1], [20, 11]])("%i面骰点%i的回合末回复不阻断本次伤害，也不提前改变生命", (maximum, face) => {
    const data = fixture(maximum, owner);
    const before = view(data);
    roll(data, face);
    const after = view(data);
    for (const direction of ["forward", "reverse"]) {
      expect(after.calculation[direction].results[0].status).toBe("exact");
      expect(after.calculation[direction].results[0].totalDamage).toBe(before.calculation[direction].results[0].totalDamage);
    }
    for (const side of ["attacker", "defender"]) expect(after.sides[side].health).toEqual(before.sides[side].health);
    expect(getS5PreviewTraitEvaluation(data.trait, "attacker", data.state.directions[owner === "attacker" ? "forward" : "reverse"].context).summary)
      .toContain("回合结束：双方回复生命10%");
  });

  test("20面骰点4双方技能能耗-1且不低于0；5/8仅改变本身有连击的技能", () => {
    const data = fixture(20, owner);
    roll(data, 4);
    const cheaper = calculateMatchup(data.snapshot, data.state);
    for (const direction of ["forward", "reverse"]) expect(cheaper[direction].results.map(result => result.skillCost)).toEqual([4, 4, 4, 0]);
    for (const [face, count] of [[5, 3], [8, 7]]) {
      roll(data, face);
      const actual = calculateMatchup(data.snapshot, data.state);
      for (const direction of ["forward", "reverse"]) {
        expect(actual[direction].results[2].hitCount).toBe(count);
        expect(actual[direction].results[0].hitCount).toBe(1);
      }
    }
  });

  test.each([1, 3, 6, 7, 10, 17, 19, 20].map(face => [20, face]))(
    "%i面骰点%i仅对尚未接入的该点结算守门，换成已知攻击点恢复且忽略特性可计算", (maximum, face) => {
      const data = fixture(maximum, owner);
      roll(data, face);
      const pending = calculateMatchup(data.snapshot, data.state);
      expect(pending.forward.results[0]).toMatchObject({ status: "unsupported", totalDamage: null, reason: expect.stringContaining("结算尚未接入") });
      data.state.sides[owner].ignoreTraits = true;
      expect(calculateMatchup(data.snapshot, data.state).forward.results[0].status).toBe("exact");
      data.state.sides[owner].ignoreTraits = false;
      roll(data, maximum === 6 ? 2 : 12);
      expect(calculateMatchup(data.snapshot, data.state).forward.results[0].status).toBe("exact");
    });
});

test("6点/20点按各自描述取范围，保留防方控件与原始公开映射", () => {
  for (const maximum of [6, 20]) {
    const data = fixture(maximum);
    const inputs = getS5PreviewTraitInputs(data.trait, "defender");
    expect(inputs.find(input => input.contextKey.endsWith("DiceFace")).max).toBe(maximum);
    expect(getS5PreviewTraitPresentation({ inputs, previewTraitEntity: data.trait }, "defender")).toMatchObject({ visible: true, inputs });
    const before = structuredClone(data.trait.effectDetails);
    roll(data, maximum === 6 ? 6 : 16);
    expect(getS5PreviewTraitEvaluation(data.trait, "attacker", data.state.directions.forward.context)).toMatchObject({ calcStatus: "ready", effects: [{ kind: "battle-speed-flat", amount: 50, target: "both" }] });
    expect(data.trait.effectDetails).toEqual(before);
  }
});
