import { expect, test } from "vitest";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import { getS5PreviewTraitInputs, getS5PreviewTraitEvaluation } from "../../src/domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { extractTraitValues, materializeTraitContext } from "../../src/state/trait-values.js";
import { getS5PreviewTraitPresentation } from "../../src/features/s5-preview/trait-presentation.js";

const expectedDefender = {
  minggulong: "full", abu: "full", "boss-abu": "full", "super-abu": "full", "egg-wrap": "full", diliutun: "hidden",
  "boss-ice-bruce": "speed", "underground-silver-dragon": "hidden", "gold-vein-dragon": "hidden",
  "boss-glass-jellyfish": "hidden", jingyu: "hidden", doulie: "hidden", "watermelon-bug": "hidden",
  "lele-shark": "hidden", "crab-coconut": "hidden", "little-scissor": "hidden", "lily-of-valley": "hidden",
};
function fixture(key, role = "attacker") {
  const trait = { id: "trait-" + key, name: "前瞻特性", previewIdentity: { catalogId: "s5-presentation-test", mechanicKey: key } };
  const spirit = { id: "spirit-" + key, traitIds: [trait.id] };
  const snapshot = { traits: [trait], spirits: [spirit] };
  const view = getTraitView(snapshot, spirit, role);
  return { trait, spirit, snapshot, view };
}

test("all current candidates have an explicit presentation expectation", () => {
  for (const entry of catalog.entries) {
    expect(Object.hasOwn(expectedDefender, entry.mechanicKey)).toBe(true);
    const { view } = fixture(entry.mechanicKey, "defender");
    expect(getS5PreviewTraitPresentation(view, "defender").visible)
      .toBe(expectedDefender[entry.mechanicKey] !== "hidden");
  }
});

test.each(Object.entries(expectedDefender))("%s uses its relevant role while owner editing keeps all inputs", (key, defenderScope) => {
  for (const role of ["attacker", "defender"]) {
    const { trait, view } = fixture(key, role);
    const before = structuredClone(view);
    Object.freeze(view.inputs);
    const projected = getS5PreviewTraitPresentation(view, role);
    const scope = role === "attacker" ? "full" : defenderScope;
    expect(projected.visible).toBe(scope !== "hidden");
    expect(projected.summaryScope).toBe(scope === "speed" ? "speed" : "full");
    if (scope === "hidden") expect(projected.inputs).toEqual([]);
    else if (scope === "speed") expect(projected.inputs.map(input => input.contextKey)).toEqual(["defenderTraitS5OpponentTotalCost"]);
    else expect(projected.inputs).toBe(view.inputs);
    expect(getS5PreviewTraitPresentation(view, role, { owner: true })).toEqual({ visible: true, inputs: view.inputs, summaryScope: "full" });
    expect(view).toEqual(before);
    expect(getS5PreviewTraitInputs(trait, role)).toEqual(before.inputs);
  }
});

test("default attack role and unknown S5 mechanics keep full controls and pending evaluation", () => {
  const { view, trait } = fixture("future-unconfirmed");
  expect(getS5PreviewTraitPresentation(view)).toEqual({ visible: true, inputs: view.inputs, summaryScope: "full" });
  expect(getS5PreviewTraitPresentation(view, "defender")).toEqual({ visible: true, inputs: view.inputs, summaryScope: "full" });
  expect(getS5PreviewTraitEvaluation(trait)).toMatchObject({ calcStatus: "pending" });
});

test.each([null, {}, { previewTraitEntity: { name: "旧特性" } }, { previewTraitEntity: { previewIdentity: { catalogId: "s4-old", mechanicKey: "gold-vein-dragon" } } }])(
  "non-S5 trait %s delegates to the existing presentation", view => {
    expect(getS5PreviewTraitPresentation(view)).toBeNull();
    expect(getS5PreviewTraitPresentation(view, "defender", { owner: true })).toBeNull();
  },
);

test.each(["gold-vein-dragon", "underground-silver-dragon", "boss-ice-bruce"])(
  "%s display filtering never removes hidden values from configuration extraction or materialization", key => {
    const { spirit, snapshot, view } = fixture(key, "defender");
    const valueFor = input => input.type === "boolean" ? false : 5;
    const traitValues = Object.fromEntries(view.inputs.map(input => [canonicalTraitControlKey(input), valueFor(input)]));
    const config = { spiritId: spirit.id, traitValues };
    const before = extractTraitValues(config, snapshot);
    const materialized = materializeTraitContext(before, snapshot, spirit.id, "defender");
    getS5PreviewTraitPresentation(view, "defender");
    expect(extractTraitValues(config, snapshot)).toEqual(before);
    expect(materializeTraitContext(before, snapshot, spirit.id, "defender")).toEqual(materialized);
    for (const input of view.inputs) {
      expect(before[canonicalTraitControlKey(input)]).toBe(valueFor(input));
      expect(materialized[input.id]).toBe(valueFor(input));
    }
  },
);
