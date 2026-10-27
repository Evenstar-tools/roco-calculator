import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { buildCalculatorViewModel, getTraitView } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { updateMirroredTraitContext, migrateSharedConfiguration, applyConfiguration, selectSpirit } from "../../src/state/calculator-session.js";

import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { extractTraitValues } from "../../src/state/trait-values.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { createPreviewStorage } from "../../src/runtime/preview-storage.js";
import { createUndoHistory } from "../../src/state/undo-history.js";
import { getEffectiveTraits } from "../../src/domain/effective-traits.js";
import { getS5PreviewTraitEvaluation, getS5PreviewTraitInputs, resolveS5PreviewTraitEffect } from "../../src/domain/s5-preview-traits.js";
import { getLegacyS5DiceInput, getS5SixFaceDiceInput } from "../../src/features/s5-preview/dice-input-migration.js";
import { selectShareableInputs } from "../../src/state/share.js";
import { materializeTraitContext } from "../../src/state/trait-values.js";

const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));

test.each([5, 20])("初阶旧20面骰点%s经会话与个人配置恢复，只接续有效1~6且不覆盖显式新值", face => {
  const state = createInitialState(snapshot);
  state.sides.attacker.spiritId = "spirit_preview_s5_diliutun";
  state.sides.defender.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "迪莫").id;
  const trait = snapshot.traits.find(trait => trait.id === "trait_preview_s5_diliutun");
  const old = getLegacyS5DiceInput();
  const current = getS5SixFaceDiceInput();
  const rolled = getS5PreviewTraitInputs(trait).find(control => control.contextKey.endsWith("DiceRolled"));
  state.directions.forward.context = { [old.id]: face, [rolled.id]: true };
  const restored = migrateSharedConfiguration(selectShareableInputs(state), state.versions, snapshot);
  const saved = { ...state.sides.attacker, traitValues: { [canonicalTraitControlKey(old)]: face } };
  const extracted = extractTraitValues(saved, snapshot);
  const materialized = materializeTraitContext(extracted, snapshot, saved.spiritId, "attacker");
  const applied = applyConfiguration(createInitialState(snapshot), { ...saved, traitValues: extracted }, {
    initialState: createInitialState(snapshot), side: "attacker", snapshot, source: "personal", remember: false,
  }).state;
  for (const context of [restored.directions.forward.context, materialized, applied.directions.forward.context]) {
    if (face <= 6) expect(context[current.id]).toBe(face);
    else {
      expect(context).not.toHaveProperty(current.id);
      expect(context[old.id]).toBe(face);
      expect(getS5PreviewTraitEvaluation(trait, "attacker", context)).toMatchObject({ calcStatus: "pending", summary: expect.stringContaining("重新选择") });
    }
  }
  const explicit = migrateSharedConfiguration(selectShareableInputs({ ...state, directions: { ...state.directions,
    forward: { ...state.directions.forward, context: { ...state.directions.forward.context, [current.id]: 2 } },
  } }), state.versions, snapshot);
  expect(explicit.directions.forward.context[current.id]).toBe(2);
});

function fixture(key) {
  let state = createInitialState(snapshot);
  for (const side of ["attacker", "defender"]) {
    state.sides[side].spiritId = `spirit_preview_s5_${key}`;
    state.sides[side].skills = { single: null, four: [null, null, null, null] };
  }
  const spirit = snapshot.spirits.find(entry => entry.id === state.sides.attacker.spiritId);
  const inputs = getTraitView(snapshot, spirit).inputs.filter(input => input.scope !== "battle" && !input.action);
  for (const input of inputs) {
    const first = input.type === "boolean" ? true : input.type === "choice" ? input.options[1].value : Math.min(input.max ?? Infinity, Math.max(1, input.min ?? 0) + 2);
    const second = input.type === "boolean" ? false : input.type === "choice" ? input.options[0].value : Math.max(input.min ?? 0, 1);
    state = updateMirroredTraitContext(state, { direction: "forward", key: input.id, value: first }).state;
    state = updateMirroredTraitContext(state, { direction: "reverse", key: input.id, value: second }).state;
  }
  return { state, inputs };
}

