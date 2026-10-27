import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buildCalculatorViewModel, getTraitView } from "../../src/domain/calculator-view-model.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { getS5PreviewTurnEndInputs } from "../../src/features/s5-preview/turn-end-inputs.js";
import { createInitialState } from "../../src/state/defaults.js";
import { updateMirroredTraitContext } from "../../src/state/calculator-session.js";

const preview = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
function fixture(mode, legacyTraitName) {
  const snapshot = structuredClone(preview);
  // This tests stat-source isolation, not evolving official species values.
  for (const key of ["underground-silver-dragon", "gold-vein-dragon", "egg-wrap"]) {
    snapshot.spirits.find(entry => entry.id === `spirit_preview_s5_${key}`).raceStats = {
      hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100,
      magicalDefense: 100, speed: 100, total: 600,
    };
  }
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.sides.attacker.spiritId = "spirit_preview_s5_underground-silver-dragon";
  state.sides.defender.spiritId = "spirit_preview_s5_egg-wrap";
  for (const side of Object.values(state.sides)) {
    side.skills = { single: null, four: [null, null, null, null] };
    if (legacyTraitName) {
      const spirit = snapshot.spirits.find(entry => entry.id === side.spiritId);
      spirit.traitIds = [snapshot.traits.find(entry => entry.name === legacyTraitName).id];
      spirit.traitName = legacyTraitName;
    }
  }
  return { snapshot, state };
}
function setInput(snapshot, state, side, match, value) {
  const spirit = snapshot.spirits.find(entry => entry.id === state.sides[side].spiritId);
  const control = getTraitView(snapshot, spirit).inputs.find(match);
  expect(control).toBeTruthy();
  return updateMirroredTraitContext(state, {
    direction: side === "attacker" ? "forward" : "reverse", key: control.id, value,
  }).state;
}
function choose(snapshot, state, name) {
  const id = snapshot.skills.find(entry => entry.name === name).id;
  return { ...state, sides: { ...state.sides, attacker: { ...state.sides.attacker,
    skills: { single: id, four: [id, null, null, null] },
  } } };
}
const view = (snapshot, state) => buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
const setSettled = (state, mechanicKey, value) => updateMirroredTraitContext(state, {
  direction: "forward", key: getS5PreviewTurnEndInputs(mechanicKey)[0].id, value,
}).state;

test.each(["single", "four"])("%s status and defense selections retain silver's magical-only gain and target's dual defenses", mode => {
  const setup = fixture(mode);
  let { state } = setup;
  const { snapshot } = setup;
  state = setInput(snapshot, state, "attacker", input => input.contextKey.endsWith("EnergySpent"), 4);
  state = setInput(snapshot, state, "defender", input => input.contextKey.endsWith("EggTriggered"), true);
  state = setSettled(state, "underground-silver-dragon", 0);
  expect(view(snapshot, choose(snapshot, state, "防御")).sides.attacker.finalPanelStats)
    .toMatchObject({ physicalAttack: 203, magicalAttack: 203 });
  state = setSettled(state, "underground-silver-dragon", 4);
  for (const name of ["防御", "力量增效", "猛烈撞击", "光球"]) {
    const current = view(snapshot, choose(snapshot, state, name));
    expect(current.sides.attacker.finalPanelStats, name).toMatchObject({ physicalAttack: 203, magicalAttack: 284 });
    expect(current.sides.defender.finalPanelStats, name).toMatchObject({ physicalDefense: 304, magicalDefense: 304 });
  }
});

test.each([
  ["猫精灵的礼物", "完整选择次数", 2, { physicalAttack: 365, magicalAttack: 203 }, { physicalDefense: 203, magicalDefense: 203 }],
  ["搜刮", "敌方聚能或换宠次数", 2, { physicalAttack: 203, magicalAttack: 284 }, { physicalDefense: 203, magicalDefense: 203 }],
  ["合拍", "累计相同项数", 2, { physicalAttack: 243, magicalAttack: 203 }, { physicalDefense: 243, magicalDefense: 203 }],
  ["扫荡", "敌方聚能或换宠次数", 2, { physicalAttack: 203, magicalAttack: 284 }, { physicalDefense: 203, magicalDefense: 243 }],
])("%s keeps its physical/magical stat restriction when a non-damage skill is selected", (trait, label, amount, attack, defense) => {
  for (const mode of ["single", "four"]) {
    const setup = fixture(mode, trait);
    let { state } = setup;
    const { snapshot } = setup;
    for (const side of ["attacker", "defender"]) {
      state = setInput(snapshot, state, side, input => input.label === label, amount);
    }
    for (const name of ["防御", "力量增效", "猛烈撞击", "光球"]) {
      const current = view(snapshot, choose(snapshot, state, name));
      expect(current.sides.attacker.finalPanelStats, `${mode} ${name}`).toMatchObject(attack);
      expect(current.sides.defender.finalPanelStats, `${mode} ${name}`).toMatchObject(defense);
    }
  }
});

test("settled physical-only attack and dual defense buffs retain manual stage merging on non-damage skills", () => {
  const { snapshot, state: initial } = fixture("four");
  initial.sides.attacker.spiritId = "spirit_preview_s5_gold-vein-dragon";
  let state = setInput(snapshot, initial, "attacker", input => input.contextKey.endsWith("ChargeCount"), 2);
  state = setInput(snapshot, state, "defender", input => input.contextKey.endsWith("EggTriggered"), true);
  state.directions.forward.overrides.attackLevelStage = -3;
  state.directions.forward.overrides.defenseLevelStage = -2;
  state = setSettled(state, "gold-vein-dragon", 0);
  expect(view(snapshot, choose(snapshot, state, "防御")).sides.attacker.finalPanelStats)
    .toMatchObject({ physicalAttack: 156, magicalAttack: 156 });
  state = setSettled(state, "gold-vein-dragon", 2);
  const current = view(snapshot, choose(snapshot, state, "防御"));
  expect(current.sides.attacker.finalPanelStats).toMatchObject({ physicalAttack: 345, magicalAttack: 156 });
  expect(current.sides.defender.finalPanelStats).toMatchObject({ physicalDefense: 263, magicalDefense: 263 });
});
