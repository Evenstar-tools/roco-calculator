import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { getAppliedWeatherLabel } from "../../src/domain/calculator-view-model.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { createInitialState } from "../../src/state/defaults.js";
import { updateGlobalWeather } from "../../src/state/calculator-session.js";
import { applyS5EnergyUse, prepareS5EnergyUse } from "../../src/features/s5-preview/energy-use.js";
import { getSilverEnergySpentInput } from "../../src/features/s5-preview/energy-input-migration.js";

const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
function fixture(skill = {}, mode = "four") {
  const selected = { id: "earth", name: "地系测试", category: "physical", type: "地", basePower: 80, cost: 3, ...skill };
  const snapshot = { meta: { id: "sandstorm-test" }, skills: [selected], traits: [], spirits: [
    { id: "a", fullName: "甲", types: ["火"], raceStats, traitIds: [] },
    { id: "b", fullName: "乙", types: ["水"], raceStats, traitIds: [] },
  ] };
  let state = createInitialState(snapshot);
  state.mode = mode;
  for (const [side, id] of [["attacker", "a"], ["defender", "b"]]) {
    state.sides[side].spiritId = id;
    state.sides[side].skills = { single: selected.id, four: [selected.id, null, null, null] };
  }
  state = updateGlobalWeather(state, "sandstorm").state;
  return { snapshot, state, selected };
}
const result = ({ snapshot, state }) => calculateMatchup(snapshot, state);

describe.each(["physical", "status", "defense"])("沙暴地系%s能耗", category => {
  test.each([[0, 0], [1, 0], [3, 1], [4, 2], [null, undefined]])("%s向下取整为%s，双方一致", (cost, expected) => {
    const data = fixture({ category, cost, ...(category === "physical" ? {} : { basePower: null }) });
    const actual = result(data);
    for (const direction of ["forward", "reverse"]) {
      const entry = actual[direction].selectedResult;
      expect(entry.skillCost).toBe(expected);
      if (cost > 0) {
        expect(entry.formulaSteps).toContainEqual(expect.objectContaining({
          source: "weather:sandstorm", input: { multiplier: 0.5, method: "floor" }, before: cost, after: expected,
        }));
      }
    }
  });
});

test.each(["single", "four"])("%s按技能地系生效，切换天气恢复，非地系不减费", mode => {
  const data = fixture({}, mode);
  const storm = result(data).forward.selectedResult;
  expect(storm.skillCost).toBe(1);
  expect(getAppliedWeatherLabel("sandstorm", storm)).toBe("沙暴");
  const clear = result({ ...data, state: updateGlobalWeather(data.state, "none").state }).forward.selectedResult;
  expect(clear.skillCost).toBe(3);
  expect(storm.totalDamage).toBe(clear.totalDamage);
  expect(result(fixture({ type: "水" }, mode)).forward.selectedResult.skillCost).toBe(3);
});

test("先结算碎银动态费用和折射固定减费，再减半；减到0不变为负数", () => {
  const data = fixture({ name: "碎银", category: "magical", cost: 10, basePower: 170 });
  const control = getSkillEffectInputs(data.selected).find(input => input.contextKey === "s5EnergySpentBeforeUse");
  data.state.sides.attacker.skills.four[0] = { skillId: data.selected.id, context: { [control.id]: 10 } };
  data.state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-2" }];
  const actual = result(data).forward.selectedResult;
  expect(actual.skillCost).toBe(1); // 10 - 碎银5 - 折射2 = 3，沙暴后为1。
  expect(actual.formulaSteps).toContainEqual(expect.objectContaining({ source: "weather:sandstorm", before: 3, after: 1 }));
  const simple = fixture();
  simple.state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-1" }];
  expect(result(simple).forward.selectedResult.skillCost).toBe(1);
  simple.state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-8" }];
  expect(result(simple).forward.selectedResult.skillCost).toBe(0);
});

test("按实际能耗成长的威力读取减半结果，手动实际能耗不重复减半", () => {
  // A converted Earth skill retains its original cost-scaled rule.
  const data = fixture({ name: "涌泉", cost: 3, basePower: 60 });
  const auto = result(data).forward.selectedResult;
  expect(auto).toMatchObject({ skillCost: 1, resolvedPower: 80, effectiveCostInput: 1 });
  const control = getSkillEffectInputs(data.selected).find(input => input.contextKey === "actualSkillCost");
  data.state.sides.attacker.skills.four[0] = { skillId: data.selected.id, context: { [control.id]: 2 } };
  const manual = result(data).forward.selectedResult;
  expect(manual).toMatchObject({ skillCost: 2, resolvedPower: 70, manualCostOverride: true });
  expect(manual.sandstormCostReduction).toBeUndefined();
  expect(getAppliedWeatherLabel("sandstorm", manual)).toBeNull();
  data.state.sides.attacker.skills.four[0].context[control.id] = 25;
  const bounded = result(data).forward.selectedResult;
  expect(bounded.skillCost).toBe(20);
  expect(bounded.formulaSteps).toContainEqual(expect.objectContaining({ source: "manual-cost", after: 20 }));
});

test.each(["single", "four"])("%s地绡银龙使用技能累计沙暴后1点，零费不增加累计值", mode => {
  const data = fixture({}, mode);
  const trait = { id: "silver", name: "地绡银龙特性", previewIdentity: { catalogId: "s5-test", key: "underground-silver-dragon", mechanicKey: "underground-silver-dragon" } };
  data.snapshot.traits = [trait];
  data.snapshot.spirits[0].traitIds = [trait.id];
  const actual = result(data).forward.selectedResult;
  const use = prepareS5EnergyUse(data.state, { snapshot: data.snapshot, side: "attacker", result: actual });
  expect(use).toMatchObject({ cost: 1, total: 1 });
  const next = applyS5EnergyUse(data.state, use);
  expect(next.directions.forward.context[getSilverEnergySpentInput("attacker").id]).toBe(1);
  expect(next.directions.reverse.context[getSilverEnergySpentInput("defender").id]).toBe(1);
  next.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-2" }];
  const zero = calculateMatchup(data.snapshot, next).forward.selectedResult;
  expect(zero.skillCost).toBe(0);
  expect(applyS5EnergyUse(next, prepareS5EnergyUse(next, { snapshot: data.snapshot, side: "attacker", result: zero }))).toBe(next);
});
