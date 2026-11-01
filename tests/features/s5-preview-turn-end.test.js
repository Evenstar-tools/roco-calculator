import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { getS5PreviewTraitInputs, getS5PreviewTraitEvaluation } from "../../src/domain/s5-preview-traits.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { applyS5EnergyUse, prepareS5EnergyUse } from "../../src/features/s5-preview/energy-use.js";
import { applyS5PreviewStatTurnEnd, updateS5PreviewTurnEndCounter } from "../../src/features/s5-preview/turn-end.js";
import { correctS5PreviewReferences } from "../../src/features/s5-preview/reference-corrections.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { migrateSharedConfiguration, rememberSingleSkill, updateMirroredTraitContext } from "../../src/state/calculator-session.js";
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

test.each(["attacker", "defender"].map(side => ["underground-silver-dragon", side]))
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

test.each(["underground-silver-dragon"])("%s pending and settled portions survive refresh, config memory, sharing and swaps; old saves remain applied", key => {
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

test.each(["attacker", "defender"])("gold %s applies counts0/1/3 immediately and keeps them through memory, sharing and swaps", side => {
  const key = "gold-vein-dragon";
  let state = fixture(key, side);
  const direction = directionFor(side);
  state.directions[direction].context.attackerTraitS5SettledChargeCount = 0;
  const base = model(state);
  for (const count of [0, 1, 3]) {
    state = edit(state, key, side, count);
    const current = model(state);
    expect(current.sides[side].finalPanelStats.physicalAttack)
      .toBe(Math.floor(base.sides[side].panelStats.physicalAttack * (1 + count * .5)));
    expect(current.sides[side].finalPanelStats.magicalAttack).toBe(base.sides[side].panelStats.magicalAttack);
    expect(getS5PreviewTraitEvaluation(traitFor(key), "attacker", state.directions[direction].context))
      .toMatchObject({ totalCount: count, settledCount: count, pendingCount: 0 });
    expect(end(state, side)).toBe(state);
  }
  const expected = model(state).sides[side].finalPanelStats;
  const fresh = correctS5PreviewReferences(JSON.parse(JSON.stringify(state)));
  const shared = migrateSharedConfiguration(selectShareableInputs(state), state.versions, snapshot);
  for (const restored of [fresh, shared]) expect(model(restored).sides[side].finalPanelStats).toEqual(expected);
  state = rememberSingleSkill(state, { side, direction, snapshot }).state;
  const values = extractTraitValues(state.sides[side], snapshot);
  expect(getS5PreviewTraitInputs(traitFor(key))).toHaveLength(1);
  expect(values[canonicalTraitControlKey(countFor(key))]).toBe(3);
  const context = materializeTraitContext(values, snapshot, state.sides[side].spiritId, "attacker");
  expect(getS5PreviewTraitEvaluation(traitFor(key), "attacker", context))
    .toMatchObject({ settledCount: 3, pendingCount: 0, summary: "聚能 3 次 · 物攻 +150%" });
  const swapped = calculatorReducer(state, { type: "sides/swap" });
  expect(model(swapped).sides[side === "attacker" ? "defender" : "attacker"].finalPanelStats).toEqual(expected);
  expect(calculatorReducer(swapped, { type: "sides/swap" })).toEqual(state);
  state = edit(state, key, side, 0);
  expect(model(state).sides[side].finalPanelStats).toEqual(base.sides[side].finalPanelStats);
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

test("borrowed gold applies immediately while silver alone settles at turn end, preserving owner and unrelated values", () => {
  let state = fixture("gold-vein-dragon");
  state.sides.attacker.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "诅咒狼灵").id;
  state.sides.attacker.acquiredTraitIds = keys.map(key => traitFor(key).id);
  state.sides.attacker.acquiredTraitValues = { unrelated: { value: 7 } };
  const base = model(state);
  for (const key of keys) state = edit(state, key, "attacker", 3, traitFor(key).id);
  const pending = model(state);
  expect(pending.sides.attacker.finalPanelStats.physicalAttack)
    .toBe(Math.floor(base.sides.attacker.panelStats.physicalAttack * 2.5));
  expect(pending.sides.attacker.finalPanelStats.magicalAttack).toBe(base.sides.attacker.finalPanelStats.magicalAttack);
  const swapped = calculatorReducer(state, { type: "sides/swap" });
  expect(model(swapped).sides.defender.finalPanelStats).toEqual(pending.sides.attacker.finalPanelStats);
  const contexts = state.directions;
  state = end(state);
  expect(state.directions).toBe(contexts);
  expect(state.sides.attacker.acquiredTraitValues.unrelated).toEqual({ value: 7 });
  expect(model(state).sides.attacker.finalPanelStats.physicalAttack).toBe(pending.sides.attacker.finalPanelStats.physicalAttack);
  expect(model(state).sides.attacker.finalPanelStats.magicalAttack).toBeGreaterThan(pending.sides.attacker.finalPanelStats.magicalAttack);
  expect(end(state)).toBe(state);
});
