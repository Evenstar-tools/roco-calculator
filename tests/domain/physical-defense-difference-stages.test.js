import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buildCalculatorViewModel, getTraitView } from "../../src/domain/calculator-view-model.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";
import { updateMirroredTraitContext } from "../../src/state/calculator-session.js";

const preview = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
function fixture(side, mode, legacy = false) {
  const snapshot = legacy ? structuredClone(preview) : preview;
  const owner = snapshot.spirits.find(spirit => spirit.id === "spirit_preview_s5_egg-wrap");
  if (legacy) owner.traitIds = [snapshot.traits.find(trait => trait.name === "囤积").id];
  let state = createInitialState(snapshot);
  state.mode = mode;
  const skillId = snapshot.skills.find(skill => skill.name === "鸣沙陷阱").id;
  for (const [key, configured] of Object.entries(state.sides)) {
    configured.spiritId = key === side ? owner.id : snapshot.spirits.find(spirit => spirit.fullName === "迪莫").id;
    configured.ignoreTraits = key !== side;
    configured.skills = { single: key === side ? skillId : null, four: [key === side ? skillId : null, null, null, null] };
  }
  const direction = side === "attacker" ? "forward" : "reverse";
  const incoming = direction === "forward" ? "reverse" : "forward";
  const control = getTraitView(snapshot, owner).inputs.find(input => legacy ? input.label === "当前能量" : input.contextKey.endsWith("EggTriggered"));
  state = updateMirroredTraitContext(state, { direction, key: control.id, value: legacy ? 5 : true }).state;
  return { snapshot, state, side, direction, incoming, skillId };
}
function result(setup) {
  const view = buildCalculatorViewModel({ snapshot: setup.snapshot, state: setup.state, activeDirection: setup.direction });
  const calculated = view.calculation[setup.direction].results[0];
  return { view, calculated, step: calculated.formulaSteps.find(item => item.label === "物防差威力") };
}

test.each([["attacker", "single"], ["attacker", "four"], ["defender", "single"], ["defender", "four"]])(
  "%s %s Sand Trap uses the owner's incoming defense stage together with the trait",
  (side, mode) => {
    const setup = fixture(side, mode);
    const damages = [];
    for (const [stage, defense, power] of [[-5, 203, 60], [0, 304, 140], [5, 406, 170], [99, 2212, 200]]) {
      setup.state.directions[setup.incoming].overrides.defenseLevelStage = stage;
      const actual = result(setup);
      expect(actual.view.sides[side].finalPanelStats.physicalDefense).toBe(defense);
      expect(actual.step).toMatchObject({ input: { attacker: defense, defender: 209 }, after: power });
      expect(actual.calculated.resolvedPower).toBe(power);
      damages.push(actual.calculated.totalDamage);
    }
    expect(damages[0]).toBeLessThan(damages[1]);
    expect(damages[1]).toBeLessThan(damages[2]);
  },
);

test.each(["attacker", "defender"])("%s Sand Trap also uses the target's current-direction defense stage", side => {
  const setup = fixture(side, "four");
  for (const [stage, defense, power] of [[-5, 139, 160], [0, 209, 140], [5, 313, 60]]) {
    setup.state.directions[setup.direction].overrides.defenseLevelStage = stage;
    const actual = result(setup);
    expect(actual.step).toMatchObject({ input: { attacker: 304, defender: defense }, after: power });
    expect(actual.calculated.resolvedPower).toBe(power);
  }
});

test("a skill's local target-defense override keeps priority over the direction value", () => {
  const setup = fixture("attacker", "four");
  setup.state.directions.forward.overrides.defenseLevelStage = -5;
  setup.state.sides.attacker.skills.four[0] = { skillId: setup.skillId, overrides: { defenseLevelStage: 5 } };
  expect(result(setup).step).toMatchObject({ input: { attacker: 304, defender: 313 }, after: 60 });
});

test("the legacy dual-defense trait and legacy direction-stage field follow the same merged formula", () => {
  const setup = fixture("attacker", "single", true);
  delete setup.state.directions.reverse.overrides.defenseLevelStage;
  setup.state.directions.reverse.defenseLevelStage = -5;
  expect(result(setup).step).toMatchObject({ input: { attacker: 203, defender: 209 }, after: 60 });
  setup.state.directions.reverse.overrides.defenseLevelStage = 5;
  expect(result(setup).step).toMatchObject({ input: { attacker: 406, defender: 209 }, after: 170 });
});