test.each(catalog.entries.filter(entry => entry.key !== "lily-of-valley").map(entry => entry.key))(
  "%s same-species owners retain their distinct trait inputs when swapping sides", key => {
    const { state, inputs } = fixture(key);
    const swapped = calculatorReducer(state, { type: "sides/swap" });
    for (const input of inputs) {
      expect(swapped.directions.forward.context[input.id], input.contextKey).toBe(state.directions.reverse.context[input.id]);
      expect(swapped.directions.reverse.context[input.id], input.contextKey).toBe(state.directions.forward.context[input.id]);
    }
    expect(calculatorReducer(swapped, { type: "sides/swap" })).toEqual(state);
  },
);

test.each(["little-scissor", "lele-shark", "egg-wrap", "boss-ice-bruce"])(
  "%s panel stats follow their owner after swap rather than remaining attached to the old column", key => {
    let { state } = fixture(key);
    if (key === "boss-ice-bruce") {
      const spirit = snapshot.spirits.find(entry => entry.id === state.sides.attacker.spiritId);
      const cost = getTraitView(snapshot, spirit).inputs.find(input => input.contextKey.endsWith("OpponentTotalCost"));
      state = updateMirroredTraitContext(state, { direction: "forward", key: cost.id, value: 20 }).state;
    }
    const before = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    const swapped = calculatorReducer(state, { type: "sides/swap" });
    const after = buildCalculatorViewModel({ snapshot, state: swapped, activeDirection: "forward" });
    expect(after.sides.attacker.finalPanelStats).toEqual(before.sides.defender.finalPanelStats);
    expect(after.sides.defender.finalPanelStats).toEqual(before.sides.attacker.finalPanelStats);
  },
);


test.each([
  ["underground-silver-dragon", 75, false, "pending"], ["underground-silver-dragon", 75, true, "ready"],
  ["gold-vein-dragon", 70, false, "pending"], ["gold-vein-dragon", 70, true, "ready"],
  ["underground-silver-dragon", 50, false, "ready"], ["gold-vein-dragon", 100, false, "ready"],
])("%s old total %s share normalization honors explicit zero=%s (%s)", async (key, total, zero, status) => {
  const { getLegacySilverEnergyInput, getSilverEnergySpentInput } = await import("../../src/features/s5-preview/energy-input-migration.js");
  const { getLegacyGoldChargeInputs, getGoldChargeCountInput } = await import("../../src/features/s5-preview/charge-input-migration.js");
  const { correctS5PreviewReferences } = await import("../../src/features/s5-preview/reference-corrections.js");
  const { selectShareableInputs } = await import("../../src/state/share.js");
  const { state } = fixture(key);
  for (const direction of ["forward", "reverse"]) state.directions[direction].context = {};
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    const values = state.directions[direction].context;
    if (key === "underground-silver-dragon") values[getLegacySilverEnergyInput(role).id] = total;
    else {
      const [active, bonus] = getLegacyGoldChargeInputs(role);
      values[active.id] = true;
      values[bonus.id] = total;
    }
    if (zero) values[(key === "underground-silver-dragon" ? getSilverEnergySpentInput(role) : getGoldChargeCountInput(role)).id] = 0;
  }
  const spirit = snapshot.spirits.find(entry => entry.id === state.sides.attacker.spiritId);
  const trait = getTraitView(snapshot, spirit).previewTraitEntity;
  const { getS5PreviewTraitEvaluation } = await import("../../src/domain/s5-preview-traits.js");
  const restored = migrateSharedConfiguration(correctS5PreviewReferences(selectShareableInputs(state)), state.versions, snapshot);
  expect(getS5PreviewTraitEvaluation(trait, "attacker", state.directions.forward.context).calcStatus).toBe(status);
  expect(getS5PreviewTraitEvaluation(trait, "attacker", restored.directions.forward.context).calcStatus).toBe(status);
});

