import { extractTraitValues } from "../../src/state/trait-values.js";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { getLegacySilverEnergyInput, getSilverEnergySpentInput } from "../../src/features/s5-preview/energy-input-migration.js";
import { applyS5EnergyUse, prepareS5EnergyUse } from "../../src/features/s5-preview/energy-use.js";
import { correctS5PreviewReferences } from "../../src/features/s5-preview/reference-corrections.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { applyBattleActivation } from "../../src/state/battle-activation.js";
import { updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";

const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const silver = "spirit_preview_s5_underground-silver-dragon";
const silverTrait = "trait_preview_s5_underground-silver-dragon";
const spentKey = (role = "attacker") => getSilverEnergySpentInput(role).id;
const oldKey = getLegacySilverEnergyInput().id;
const directionFor = side => side === "attacker" ? "forward" : "reverse";
const oppositeDirection = direction => direction === "forward" ? "reverse" : "forward";
const skill = name => snapshot.skills.find(entry => entry.name === name);
function fixture(side = "attacker", mode = "four") {
  const state = createInitialState(snapshot);
  state.mode = mode;
  for (const [key, configured] of Object.entries(state.sides)) {
    configured.spiritId = key === side ? silver : snapshot.spirits.find(entry => entry.fullName === "迪莫").id;
    configured.skills = { single: skill("撕咬").id, four: [skill("撕咬").id, skill("水波术").id, null, null] };
  }
  return state;
}
const calculation = state => buildBalanceComparison({ snapshot, state }).afterView.calculation;
const prepare = (state, side = "attacker", result = { skillCost: 2 }) =>
  prepareS5EnergyUse(state, { snapshot, side, result });
const setSpent = (state, side, value) => updateMirroredTraitContext(state, {
  direction: directionFor(side), key: spentKey(), value,
}).state;

test.each(["single", "four"])("%s use captures the calculated discounted cost, not the base cost or hit count", mode => {
  const state = fixture("attacker", mode);
  state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-2" }];
  const result = calculation(state).forward.results[0];
  expect(skill("撕咬").cost).toBe(3);
  expect(result).toMatchObject({ skillCost: 1, hitCount: 3 });
  const before = structuredClone(state);
  const use = prepare(state, "attacker", result);
  expect(use).toMatchObject({ side: "attacker", direction: "forward", cost: 1, total: 1 });
  expect(state).toEqual(before);
  const next = applyS5EnergyUse(state, use);
  expect(next.directions.forward.context[spentKey()]).toBe(1);
  expect(next.directions.reverse.context[spentKey("defender")]).toBe(1);
  expect(next.directions.reverse.context[spentKey()]).toBeUndefined();
  expect(state).toEqual(before);
});

test("a dynamic effective skill cost is used after the skill-specific calculation", () => {
  const state = fixture();
  const costControl = getSkillEffectInputs(skill("叠浪")).find(control => control.contextKey === "actualSkillCost");
  state.sides.attacker.skills.four[0] = { skillId: skill("叠浪").id, context: { [costControl.id]: 1 } };
  state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-1" }];
  const result = calculation(state).forward.results[0];
  expect(skill("叠浪").cost).toBe(3);
  expect(result.skillCost).toBe(1);
  expect(prepare(state, "attacker", result)).toMatchObject({ cost: 1, total: 1 });
});

test.each(["attacker", "defender"])("%s energy belongs to that owner through mirroring and side swaps", side => {
  let state = fixture(side);
  const other = side === "attacker" ? "defender" : "attacker";
  state.sides[other].spiritId = silver;
  state = setSpent(setSpent(state, side, 5), other, 11);
  const direction = directionFor(side);
  state = applyS5EnergyUse(state, prepare(state, side));
  expect(state.directions[direction].context[spentKey()]).toBe(7);
  expect(state.directions[oppositeDirection(direction)].context[spentKey("defender")]).toBe(7);
  expect(prepare(state, other).total).toBe(13);
  const swapped = calculatorReducer(state, { type: "sides/swap" });
  expect(prepare(swapped, other).total).toBe(9);
  expect(prepare(swapped, side).total).toBe(13);
  const next = applyS5EnergyUse(swapped, prepare(swapped, other));
  expect(next.directions[directionFor(other)].context[spentKey()]).toBe(9);
  expect(next.directions[direction].context[spentKey("defender")]).toBe(9);
});

test("legacy exact percentages and migrated data start at the same count; an explicit zero replaces an incompatible old total", () => {
  const state = fixture();
  state.directions.forward.context[oldKey] = 50;
  expect(prepare(state).total).toBe(7);
  const migrated = correctS5PreviewReferences(state);
  expect(prepare(migrated).total).toBe(7);
  state.directions.forward.context[oldKey] = 75;
  expect(prepare(state)).toBeNull();
  const replaced = setSpent(state, "attacker", 0);
  expect(prepare(replaced)).toMatchObject({ cost: 2, total: 2 });
  expect(applyS5EnergyUse(replaced, prepare(replaced)).directions.forward.context[spentKey()]).toBe(2);
});

test("ignored or unrelated traits do not record energy or enable ordinary skill usage", () => {
  const ignored = fixture();
  ignored.sides.attacker.ignoreTraits = true;
  expect(prepare(ignored)).toBeNull();
  const other = fixture("defender");
  expect(prepare(other)).toBeNull();
  expect(applyS5EnergyUse(other, null)).toBe(other);
});

test.each(["attacker", "defender"])("%s borrowed silver trait uses its own stored values without changing native contexts or other acquired traits", side => {
  const state = fixture(side);
  state.sides[side].spiritId = snapshot.spirits.find(entry => entry.fullName === "诅咒狼灵").id;
  state.sides[side].acquiredTraitIds = [silverTrait];
  const canonical = canonicalTraitControlKey(getSilverEnergySpentInput());
  state.sides[side].acquiredTraitValues = {
    [silverTrait]: { [canonicalTraitControlKey(getLegacySilverEnergyInput())]: 50 },
    unrelated: { untouched: 7 },
  };
  state.directions[directionFor(side)].context[spentKey()] = 99;
  const migrated = correctS5PreviewReferences(state);
  const use = prepare(migrated, side);
  expect(use).toMatchObject({ acquired: true, traitId: silverTrait, total: 7 });
  const next = applyS5EnergyUse(migrated, use);
  expect(next.sides[side].acquiredTraitValues[silverTrait][canonical]).toBe(7);
  expect(next.sides[side].acquiredTraitValues.unrelated).toBe(state.sides[side].acquiredTraitValues.unrelated);
  expect(next.directions).toBe(state.directions);
  expect(prepare(next, side).total).toBe(9);
  next.sides[side] = { ...next.sides[side], ignoreTraits: true };
  expect(prepare(next, side)).toBeNull();
});

test.each([undefined, null, -1, 0.5, "2", Number.NaN, Number.POSITIVE_INFINITY])("missing or invalid settled cost %s cannot fall back to the selected skill cost", cost => {
  const state = fixture();
  expect(prepare(state, "attacker", { skillCost: cost })).toBeNull();
  expect(prepareS5EnergyUse(state, { snapshot, side: "attacker" })).toBeNull();
});

test("a settled zero-cost use is accepted without changing the energy total", () => {
  const state = setSpent(fixture(), "attacker", 5);
  const use = prepare(state, "attacker", { skillCost: 0 });
  expect(use).toMatchObject({ cost: 0, total: 5 });
  expect(applyS5EnergyUse(state, use)).toBe(state);
});

test("the prepared click keeps its cost when settlement changes the discount before writeback", () => {
  const state = setSpent(fixture(), "attacker", 5);
  const result = calculation(state).forward.results[0];
  expect(result.skillCost).toBe(3);
  const use = prepare(state, "attacker", result);
  const settled = structuredClone(state);
  settled.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-2" }];
  expect(calculation(settled).forward.results[0].skillCost).toBe(1);
  const next = applyS5EnergyUse(settled, use);
  expect(next.directions.forward.context[spentKey()]).toBe(8);
  expect(next.directions.forward.overrides).toBe(settled.directions.forward.overrides);
});

test.each(["single", "four"])("%s negative-status use is charged once and cancellation is not a new use", mode => {
  let state = fixture("attacker", mode);
  state.sides.attacker.skills.single = skill("引燃").id;
  state.sides.attacker.skills.four[0] = skill("引燃").id;
  state.calculationOptions.includeNegativeStatusSettlement = true;
  const activate = current => {
    const calculated = calculation(current);
    const use = prepare(current, "attacker", calculated.forward.results[0]);
    const applied = applyBattleActivation({ calculation: calculated, allowNoEffectUse: Boolean(use),
      side: "attacker", skillIndex: 0, skillMode: mode, snapshot, state: current });
    return { ...applied, state: applied.skillUsed ? applyS5EnergyUse(applied.state, use) : applied.state };
  };
  const first = activate(state);
  expect(first).toMatchObject({ applied: true, skillUsed: true });
  state = first.state;
  const charged = skill("引燃").cost;
  expect(state.directions.forward.context[spentKey()]).toBe(charged);
  const cancelled = activate(state);
  expect(cancelled.applied).toBe(true);
  expect(cancelled.skillUsed).not.toBe(true);
  expect(cancelled.state.directions.forward.context[spentKey()]).toBe(charged);
});


test("automatic energy is retained in the existing personal configuration path", () => {
  const state = fixture();
  const next = applyS5EnergyUse(state, prepare(state));
  const values = extractTraitValues(next.sides.attacker, snapshot);
  expect(values[canonicalTraitControlKey(getSilverEnergySpentInput())]).toBe(2);
});


test.each(["single", "four"])("%s silver energy writeback does not turn cancelling a transient defense state into another use", async mode => {
  const { getSkillStatusEffectInputs } = await import("../../src/domain/skill-status-effects.js");
  const selected = skill("热身");
  let state = fixture("attacker", mode);
  state.sides.attacker.skills.single = selected.id;
  state.sides.attacker.skills.four[0] = selected.id;
  const activate = current => {
    const calculated = calculation(current);
    const use = prepare(current, "attacker", calculated.forward.results[0]);
    const applied = applyBattleActivation({ calculation: calculated, allowNoEffectUse: Boolean(use),
      side: "attacker", skillIndex: 0, skillMode: mode, snapshot, state: current });
    return { ...applied, state: applied.skillUsed ? applyS5EnergyUse(applied.state, use) : applied.state };
  };
  const first = activate(state);
  expect(first.skillUsed).toBe(true);
  expect(first.state.directions.forward.context[spentKey()]).toBe(1);
  expect(first.state.directions.forward.overrides.activeDefenseStatus).toBeTruthy();
  // Trait counters, ready discounts and global weather are not skill conditions.
  first.state.directions.forward.context.weatherDream = true;
  first.state.directions.forward.context.attackerTraitS5GrassDiscountReady = false;
  const cancelled = activate(first.state);
  expect(cancelled.skillUsed).not.toBe(true);
  expect(cancelled.state.directions.forward.context[spentKey()]).toBe(1);
  expect(cancelled.state.directions.forward.overrides.activeDefenseStatus).toBeNull();
  // Changing the skill's actual defense-response condition must still reapply it.
  state = activate(state).state;
  const control = getSkillStatusEffectInputs(selected).find(input => input.contextKey === "counterDefenseSucceeded");
  if (mode === "single") state.directions.forward.context[control.id] = true;
  else state.sides.attacker.skills.four[0] = { skillId: selected.id, context: { [control.id]: true } };
  const reapplied = activate(state);
  expect(reapplied.skillUsed).toBe(true);
  expect(reapplied.state.directions.forward.context[spentKey()]).toBe(2);
  expect(reapplied.state.directions.forward.overrides.skillPowerPercentAddsBySlot["2"]).toBe(3);
});


test.each(["single", "four"].flatMap(mode => ["丰收", "孢子"].map(name => [mode, name])))(
  "%s acquired silver and crab use %s charges its discounted cost once and consumes only the crab instance", async (mode, name) => {
    const { applyS5DiscountUse, prepareS5DiscountUse } = await import("../../src/features/s5-preview/cost-discount-use.js");
    const { getS5PreviewTraitInputs } = await import("../../src/domain/s5-preview-traits.js");
    let state = fixture("attacker", mode);
    state.sides.attacker.spiritId = snapshot.spirits.find(entry => entry.fullName === "银月狼王").id;
    const crab = snapshot.traits.find(trait => trait.id === "trait_preview_s5_crab-coconut");
    const crabKey = canonicalTraitControlKey(getS5PreviewTraitInputs(crab)[0]);
    const silverKey = canonicalTraitControlKey(getSilverEnergySpentInput());
    state.sides.attacker.acquiredTraitIds = [silverTrait, crab.id];
    state.sides.attacker.acquiredTraitValues = { [silverTrait]: { [silverKey]: 5 }, [crab.id]: { [crabKey]: true } };
    const selected = skill(name);
    state.sides.attacker.skills = { single: selected.id, four: [selected.id, null, null, null] };
    state.calculationOptions.includeNegativeStatusSettlement = true;
    const activate = current => {
      const calculated = calculation(current);
      const energy = prepare(current, "attacker", calculated.forward.results[0]);
      const discount = prepareS5DiscountUse(current, { snapshot, side: "attacker", skill: selected, result: calculated.forward.results[0] });
      const applied = applyBattleActivation({ calculation: calculated, allowNoEffectUse: Boolean(energy || discount),
        side: "attacker", skillIndex: 0, skillMode: mode, snapshot, state: current });
      return { ...applied, state: applied.skillUsed ? applyS5DiscountUse(applyS5EnergyUse(applied.state, energy), discount) : applied.state };
    };
    const discounted = Math.max(0, selected.cost - 3);
    expect(calculation(state).forward.results[0].skillCost).toBe(discounted);
    state = activate(state).state;
    expect(state.sides.attacker.acquiredTraitValues[silverTrait][silverKey]).toBe(5 + discounted);
    expect(state.sides.attacker.acquiredTraitValues[crab.id][crabKey]).toBe(false);
    expect(calculation(state).forward.results[0].skillCost).toBe(selected.cost);
    if (name === "孢子") {
      const cancelled = activate(state);
      expect(cancelled.skillUsed).not.toBe(true);
      expect(cancelled.state.sides.attacker.acquiredTraitValues).toEqual(state.sides.attacker.acquiredTraitValues);
    } else {
      const next = activate(state);
      expect(next.skillUsed).toBe(true);
      expect(next.state.sides.attacker.acquiredTraitValues[silverTrait][silverKey]).toBe(5 + discounted + selected.cost);
    }
  },
);

test("old full-context activation signatures remain cancellable while real skill condition changes reapply", async () => {
  const { matchesSkillActivationContext } = await import("../../src/state/battle-activation.js");
  const old = JSON.stringify({ counterDefenseSucceeded: false, attackerTraitS5EnergySpent: 0, weatherDream: false });
  const updated = { counterDefenseSucceeded: false, attackerTraitS5EnergySpent: 2, weatherDream: true };
  expect(matchesSkillActivationContext(skill("热身"), old, updated)).toBe(true);
  expect(matchesSkillActivationContext(skill("热身"), old, { ...updated, counterDefenseSucceeded: true })).toBe(false);
});
