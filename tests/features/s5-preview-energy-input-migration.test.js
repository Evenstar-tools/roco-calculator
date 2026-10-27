import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { getS5PreviewTraitEvaluation, resolveS5PreviewTraitEffect } from "../../src/domain/s5-preview-traits.js";
import { getLegacySilverEnergyInput, getSilverEnergySpentInput } from "../../src/features/s5-preview/energy-input-migration.js";
import { correctS5PreviewReferences, correctS5PreviewStoredJson } from "../../src/features/s5-preview/reference-corrections.js";
import { createPreviewStorage } from "../../src/runtime/preview-storage.js";
import { createInitialState } from "../../src/state/defaults.js";
import { applyConfiguration, updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { extractTraitValues } from "../../src/state/trait-values.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";

const silver = "spirit_preview_s5_underground-silver-dragon";
const silverTrait = "trait_preview_s5_underground-silver-dragon";
const trait = { id: silverTrait, previewIdentity: { catalogId: "s5-test", mechanicKey: "underground-silver-dragon" } };
const key = (control, canonical = false) => canonical ? canonicalTraitControlKey(control) : control.id;
const spentKey = (role = "attacker", canonical = false) => key(getSilverEnergySpentInput(role), canonical);
const oldValues = (total, role = "attacker", canonical = false) => ({ [key(getLegacySilverEnergyInput(role), canonical)]: total });
function session(attackerTotal = 50, defenderTotal = 70) {
  return { sides: { attacker: { spiritId: silver }, defender: { spiritId: silver } }, directions: {
    forward: { context: { ...oldValues(attackerTotal), ...oldValues(defenderTotal, "defender") } },
    reverse: { context: { ...oldValues(defenderTotal), ...oldValues(attackerTotal, "defender") } },
  } };
}

test.each([0, 10, 50, 200, "70"])("former total %s becomes an exact energy count with unchanged effect", total => {
  const source = { spiritId: silver, traitValues: oldValues(total, "attacker", true) };
  const before = structuredClone(source);
  const corrected = correctS5PreviewReferences(source);
  expect(corrected.traitValues).toEqual({ [spentKey("attacker", true)]: Number(total) / 10 });
  expect(source).toEqual(before);
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
  const effect = resolveS5PreviewTraitEffect({ ...trait, runtimeInputValues: corrected.traitValues }, "attacker", { skill: { category: "magical" } });
  expect(effect.attackLevelBonus).toBe(Number(total) / 10);
});

test.each([25, 75, 70.5, -10, "", null])("old total %s remains intact and blocked until explicitly replaced", total => {
  const source = { spiritId: silver, traitValues: oldValues(total, "attacker", true) };
  expect(correctS5PreviewReferences(source)).toBe(source);
  expect(correctS5PreviewReferences(session(total, total))).toEqual(session(total, total));
  const runtime = { ...trait, runtimeInputValues: source.traitValues };
  expect(getS5PreviewTraitEvaluation(runtime)).toMatchObject({ calcStatus: "pending" });
  expect(getS5PreviewTraitEvaluation(runtime, "attacker", { [spentKey()]: 0 }))
    .toMatchObject({ calcStatus: "ready", energySpent: 0 });
});

test("new explicit zero wins both old role forms and mirrors only the owner", () => {
  const source = session(75, 70);
  source.directions.forward.context[spentKey()] = 0;
  const corrected = correctS5PreviewReferences(source);
  expect(corrected.directions.forward.context).toEqual({ [spentKey()]: 0, [spentKey("defender")]: 7 });
  expect(corrected.directions.reverse.context).toEqual({ [spentKey()]: 7, [spentKey("defender")]: 0 });
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
  const other = { spiritId: "spirit_other", traitValues: oldValues(50, "attacker", true) };
  expect(correctS5PreviewReferences(other)).toBe(other);
});

test("acquired silver trait and unversioned aliases migrate without changing unrelated traits", () => {
  const original = { spiritId: "other", acquiredTraitValues: {
    [silverTrait]: { defenderTraitS5CurrentMagicalAttackBonus: 50 },
    other: oldValues(75, "attacker", true),
  } };
  const corrected = JSON.parse(correctS5PreviewStoredJson(JSON.stringify(original)));
  expect(corrected.acquiredTraitValues[silverTrait]).toEqual({ [spentKey("attacker", true)]: 5 });
  expect(corrected.acquiredTraitValues.other).toEqual(original.acquiredTraitValues.other);
  const state = session();
  state.directions.forward.context = { "attackerTrait.attackerTraitS5CurrentMagicalAttackBonus": 30 };
  expect(correctS5PreviewReferences(state).directions.forward.context[spentKey()]).toBe(3);
  expect(correctS5PreviewReferences({ spiritId: silver, traitValues: {} })).toEqual({ spiritId: silver, traitValues: {} });
});

test("preview session/history/team reads convert exact totals without rewriting stored bytes", () => {
  const source = { present: session(), past: [{ state: session(10) }], teams: [{ members: [{ spiritId: silver, traitValues: oldValues(50, "attacker", true) }] }] };
  const storageKey = "rock-calculator.servers.cn.calculator.session.v1";
  const previewKey = "rock-calculator.preview.s5." + storageKey;
  const raw = JSON.stringify(source);
  const entries = new Map([[storageKey, raw], [previewKey, raw]]);
  const storage = { getItem: item => entries.get(item) ?? null };
  const corrected = JSON.parse(createPreviewStorage(storage).getItem(storageKey));
  expect(corrected.present.directions.forward.context[spentKey()]).toBe(5);
  expect(corrected.past[0].state.directions.forward.context[spentKey()]).toBe(1);
  expect(corrected.teams[0].members[0].traitValues[spentKey("attacker", true)]).toBe(5);
  expect(entries.get(storageKey)).toBe(raw);
  expect(entries.get(previewKey)).toBe(raw);
});

test("unrepresentable saved percent survives materialization and remains pending until a new count is entered", () => {
  const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const initialState = createInitialState(snapshot);
  initialState.sides.defender.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "迪莫").id;
  const bite = snapshot.skills.find(skill => skill.name === "撕咬").id;
  const source = { ...initialState.sides.attacker, spiritId: silver,
    skills: { single: bite, four: [bite, null, null, null] }, traitValues: oldValues(70.5, "attacker", true),
  };
  const corrected = correctS5PreviewReferences(source);
  const saved = { ...corrected, traitValues: extractTraitValues(corrected, snapshot) };
  expect(saved.traitValues).toEqual(source.traitValues);
  let state = applyConfiguration(initialState, saved, { initialState, remember: false, side: "attacker", snapshot, source: "personal" }).state;
  const result = current => buildBalanceComparison({ snapshot, state: current }).afterView.calculation.forward.selectedResult;
  expect(result(state)).toMatchObject({ status: "unsupported", totalDamage: null });
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    expect(state.directions[direction].context).toEqual(expect.objectContaining(oldValues(70.5, role)));
    expect(state.directions[direction].context).not.toHaveProperty(spentKey(role));
  }
  state = updateMirroredTraitContext(state, { direction: "forward", key: spentKey(), value: 0 }).state;
  expect(result(state).status).toBe("exact");
  expect(state.directions.reverse.context[spentKey("defender")]).toBe(0);
});

test("energy count contributes magical stages only, without clamping away manual reductions", () => {
  expect(getSilverEnergySpentInput()).toMatchObject({ label: "累计消耗能量", suffix: "点", defaultValue: 0, min: 0 });
  for (const spent of [0, 1, 2, 100]) {
    const context = { [spentKey()]: spent };
    expect(getS5PreviewTraitEvaluation(trait, "attacker", context)).toMatchObject({ energySpent: spent, summary: `累计消耗 ${spent} 点能量 · 魔攻 +${spent * 10}%` });
    expect(resolveS5PreviewTraitEffect(trait, "attacker", { context, skill: { category: "magical" } }).attackLevelBonus).toBe(spent);
    expect(resolveS5PreviewTraitEffect(trait, "attacker", { context, skill: { category: "physical" } }).attackLevelBonus).toBe(0);
  }
});