function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test.each(catalog.entries.map(entry => entry.key))("%s swap survives preview refresh and undo restores both owners", key => {
  const { state } = fixture(key);
  const history = createUndoHistory();
  history.record(state);
  const swapped = calculatorReducer(state, { type: "sides/swap" });
  const storage = memoryStorage();
  createCalculatorSessionStore({ storage: createPreviewStorage(storage) }).saveSession({ present: swapped, ...history.snapshot() });
  const refreshed = createCalculatorSessionStore({ storage: createPreviewStorage(storage) }).loadSession();
  expect(refreshed.present).toEqual(swapped);
  const restoredHistory = createUndoHistory();
  restoredHistory.restore(refreshed);
  expect(restoredHistory.undo(refreshed.present).state).toEqual(state);
});

test("S5 swaps owner aliases and acquired instances while retaining formal direction and shared weather settings", () => {
  const { state } = fixture("egg-wrap");
  state.directions.forward.context.attackerTraitS5CurrentMagicalAttackBonus = 75;
  state.directions.reverse.context.attackerTraitS5CurrentMagicalAttackBonus = 40;
  state.directions.forward.context["attackerTrait.traitActivated.formal"] = true;
  state.directions.reverse.context["attackerTrait.traitActivated.formal"] = false;
  state.directions.forward.context.weatherDream = true;
  state.directions.reverse.context.weatherDream = true;
  state.directions.forward.overrides.attackLevelStage = 3;
  state.directions.reverse.overrides.attackLevelStage = -1;
  for (const [side, value] of [["attacker", 1], ["defender", 2]]) {
    state.sides[side].acquiredTraitIds = ["trait_preview_s5_gold-vein-dragon"];
    state.sides[side].acquiredTraitValues = { "trait_preview_s5_gold-vein-dragon": { counter: value } };
  }
  const swapped = calculatorReducer(state, { type: "sides/swap" });
  expect(swapped.directions.forward.context.attackerTraitS5CurrentMagicalAttackBonus).toBe(40);
  expect(swapped.directions.reverse.context.attackerTraitS5CurrentMagicalAttackBonus).toBe(75);
  for (const direction of ["forward", "reverse"]) {
    expect(swapped.directions[direction].context["attackerTrait.traitActivated.formal"]).toBe(state.directions[direction].context["attackerTrait.traitActivated.formal"]);
    expect(swapped.directions[direction].context.weatherDream).toBe(true);
    expect(swapped.directions[direction].overrides).toBe(state.directions[direction].overrides);
  }
  expect(swapped.sides.attacker.acquiredTraitValues).toBe(state.sides.defender.acquiredTraitValues);
  expect(swapped.sides.defender.acquiredTraitValues).toBe(state.sides.attacker.acquiredTraitValues);
});

