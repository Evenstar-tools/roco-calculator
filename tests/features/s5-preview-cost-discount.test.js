import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { applyS5DiscountUse, prepareS5DiscountUse } from "../../src/features/s5-preview/cost-discount-use.js";
import { applyBattleActivation } from "../../src/state/battle-activation.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { createInitialState } from "../../src/state/defaults.js";
const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const skill = name => snapshot.skills.find(entry => entry.name === name);
const crabId = "spirit_preview_s5_crab-coconut";
const crabTrait = snapshot.traits.find(entry => entry.id === "trait_preview_s5_crab-coconut");
const ready = () => getS5PreviewTraitInputs(crabTrait)[0];
function fixture(name = "丰收", mode = "four") {
  const state = createInitialState(snapshot); state.mode = mode;
  state.sides.attacker.spiritId = crabId;
  state.sides.defender.spiritId = snapshot.spirits.find(entry => entry.fullName === "迪莫").id;
  for (const side of Object.values(state.sides)) side.skills = { single: skill(name).id, four: [skill(name).id, null, null, null] };
  return state;
}
const activate = state => updateMirroredTraitContext(state, { direction: "forward", key: ready().id, value: true }).state;
const calc = state => buildBalanceComparison({ snapshot, state }).afterView.calculation;
test.each(["single", "four"])("%s 已确认下一草系减费实际进入本次能耗", mode => {
  const state = fixture("丰收", mode);
  expect(calc(state).forward.results[0].skillCost).toBe(5);
  expect(calc(activate(state)).forward.results[0].skillCost).toBe(2);
});
test.each(["荆棘爪", "丰饶", "纤维化", "飞叶"])("%s 低费和状态防御技能复用既有非负能耗下限", name => {
  expect(calc(activate(fixture(name))).forward.results[0].skillCost).toBe(0);
});
test("只减少自身草系实际能耗，与折射减费合并，关特性恢复", () => {
  const state = activate(fixture());
  state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-1" }];
  expect(calc(state).forward.results[0].skillCost).toBe(1);
  expect(calc(state).reverse.results[0].skillCost).toBe(5);
  state.sides.attacker.ignoreTraits = true;
  expect(calc(state).forward.results[0].skillCost).toBe(4);
  state.sides.attacker.ignoreTraits = false;
  state.sides.attacker.skills.four[0] = skill("光球").id;
  expect(calc(state).forward.results[0].skillCost).toBe(1);
});

const prepareUse = (state, side = "attacker", name = "水波术") => prepareS5DiscountUse(state, {
  snapshot, side, skill: skill(name), result: { skillCost: 2 },
});
test.each(["single", "four"])("%s 水技后下次行动草减费，非草也消耗机会，再次水技可重开", mode => {
  let state = fixture("水波术", mode);
  const initial = structuredClone(state);
  const water = prepareUse(state);
  expect(state).toEqual(initial);
  expect(water).toMatchObject({ value: true, acquired: false });
  const use = (current, name) => {
    current.sides.attacker.skills = { single: skill(name).id, four: [skill(name).id, null, null, null] };
    const calculated = calc(current);
    const discountUse = prepareS5DiscountUse(current, { snapshot, side: "attacker", skill: skill(name), result: calculated.forward.results[0] });
    const applied = applyBattleActivation({ calculation: calculated, allowNoEffectUse: Boolean(discountUse),
      side: "attacker", skillIndex: 0, skillMode: mode, snapshot, state: current });
    expect(applied.skillUsed).toBe(true);
    return applyS5DiscountUse(applied.state, discountUse);
  };
  state = use(state, "水波术");
  expect(prepareUse(state)).toBeNull(); // repeated water does not accumulate an invented discount
  expect(prepareUse(state, "attacker", "光球")).toMatchObject({ value: false });
  state.sides.attacker.skills = { single: skill("丰收").id, four: [skill("丰收").id, null, null, null] };
  expect(calc(state).forward.results[0].skillCost).toBe(2);
  state = use(state, "丰收");
  expect(calc(state).forward.results[0].skillCost).toBe(5);
  state = use(state, "水波术");
  state = use(state, "光球");
  state.sides.attacker.skills = { single: skill("丰收").id, four: [skill("丰收").id, null, null, null] };
  expect(calc(state).forward.results[0].skillCost).toBe(5);
  state = use(state, "水波术");
  state.sides.attacker.skills = { single: skill("丰收").id, four: [skill("丰收").id, null, null, null] };
  expect(calc(state).forward.results[0].skillCost).toBe(2);
});
test("获得的减费只改获得实例，忽略特性不触发", () => {
  const state = fixture();
  state.sides.attacker.spiritId = snapshot.spirits.find(entry => entry.fullName === "诅咒狼灵").id;
  state.sides.attacker.acquiredTraitIds = [crabTrait.id];
  const next = applyS5DiscountUse(state, prepareUse(state));
  expect(next.directions).toBe(state.directions);
  expect(next.sides.attacker.acquiredTraitValues[crabTrait.id][canonicalTraitControlKey(ready())]).toBe(true);
  expect(calc(next).forward.results[0].skillCost).toBe(2);
  next.sides.attacker.ignoreTraits = true;
  expect(prepareUse(next)).toBeNull();
  expect(calc(next).forward.results[0].skillCost).toBe(5);
});
