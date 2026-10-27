import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { getEffectiveTraits } from "../../src/domain/effective-traits.js";
import { createMoonMemoryTraitSearchIndex, searchMoonMemoryTraitOptions } from "../../src/domain/moon-memory-trait-options.js";
import { getS5PreviewTraitInputs, getS5PreviewTraitEvaluation } from "../../src/domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { applyS5EnergyUse, prepareS5EnergyUse } from "../../src/features/s5-preview/energy-use.js";
import { applyS5PreviewStatTurnEnd } from "../../src/features/s5-preview/turn-end.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";

const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const wolf = snapshot.spirits.find(spirit => spirit.fullName === "诅咒狼灵");
const families = [
  ["minggulong", "little-ming-dragon", "恶龙的奢望", ["小冥龙", "冥古龙"]],
  ["underground-silver-dragon", "silver-chain", "银头寸", ["地银链", "地底银鳞", "地绡银龙"]],
  ["gold-vein-dragon", "sinking-gold-beast", "储备金", ["沉金兽", "龙头金", "龙嵴金脉"]],
];
const traitFor = key => snapshot.traits.find(trait => trait.id === `trait_preview_s5_${key}`);
function duplicateState(adult, child) {
  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker.spiritId = wolf.id;
  state.sides.attacker.skills = { single: null, four: ["撕咬", "水波术"].map(name => snapshot.skills.find(skill => skill.name === name).id).concat([null, null]) };
  state.sides.attacker.acquiredTraitIds = [traitFor(child).id, traitFor(adult).id];
  for (const [key, count] of [[child, 2], [adult, 9]]) {
    const trait = traitFor(key);
    const controls = getS5PreviewTraitInputs(trait);
    state.sides.attacker.acquiredTraitValues[trait.id] = {
      [canonicalTraitControlKey(controls[0])]: count,
      [canonicalTraitControlKey(controls.find(control => control.hidden))]: 0,
    };
  }
  return state;
}
const effective = state => getEffectiveTraits(snapshot, { ...state.sides.attacker, spirit: wolf });
const model = state => buildBalanceComparison({ snapshot, state }).afterView;

test("three official families expose one adult borrowing option while every form name remains searchable", () => {
  const index = createMoonMemoryTraitSearchIndex(snapshot);
  for (const [adult, _child, name, formNames] of families) {
    for (const query of [name, ...formNames]) {
      const options = searchMoonMemoryTraitOptions(index, query);
      expect(options).toHaveLength(1);
      expect(options[0].traitId).toBe(traitFor(adult).id);
      expect(options[0].equivalentTraitIds).toHaveLength(formNames.length);
    }
    expect(snapshot.spirits.filter(spirit => formNames.includes(spirit.fullName))
      .map(spirit => spirit.traitIds[0])).toHaveLength(formNames.length);
  }
});

test("historical duplicate silver IDs retain their own values but use and settle only the first effective instance", () => {
  let state = duplicateState("underground-silver-dragon", "silver-chain");
  const before = structuredClone(state);
  expect(effective(state).filter(trait => trait.previewIdentity?.mechanicKey === "underground-silver-dragon"))
    .toMatchObject([{ id: traitFor("silver-chain").id, runtimeInputValues: before.sides.attacker.acquiredTraitValues[traitFor("silver-chain").id] }]);
  expect(state).toEqual(before);
  const base = model(state).sides.attacker;
  state = applyS5EnergyUse(state, prepareS5EnergyUse(state, { snapshot, side: "attacker", result: { skillCost: 3 } }));
  expect(model(state).sides.attacker.finalPanelStats).toEqual(base.finalPanelStats);
  const trait = effective(state).find(trait => trait.previewIdentity?.mechanicKey === "underground-silver-dragon");
  expect(getS5PreviewTraitEvaluation(trait)).toMatchObject({ totalCount: 5, settledCount: 0, pendingCount: 5 });
  state = applyS5PreviewStatTurnEnd(state, { snapshot, side: "attacker" }).state;
  const after = model(state).sides.attacker;
  expect(after.finalPanelStats.magicalAttack).toBe(Math.floor(base.panelStats.magicalAttack * 1.5));
  expect(after.finalPanelStats.physicalAttack).toBe(base.panelStats.physicalAttack);
  expect(state.sides.attacker.acquiredTraitValues[traitFor("underground-silver-dragon").id])
    .toEqual(before.sides.attacker.acquiredTraitValues[traitFor("underground-silver-dragon").id]);
  expect(state.sides.attacker.acquiredTraitIds).toEqual(before.sides.attacker.acquiredTraitIds);
  expect(applyS5PreviewStatTurnEnd(state, { snapshot, side: "attacker" }).state).toBe(state);
});

test("duplicate gold IDs apply one physical-only bonus at turn end and preserve the dormant stored instance", () => {
  let state = duplicateState("gold-vein-dragon", "sinking-gold-beast");
  const before = structuredClone(state);
  const base = model(state).sides.attacker;
  state = applyS5PreviewStatTurnEnd(state, { snapshot, side: "attacker" }).state;
  const after = model(state).sides.attacker;
  expect(after.finalPanelStats.physicalAttack).toBe(base.panelStats.physicalAttack * 2);
  expect(after.finalPanelStats.magicalAttack).toBe(base.panelStats.magicalAttack);
  expect(effective(state).filter(trait => trait.previewIdentity?.mechanicKey === "gold-vein-dragon")).toHaveLength(1);
  expect(state.sides.attacker.acquiredTraitValues[traitFor("gold-vein-dragon").id])
    .toEqual(before.sides.attacker.acquiredTraitValues[traitFor("gold-vein-dragon").id]);
});

test("native family traits take priority over an acquired form without merging unrelated same-name traits", () => {
  const silver = traitFor("underground-silver-dragon");
  const child = traitFor("silver-chain");
  const moonId = wolf.traitIds.find(id => snapshot.traits.find(trait => trait.id === id)?.name === "铭记于月亮");
  const unrelated = { id: "unrelated-silver", name: silver.name };
  const otherPreview = { ...silver, id: "other-season-silver", previewIdentity: { catalogId: "s6-fixture", mechanicKey: "underground-silver-dragon" } };
  const local = { ...snapshot, traits: [...snapshot.traits, unrelated, otherPreview] };
  const traits = getEffectiveTraits(local, { spirit: { traitIds: [moonId, silver.id] },
    acquiredTraitIds: [child.id, unrelated.id, otherPreview.id], acquiredTraitValues: { [child.id]: { original: 7 } } });
  expect(traits.filter(trait => trait.previewIdentity?.catalogId === silver.previewIdentity.catalogId)).toEqual([silver]);
  expect(traits.map(trait => trait.id)).toContain(unrelated.id);
  expect(traits.map(trait => trait.id)).toContain(otherPreview.id);
});
