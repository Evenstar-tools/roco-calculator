// @vitest-environment node
import { beforeAll, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { createInitialState } from "../../src/state/defaults.js";
import { buildS5BwikiRuntime } from "../../scripts/s5-bwiki-runtime.mjs";
import { restoreS5RuntimeRelations } from "../../src/data/s5-runtime-relations.js";
import { carriedSkillTotalCost } from "../../src/domain/skill-result/loadout.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";

const stats = { hp: 100, speed: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100 };
function fixture(mode = "four") {
  const snapshot = { meta: { id: "ice-seal-test" }, traits: [{ id: "ice-seal", name: "冰封" }],
    spirits: [
      { id: "snow", fullName: "雪灵", types: ["冰"], raceStats: stats, traitIds: ["ice-seal"] },
      { id: "target", fullName: "目标", types: ["普通"], raceStats: stats, traitIds: [] },
    ], skills: [
      { id: "sweep", name: "冰锋横扫", type: "冰", category: "magical", basePower: 1, cost: 4 },
      { id: "zero", name: "零费", type: "普通", category: "physical", basePower: 40, cost: 0 },
      { id: "guard", name: "防御", type: "普通", category: "defense", basePower: null, cost: 1 },
      { id: "status", name: "状态", type: "普通", category: "status", basePower: null, cost: 2 },
    ] };
  const state = createInitialState(snapshot);
  state.mode = mode;
  for (const [side, spiritId] of [["attacker", "snow"], ["defender", "target"]]) {
    state.sides[side].spiritId = spiritId;
    state.sides[side].skills = { single: "sweep", four: ["sweep", "zero", "guard", "status"] };
  }
  return { snapshot, state };
}
const calculate = ({ snapshot, state }) => calculateMatchup(snapshot, state);

test.each(["single", "four"])("%s 冰封自动让四技能总耗7变11，横扫威力70变110", mode => {
  const data = fixture(mode);
  const actual = calculate(data);
  expect(actual.forward.selectedResult).toMatchObject({ skillPower: 110, skillCost: 4 });
  expect(actual.reverse.selectedResult).toMatchObject({ skillPower: 70, skillCost: 5 });
  expect(actual.forward.selectedResult.formulaSteps).toContainEqual(expect.objectContaining({ label: "敌方四技能总能耗", input: 11, after: 110 }));
  if (mode === "four") expect(actual.reverse.results.map(row => row.skillCost)).toEqual([5, 1, 2, 3]);
  data.state.sides.attacker.ignoreTraits = true;
  const disabled = calculate(data);
  expect(disabled.forward.selectedResult.skillPower).toBe(70);
  expect(disabled.reverse.selectedResult.skillCost).toBe(4);
  expect(actual.forward.selectedResult.totalDamage).toBeGreaterThan(disabled.forward.selectedResult.totalDamage);
});

test("双方冰封对称生效，重复特性只算一次，空槽不增耗", () => {
  const data = fixture();
  data.state.sides.defender.traits = [{ id: "ice-seal-copy", name: "冰封" }, { id: "ice-seal", name: "冰封" }];
  data.state.sides.attacker.skills.four = ["sweep", "zero", null, null];
  data.state.sides.defender.skills.four = ["sweep", null, null, null];
  const actual = calculate(data);
  expect(actual.forward.selectedResult).toMatchObject({ skillPower: 50, skillCost: 5 });
  expect(actual.reverse.selectedResult).toMatchObject({ skillPower: 60, skillCost: 5 });
});

test("冰封与已有固定减耗按每个技能相加后截到0，不改写技能原始费用", () => {
  const data = fixture();
  data.state.directions.reverse.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-2" }];
  const actual = calculate(data);
  expect(actual.reverse.results.map(row => row.skillCost)).toEqual([3, 0, 0, 1]);
  expect(actual.forward.selectedResult.skillPower).toBe(40);
  expect(data.snapshot.skills.map(row => row.cost)).toEqual([4, 0, 1, 2]);
});

test("仅关闭接收方特性不会解除冰封，切走来源方立即恢复", () => {
  const data = fixture();
  data.state.sides.defender.ignoreTraits = true;
  expect(calculate(data).reverse.results.map(row => row.skillCost)).toEqual([5, 1, 2, 3]);
  data.state.sides.attacker.spiritId = "target";
  expect(calculate(data).reverse.results.map(row => row.skillCost)).toEqual([4, 0, 1, 2]);
});

test.each(["single", "four"])("%s 显式总耗和实际能耗作为最终值，不重复增加冰封", mode => {
  const data = fixture(mode);
  data.state.directions.forward.context.enemyTotalSkillCost = 8;
  expect(calculate(data).forward.selectedResult.skillPower).toBe(80);
  const wave = { id: "wave", name: "叠浪", cost: 3, type: "水", category: "magical", basePower: 50 };
  data.snapshot.skills.push(wave);
  const control = getSkillEffectInputs(wave).find(row => row.contextKey === "actualSkillCost");
  delete data.state.directions.forward.context.enemyTotalSkillCost;
  const entry = { skillId: wave.id, context: { [control.id]: 2 } };
  data.state.sides.defender.skills.single = entry;
  data.state.sides.defender.skills.four[0] = entry;
  const actual = calculate(data);
  expect(actual.reverse.selectedResult).toMatchObject({ skillCost: 2, manualCostOverride: true });
  expect(actual.forward.selectedResult.skillPower).toBe(80);
  entry.context[control.id] = 0;
  expect(calculate(data).forward.selectedResult.skillPower).toBe(60);
  delete entry.context;
  data.state.directions.reverse.context.actualSkillCost = 2;
  expect(calculate(data).forward.selectedResult.skillPower).toBe(80);
  data.state.sides.attacker.ignoreTraits = true;
  const unsealed = calculate(data);
  expect(unsealed.reverse.selectedResult.skillCost).toBe(2);
  expect(unsealed.forward.selectedResult.skillPower).toBe(50);
});

test("携带技能手动最终费用沿用方向、槽位及覆盖上下文优先级，未知基础费可由明确最终值补齐", () => {
  const wave = { id: "wave", name: "叠浪", cost: null, type: "水", category: "magical", basePower: 50 };
  const control = getSkillEffectInputs(wave).find(row => row.contextKey === "actualSkillCost");
  const entry = { skillId: wave.id, context: { [control.id]: 2 }, overrides: { context: { [control.id]: 1 } } };
  const side = { skills: { four: [entry, null, null, null] } };
  const overrides = { context: { [control.id]: 0 } };
  const options = { directionContext: { [control.id]: 3 }, requireKnown: true, costIncrease: 1 };
  const total = () => carriedSkillTotalCost(side, "four", { wave }, overrides, options);
  expect(total()).toBe(1);
  delete entry.overrides;
  expect(total()).toBe(0);
  delete overrides.context;
  expect(total()).toBe(2);
  delete entry.context;
  expect(total()).toBe(3);
});

test("未知费用不会被冰封当成零费技能，不伪造已确认总耗", () => {
  const data = fixture();
  data.snapshot.skills[0].cost = null;
  const skills = Object.fromEntries(data.snapshot.skills.map(row => [row.id, row]));
  expect(carriedSkillTotalCost(data.state.sides.defender, "four", skills, {}, { costIncrease: 1, requireKnown: true })).toBeNull();
  expect(calculate(data).forward.selectedResult).toMatchObject({ status: "needs_input", totalDamage: null });
  data.state.directions.forward.context.enemyTotalSkillCost = 12;
  expect(calculate(data).forward.selectedResult).toMatchObject({ status: "exact", skillPower: 120 });
});

let live;
beforeAll(async () => { live = restoreS5RuntimeRelations(await buildS5BwikiRuntime()); }, 30_000);
test("正式S5雪灵冰封自动联动冰锋横扫，不需要手填特性开关", () => {
  const snow = live.spirits.find(row => row.fullName === "雪灵");
  const sweep = live.skills.find(row => row.name === "冰锋横扫");
  const carried = ["冰锋横扫", "冰冻光线", "冰锥", "雪替身"].map(name => live.skills.find(row => row.name === name).id);
  expect(live.traits.find(row => row.id === snow.traitIds[0])).toMatchObject({ name: "冰封" });
  const state = createInitialState(live);
  state.mode = "four";
  for (const side of ["attacker", "defender"]) {
    state.sides[side].spiritId = snow.id;
    state.sides[side].skills = { single: sweep.id, four: carried };
  }
  const sealed = calculateMatchup(live, state);
  for (const direction of ["forward", "reverse"]) {
    expect(sealed[direction].selectedResult).toMatchObject({ status: "exact", skillPower: 170, skillCost: 5, totalDamage: 99 });
    expect(sealed[direction].selectedResult.hpPercent).toBeCloseTo(26, 1);
    expect(sealed[direction].results.map(row => row.skillCost)).toEqual([5, 8, 1, 3]);
  }
  state.sides.attacker.ignoreTraits = true;
  expect(calculateMatchup(live, state).forward.selectedResult).toMatchObject({ skillPower: 130, totalDamage: 75 });
});
