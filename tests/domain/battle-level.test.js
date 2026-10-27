import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { resolveS5PreviewBattleLevel, withS5PreviewBattleLevels } from "../../src/domain/battle-level.js";
import { getS5PreviewTraitEvaluation, getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";

const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const levelKeys = ["minggulong", "abu", "super-abu", "boss-abu"];
const spiritFor = (key) => snapshot.spirits.find(spirit => spirit.id === `spirit_preview_s5_${key}`);
const traitFor = (key) => snapshot.traits.find(trait => spiritFor(key).traitIds.includes(trait.id));
const ordinary = snapshot.spirits.find(spirit => spirit.fullName === "迪莫");
const cachedPanel = { hp: 999, physicalAttack: 888, magicalAttack: 777, physicalDefense: 666, magicalDefense: 555, speed: 444 };

function fixture(attackerKey = "minggulong", defenderKey) {
  const state = createInitialState(snapshot);
  state.sides.attacker.spiritId = spiritFor(attackerKey).id;
  state.sides.defender.spiritId = defenderKey ? spiritFor(defenderKey).id : ordinary.id;
  return state;
}

function setLevel(state, side, key, values, role = "attacker") {
  const outgoing = side === "attacker" ? "forward" : "reverse";
  const direction = role === "attacker" ? outgoing : outgoing === "forward" ? "reverse" : "forward";
  for (const control of getS5PreviewTraitInputs(traitFor(key), role)) {
    const suffix = control.contextKey.replace(/^.*TraitS5/u, "");
    if (Object.hasOwn(values, suffix)) state.directions[direction].context[control.id] = values[suffix];
  }
}

describe("trusted S5 owner battle levels", () => {
  test.each(levelKeys)("%s defaults are available from either owning side without side.level", key => {
    const expected = key === "minggulong" ? 99 : 60;
    const state = fixture(key, key);
    expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(expected);
    expect(resolveS5PreviewBattleLevel(snapshot, state, "defender")).toBe(expected);
    expect(state.sides.attacker).not.toHaveProperty("level");
    expect(state.sides.defender).not.toHaveProperty("level");
  });

  test("each owner reads its outgoing level and count, without borrowing mirrored/opposite values", () => {
    const state = fixture("minggulong", "super-abu");
    setLevel(state, "attacker", "minggulong", { CurrentLevel: 99, LevelEventCount: 2 });
    setLevel(state, "defender", "super-abu", { CurrentLevel: 64, LevelEventCount: 3 });
    setLevel(state, "attacker", "minggulong", { CurrentLevel: 40, LevelEventCount: 0 }, "defender");
    setLevel(state, "defender", "super-abu", { CurrentLevel: 90, LevelEventCount: 0 }, "defender");
    expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(79);
    expect(resolveS5PreviewBattleLevel(snapshot, state, "defender")).toBe(70);
    const projected = withS5PreviewBattleLevels(snapshot, state);
    expect(projected.sides.attacker.level).toBe(79);
    expect(projected.sides.defender.level).toBe(70);
  });

  test("the three Abu identities apply confirmed increments with the known level99 cap", () => {
    for (const key of levelKeys.filter(key => key !== "minggulong")) {
      const state = fixture(key);
      setLevel(state, "attacker", key, { CurrentLevel: 98, LevelEventCount: 2 });
      expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(99);
      setLevel(state, "attacker", key, { CurrentLevel: 58, LevelEventCount: 1 });
      expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(60);
    }
  });

  test("Minggulong never invents a minimum level; the safe resolver fallback retains evaluation blocking", () => {
    const state = fixture();
    setLevel(state, "attacker", "minggulong", { LevelEventCount: 10 });
    const evaluation = getS5PreviewTraitEvaluation(traitFor("minggulong"), "attacker", state.directions.forward.context);
    expect(evaluation).toMatchObject({ currentLevel: -1, calcStatus: "pending", blockingReason: expect.stringContaining("下降下限") });
    expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(60);
    expect(withS5PreviewBattleLevels(snapshot, state).sides.attacker.level).toBe(60);
    expect(state.directions.forward.context).toEqual(expect.objectContaining(
      Object.fromEntries(getS5PreviewTraitInputs(traitFor("minggulong"))
        .filter(control => control.contextKey.endsWith("LevelEventCount")).map(control => [control.id, 10])),
    ));
  });

  test("ordinary context, side.level, explicit/borrowed/acquired S5 traits cannot opt in a different identity", () => {
    const state = fixture();
    state.sides.attacker = { ...state.sides.attacker, spiritId: ordinary.id, level: 99,
      traits: [traitFor("abu")], traitIds: [traitFor("abu").id], acquiredTraitIds: [traitFor("abu").id] };
    state.directions.forward.context.level = 99;
    state.directions.forward.context.attackerLevel = 99;
    setLevel(state, "attacker", "abu", { CurrentLevel: 90, LevelEventCount: 1 });
    expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(60);
    expect(withS5PreviewBattleLevels(snapshot, state).sides.attacker.level).toBe(60);
    state.sides.attacker.spiritId = spiritFor("gold-vein-dragon").id;
    expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(60);

    const wrongNative = { ...snapshot, spirits: snapshot.spirits.map(spirit => spirit.id === spiritFor("minggulong").id
      ? { ...spirit, traitIds: [traitFor("abu").id] } : spirit) };
    state.sides.attacker.spiritId = spiritFor("minggulong").id;
    expect(resolveS5PreviewBattleLevel(wrongNative, state, "attacker")).toBe(60);
  });

  test("ignoring an authorized level trait restores60 and cannot reuse its old dynamic panel cache", () => {
    for (const key of levelKeys) {
      const state = fixture(key);
      setLevel(state, "attacker", key, { CurrentLevel: 90, LevelEventCount: 0 });
      state.sides.attacker.ignoreTraits = true;
      state.sides.attacker.panelStats = cachedPanel;
      expect(resolveS5PreviewBattleLevel(snapshot, state, "attacker")).toBe(60);
      const projected = withS5PreviewBattleLevels(snapshot, state);
      expect(projected.sides.attacker.level).toBe(60);
      expect(projected.sides.attacker).not.toHaveProperty("panelStats");
      expect(state.sides.attacker.panelStats).toBe(cachedPanel);
    }
  });

  test("custom temporary IDs retain trusted catalog/native-trait metadata and current owner values", () => {
    for (const key of levelKeys) {
      const original = spiritFor(key);
      const custom = { ...original, id: `${original.id}__custom_attacker`, raceStats: { ...original.raceStats, hp: 150 } };
      const customSnapshot = { ...snapshot, spirits: [...snapshot.spirits, custom] };
      const state = fixture(key);
      state.sides.attacker.spiritId = custom.id;
      state.sides.attacker.panelStats = cachedPanel;
      setLevel(state, "attacker", key, { CurrentLevel: key === "minggulong" ? 99 : 70, LevelEventCount: 1 });
      const expected = key === "minggulong" ? 89 : 72;
      expect(resolveS5PreviewBattleLevel(customSnapshot, state, "attacker")).toBe(expected);
      const projected = withS5PreviewBattleLevels(customSnapshot, state);
      expect(projected.sides.attacker).toMatchObject({ spiritId: custom.id, level: expected });
      expect(projected.sides.attacker).not.toHaveProperty("panelStats");
      expect(custom.previewIdentity).toBe(original.previewIdentity);
      expect(custom.raceStats.hp).toBe(150);
    }
  });

  test("the projection is temporary, clears all four authorized caches and preserves ordinary cached stats", () => {
    for (const key of levelKeys) {
      const state = fixture(key);
      state.sides.attacker.panelStats = cachedPanel;
      state.sides.defender.panelStats = cachedPanel;
      state.sides.defender.level = 99;
      const before = structuredClone(state);
      const projected = withS5PreviewBattleLevels(snapshot, state);
      expect(projected).not.toBe(state);
      expect(projected.sides).not.toBe(state.sides);
      expect(projected.directions).toBe(state.directions);
      expect(projected.sides.attacker).not.toHaveProperty("panelStats");
      expect(projected.sides.defender).toMatchObject({ spiritId: ordinary.id, level: 60 });
      expect(projected.sides.defender.panelStats).toBe(cachedPanel);
      expect(state).toEqual(before);
      expect(state.sides.attacker).not.toHaveProperty("level");
    }
  });
});
