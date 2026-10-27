import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { getS5PreviewTraitInputs, getS5PreviewTraitEvaluation } from "../../src/domain/s5-preview-traits.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { applyS5EnergyUse, prepareS5EnergyUse } from "../../src/features/s5-preview/energy-use.js";
import { applyS5PreviewStatTurnEnd, updateS5PreviewTurnEndCounter } from "../../src/features/s5-preview/turn-end.js";
import { correctS5PreviewReferences } from "../../src/features/s5-preview/reference-corrections.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { migrateSharedConfiguration, updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { selectShareableInputs } from "../../src/state/share.js";
import { extractTraitValues, materializeTraitContext } from "../../src/state/trait-values.js";

const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const keys = ["gold-vein-dragon", "underground-silver-dragon"];
const directionFor = side => side === "attacker" ? "forward" : "reverse";
const traitFor = key => snapshot.traits.find(trait => trait.id === `trait_preview_s5_${key}`);
const countFor = key => getS5PreviewTraitInputs(traitFor(key))[0];
function fixture(key, side = "attacker") {
  const state = createInitialState(snapshot);
  state.mode = "four";
  for (const [owner, configured] of Object.entries(state.sides)) {
    configured.spiritId = owner === side ? `spirit_preview_s5_${key}` : snapshot.spirits.find(spirit => spirit.fullName === "迪莫").id;
    configured.skills = { single: null, four: ["撕咬", "水波术"].map(name => snapshot.skills.find(skill => skill.name === name).id).concat([null, null]) };
  }
  return state;
}
const model = state => buildBalanceComparison({ snapshot, state }).afterView;
const edit = (state, key, side, value, traitId) => updateS5PreviewTurnEndCounter(state, {
  snapshot, side, value, traitId, control: countFor(key),
});
const end = (state, side = "attacker") => applyS5PreviewStatTurnEnd(state, { snapshot, side }).state;

test.each(keys.flatMap(key => ["attacker", "defender"].map(side => [key, side])))
  ("%s %s waits for an explicit turn end, affects only its attack stat, and clears/clamps", (key, side) => {
    let state = fixture(key, side);
    const base = model(state);
    state = edit(state, key, side, 2);
    expect(model(state).sides[side].finalPanelStats).toEqual(base.sides[side].finalPanelStats);
    const pending = state;
    state = end(state, side);
    const settled = model(state);
    const affected = key === "gold-vein-dragon" ? "physicalAttack" : "magicalAttack";
    const unchanged = key === "gold-vein-dragon" ? "magicalAttack" : "physicalAttack";
    const factor = key === "gold-vein-dragon" ? 2 : 1.2;
    expect(settled.sides[side].finalPanelStats[affected]).toBe(Math.floor(base.sides[side].panelStats[affected] * factor));
    expect(settled.sides[side].finalPanelStats[unchanged]).toBe(base.sides[side].panelStats[unchanged]);
    const results = settled.skillResultsByDirection[directionFor(side)];
    const before = base.skillResultsByDirection[directionFor(side)];
    const changedSkill = key === "gold-vein-dragon" ? 0 : 1;
    expect(results[changedSkill].totalDamage).toBeGreaterThan(before[changedSkill].totalDamage);
    expect(results[1 - changedSkill].totalDamage).toBe(before[1 - changedSkill].totalDamage);
    expect(end(state, side)).toBe(state);
    // An undo restoring the recorded state also restores pending status.
    expect(model(pending).sides[side].finalPanelStats).toEqual(base.sides[side].finalPanelStats);
    state = edit(state, key, side, 1);
    const count = getS5PreviewTraitEvaluation(traitFor(key), "attacker", state.directions[directionFor(side)].context);
    expect(count).toMatchObject({ totalCount: 1, settledCount: 1, pendingCount: 0 });
    state = edit(state, key, side, 0);
    expect(model(state).sides[side].finalPanelStats).toEqual(base.sides[side].finalPanelStats);
    state = edit(state, key, side, 1);
    expect(model(state).sides[side].finalPanelStats).toEqual(base.sides[side].finalPanelStats);
  });

test.each(keys)("%s pending and settled portions survive refresh, config memory, sharing and swaps; old saves remain applied", key => {
  let old = fixture(key);
  old = updateMirroredTraitContext(old, { direction: "forward", key: countFor(key).id, value: 2 }).state;
  const legacy = model(old);
  let state = edit(old, key, "attacker", 3);
  const before = model(state);
  expect(before.sides.attacker.finalPanelStats).toEqual(legacy.sides.attacker.finalPanelStats);
  const fresh = correctS5PreviewReferences(JSON.parse(JSON.stringify(state)));
  const shared = migrateSharedConfiguration(selectShareableInputs(state), state.versions, snapshot);
  for (const restored of [fresh, shared]) {
    expect(model(restored).sides.attacker.finalPanelStats).toEqual(before.sides.attacker.finalPanelStats);
    expect(model(end(restored)).sides.attacker.finalPanelStats).not.toEqual(before.sides.attacker.finalPanelStats);
  }
  state = end(state);
  const values = extractTraitValues(state.sides.attacker, snapshot);
  const settledControl = getS5PreviewTraitInputs(traitFor(key)).find(control => control.hidden);
  expect(values[canonicalTraitControlKey(settledControl)]).toBe(3);
  const restoredContext = materializeTraitContext(values, snapshot, state.sides.attacker.spiritId, "attacker");
  expect(getS5PreviewTraitEvaluation(traitFor(key), "attacker", restoredContext)).toMatchObject({ totalCount: 3, settledCount: 3, pendingCount: 0 });
  const swapped = calculatorReducer(fresh, { type: "sides/swap" });
  expect(model(swapped).sides.defender.finalPanelStats).toEqual(before.sides.attacker.finalPanelStats);
  expect(calculatorReducer(swapped, { type: "sides/swap" })).toEqual(fresh);
});

test("silver energy use records the actual cost without raising that skill's damage before turn end", () => {
  let state = fixture("underground-silver-dragon");
  const before = model(state);
  const result = before.calculation.forward.results[1];
  state = applyS5EnergyUse(state, prepareS5EnergyUse(state, { snapshot, side: "attacker", result }));
  expect(model(state).calculation.forward.results[1].totalDamage).toBe(result.totalDamage);
  state = end(state);
  expect(model(state).calculation.forward.results[1].totalDamage).toBeGreaterThan(result.totalDamage);
});

test("both borrowed counters settle together on their owner and preserve unrelated instances", () => {
  let state = fixture("gold-vein-dragon");
  state.sides.attacker.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "诅咒狼灵").id;
  state.sides.attacker.acquiredTraitIds = keys.map(key => traitFor(key).id);
  state.sides.attacker.acquiredTraitValues = { unrelated: { value: 7 } };
  for (const key of keys) state = edit(state, key, "attacker", 2, traitFor(key).id);
  const pending = model(state);
  const contexts = state.directions;
  state = end(state);
  expect(state.directions).toBe(contexts);
  expect(state.sides.attacker.acquiredTraitValues.unrelated).toEqual({ value: 7 });
  expect(model(state).sides.attacker.finalPanelStats.physicalAttack).toBeGreaterThan(pending.sides.attacker.finalPanelStats.physicalAttack);
  expect(model(state).sides.attacker.finalPanelStats.magicalAttack).toBeGreaterThan(pending.sides.attacker.finalPanelStats.magicalAttack);
  expect(end(state)).toBe(state);
});
