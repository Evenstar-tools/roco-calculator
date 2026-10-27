import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import {
  getGoldChargeCountInput, getLegacyGoldChargeInputs,
} from "../../src/features/s5-preview/charge-input-migration.js";
import {
  correctS5PreviewReferences, correctS5PreviewStoredJson,
} from "../../src/features/s5-preview/reference-corrections.js";
import { createPreviewStorage } from "../../src/runtime/preview-storage.js";
import { createInitialState } from "../../src/state/defaults.js";
import { applyConfiguration, updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { extractTraitValues } from "../../src/state/trait-values.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";

const gold = "spirit_preview_s5_gold-vein-dragon";
const goldTrait = "trait_preview_s5_gold-vein-dragon";
const scissor = "spirit_preview_s5_little-scissor";
const scissorTrait = "trait_preview_s5_little-scissor";
const countKey = (role = "attacker", canonical = false) => {
  const control = getGoldChargeCountInput(role);
  return canonical ? canonicalTraitControlKey(control) : control.id;
};
function oldValues(active, bonus, role = "attacker", canonical = false) {
  const controls = getLegacyGoldChargeInputs(role);
  return Object.fromEntries(controls.flatMap((control, index) => {
    const value = index === 0 ? active : bonus;
    return value === undefined ? [] : [[canonical ? canonicalTraitControlKey(control) : control.id, value]];
  }));
}
function session(attackerBonus = 100, defenderSpirit = scissor, defenderBonus = 70) {
  return {
    sides: { attacker: { spiritId: gold }, defender: { spiritId: defenderSpirit } },
    directions: {
      forward: { context: { ...oldValues(true, attackerBonus), ...oldValues(true, defenderBonus, "defender") } },
      reverse: { context: { ...oldValues(true, defenderBonus), ...oldValues(true, attackerBonus, "defender") } },
    },
  };
}

test.each([[true, 50, 1], [true, undefined, 1], [true, 100, 2], [true, 0, 0], [false, 100, 0]])(
  "old active=%s and total=%s retain their effect as %s charges", (active, bonus, expected) => {
    const source = { spiritId: gold, traitValues: oldValues(active, bonus, "attacker", true) };
    const before = structuredClone(source);
    const corrected = correctS5PreviewReferences(source);
    expect(corrected.traitValues).toEqual({ [countKey("attacker", true)]: expected });
    expect(source).toEqual(before);
    expect(correctS5PreviewReferences(corrected)).toBe(corrected);
  },
);

test.each([25, 70, 90, 100.5, -50, "", null])("unrepresentable old total %s is preserved without guessing a count", bonus => {
  const source = { spiritId: gold, traitValues: oldValues(true, bonus, "attacker", true) };
  expect(correctS5PreviewReferences(source)).toBe(source);
  const state = session(bonus);
  expect(correctS5PreviewReferences(state)).toBe(state);
});

test("new explicit zero wins stale old fields in canonical and role forms", () => {
  for (const canonical of [false, true]) {
    const source = { spiritId: gold, traitValues: {
      ...oldValues(true, 70, "attacker", canonical), [countKey("defender", canonical)]: 0,
    } };
    const corrected = correctS5PreviewReferences(source);
    expect(corrected.traitValues).toEqual({ [countKey("attacker", true)]: 0 });
  }
  const source = session(70);
  source.directions.forward.context[countKey()] = 0;
  const corrected = correctS5PreviewReferences(source);
  expect(corrected.directions.forward.context[countKey()]).toBe(0);
  expect(corrected.directions.reverse.context[countKey("defender")]).toBe(0);
});

test("only the gold owner migrates its outgoing and incoming controls; scissor fields remain intact", () => {
  const source = session();
  const before = structuredClone(source);
  const corrected = correctS5PreviewReferences(source);
  expect(corrected.directions.forward.context).toEqual({ ...oldValues(true, 70, "defender"), [countKey()]: 2 });
  expect(corrected.directions.reverse.context).toEqual({ ...oldValues(true, 70), [countKey("defender")]: 2 });
  expect(source).toEqual(before);
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
  const other = { spiritId: scissor, traitValues: oldValues(true, 100, "attacker", true) };
  expect(correctS5PreviewReferences(other)).toBe(other);
  expect(correctS5PreviewReferences({ ...other, spiritId: gold + "_other" }).traitValues).toBe(other.traitValues);
});

test("both gold owners keep independent counts and new values override stale mirrors", () => {
  const source = session(100, gold, 150);
  source.directions.forward.context[countKey()] = 0;
  const corrected = correctS5PreviewReferences(source);
  expect(corrected.directions.forward.context).toEqual({ [countKey()]: 0, [countKey("defender")]: 3 });
  expect(corrected.directions.reverse.context).toEqual({ [countKey()]: 3, [countKey("defender")]: 0 });
});

test("acquired gold trait values migrate by exact trait id without touching acquired or native scissor", () => {
  const scissorValues = oldValues(true, 100, "attacker", true);
  const source = { spiritId: scissor, traitValues: scissorValues, acquiredTraitValues: {
    [goldTrait]: oldValues(true, 150, "defender", true), [scissorTrait]: scissorValues,
  } };
  const corrected = correctS5PreviewReferences(source);
  expect(corrected.traitValues).toBe(scissorValues);
  expect(corrected.acquiredTraitValues[scissorTrait]).toBe(scissorValues);
  expect(corrected.acquiredTraitValues[goldTrait]).toEqual({ [countKey("attacker", true)]: 3 });
  expect(source.acquiredTraitValues[goldTrait]).toEqual(oldValues(true, 150, "defender", true));
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
});

test("legacy unversioned context aliases migrate and absence of old inputs adds no defaults", () => {
  const state = session();
  state.directions.forward.context = { attackerTraitS5AttackBuffActive: true, "attackerTrait.attackerTraitS5CurrentAttackBonus": 150 };
  const corrected = correctS5PreviewReferences(state);
  expect(corrected.directions.forward.context).toEqual({ [countKey()]: 3 });
  expect(correctS5PreviewReferences({ spiritId: gold, traitValues: {} })).toEqual({ spiritId: gold, traitValues: {} });
});

test("history, teams and favorites migrate on preview reads while raw and formal storage stay intact", () => {
  const config = { spiritId: gold, traitValues: oldValues(true, 100, "attacker", true) };
  const source = { present: session(), past: [{ state: session(50) }], teams: [{ members: [config] }], favorites: [config] };
  const key = "rock-calculator.servers.cn.calculator.session.v1";
  const previewKey = "rock-calculator.preview.s5." + key;
  const raw = JSON.stringify(source);
  const entries = new Map([[key, raw], [previewKey, raw]]);
  const storage = { getItem: item => entries.get(item) ?? null };
  const corrected = JSON.parse(createPreviewStorage(storage).getItem(key));
  expect(corrected.present.directions.forward.context[countKey()]).toBe(2);
  expect(corrected.past[0].state.directions.forward.context[countKey()]).toBe(1);
  expect(corrected.teams[0].members[0].traitValues[countKey("attacker", true)]).toBe(2);
  expect(corrected.favorites[0].traitValues[countKey("attacker", true)]).toBe(2);
  expect(entries.get(key)).toBe(raw);
  expect(entries.get(previewKey)).toBe(raw);
  expect(correctS5PreviewStoredJson(JSON.stringify(corrected))).toBe(JSON.stringify(corrected));
});

test("acquired-only storage passes the preview correction filter, while unknown formats remain identical", () => {
  const raw = JSON.stringify({ spiritId: scissor, acquiredTraitValues: { [goldTrait]: oldValues(true, 50, "attacker", true) } });
  expect(JSON.parse(correctS5PreviewStoredJson(raw)).acquiredTraitValues[goldTrait]).toEqual({ [countKey("attacker", true)]: 1 });
  for (const input of [null, "dark", "{broken", '{"spiritId":"other"}']) expect(correctS5PreviewStoredJson(input)).toBe(input);
});

test("applying an old70 percent personal configuration stays pending until an explicit charge count is entered", () => {
  const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const initialState = createInitialState(snapshot);
  initialState.sides.defender.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "迪莫").id;
  const bite = snapshot.skills.find(skill => skill.name === "撕咬").id;
  const source = { ...initialState.sides.attacker, spiritId: gold,
    skills: { single: bite, four: [bite, null, null, null] },
    traitValues: oldValues(true, 70, "attacker", true),
  };
  const corrected = correctS5PreviewReferences(source);
  const saved = { ...corrected, traitValues: extractTraitValues(corrected, snapshot) };
  expect(saved.traitValues).toEqual(source.traitValues);
  let state = applyConfiguration(initialState, saved, {
    initialState, remember: false, side: "attacker", snapshot, source: "personal",
  }).state;
  const result = current => buildBalanceComparison({ snapshot, state: current }).afterView.calculation.forward.selectedResult;
  expect(result(state)).toMatchObject({ status: "unsupported", totalDamage: null });
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    expect(state.directions[direction].context).toEqual(expect.objectContaining(oldValues(true, 70, role)));
    expect(state.directions[direction].context).not.toHaveProperty(countKey(role));
  }
  state = updateMirroredTraitContext(state, { direction: "forward", key: countKey(), value: 0 }).state;
  expect(result(state).status).toBe("exact");
  expect(result(state).totalDamage).toBeGreaterThan(0);
  expect(state.directions.reverse.context[countKey("defender")]).toBe(0);
});