test.each(["little-scissor", "lele-shark", "egg-wrap", "boss-ice-bruce"])(
  "%s native mirrored state survives direction views and personal application; ignore/switch removes active effects", key => {
    const { state, inputs } = fixture(key);
    const before = structuredClone(state);
    const forward = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    const reverse = buildCalculatorViewModel({ snapshot, state, activeDirection: "reverse" });
    expect(reverse.sides.attacker.finalPanelStats).toEqual(forward.sides.attacker.finalPanelStats);
    expect(state).toEqual(before);
    const config = { ...state.sides.attacker, traitValues: Object.fromEntries(inputs.map(input => [canonicalTraitControlKey(input), state.directions.forward.context[input.id]])) };
    config.traitValues = extractTraitValues(config, snapshot);
    const applied = applyConfiguration(createInitialState(snapshot), config, {
      initialState: createInitialState(snapshot), side: "defender", snapshot, source: "personal", remember: false,
    }).state;
    expect(buildCalculatorViewModel({ snapshot, state: applied, activeDirection: "forward" }).sides.defender.finalPanelStats).toEqual(forward.sides.attacker.finalPanelStats);
    const ignored = structuredClone(state);
    ignored.sides.attacker.ignoreTraits = true;
    const ignoredView = buildCalculatorViewModel({ snapshot, state: ignored, activeDirection: "forward" });
    expect(ignoredView.sides.attacker.finalPanelStats ?? ignoredView.sides.attacker.panelStats).toEqual(ignoredView.sides.attacker.panelStats);
    expect(ignored.directions).toEqual(state.directions);
    const normal = snapshot.spirits.find(entry => entry.fullName === "迪莫");
    const changed = selectSpirit(state, { initialState: createInitialState(snapshot), snapshot, side: "attacker", spiritId: normal.id }).state;
    for (const input of inputs) expect(changed.directions.forward.context).not.toHaveProperty(input.id);
    expect(getEffectiveTraits(snapshot, { ...changed.sides.attacker, spirit: normal }).some(trait => trait.previewIdentity)).toBe(false);
  },
);

test.each(["little-scissor", "lele-shark", "egg-wrap", "boss-ice-bruce"])(
  "acquired %s instance reads owner canonical values without borrowing the native opponent's controls", key => {
    const { state, inputs } = fixture(key);
    const wolf = snapshot.spirits.find(entry => entry.fullName === "银月狼王");
    const targetId = "trait_preview_s5_" + key;
    state.sides.attacker.spiritId = wolf.id;
    state.sides.attacker.acquiredTraitIds = [targetId];
    state.sides.attacker.acquiredTraitValues = { [targetId]: Object.fromEntries(inputs.map(input => [canonicalTraitControlKey(input), state.directions.reverse.context[input.id]])) };
    const traits = getEffectiveTraits(snapshot, { ...state.sides.attacker, spirit: wolf });
    const acquired = traits.find(trait => trait.id === targetId);
    expect(acquired).toMatchObject({ acquired: true, runtimeInputValues: state.sides.attacker.acquiredTraitValues[targetId] });
    const baseline = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" }).sides.attacker.finalPanelStats;
    const baselinePower = resolveS5PreviewTraitEffect(acquired, "attacker", { skill: { category: "physical" } }).fixedPowerAdd;
    state.sides.attacker.acquiredTraitValues[targetId] = Object.fromEntries(inputs.map(input => [canonicalTraitControlKey(input),
      input.contextKey.endsWith("OpponentTotalCost") ? 20 : state.directions.forward.context[input.id]]));
    const boosted = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" }).sides.attacker.finalPanelStats;
    if (key === "boss-ice-bruce") expect(boosted.speed).toBe(baseline.speed + 50);
    else if (key === "egg-wrap") expect(boosted.physicalDefense).toBeGreaterThan(baseline.physicalDefense);
    else if (key === "little-scissor") {
      const updated = getEffectiveTraits(snapshot, { ...state.sides.attacker, spirit: wolf }).find(trait => trait.id === targetId);
      expect(resolveS5PreviewTraitEffect(updated, "attacker", { skill: { category: "physical" } }).fixedPowerAdd).toBeGreaterThan(baselinePower);
      expect(boosted.physicalAttack).toBe(baseline.physicalAttack);
    }
    else expect(boosted.physicalAttack).toBeGreaterThan(baseline.physicalAttack);
    const ignored = getEffectiveTraits(snapshot, { ...state.sides.attacker, spirit: wolf, ignoreTraits: true });
    expect(ignored).toEqual([]);
    const swapped = calculatorReducer(state, { type: "sides/swap" });
    expect(getEffectiveTraits(snapshot, { ...swapped.sides.defender, spirit: wolf }).find(trait => trait.id === targetId).runtimeInputValues).toEqual(state.sides.attacker.acquiredTraitValues[targetId]);
  },
);
