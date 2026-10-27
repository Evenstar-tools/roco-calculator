// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import runtimeSnapshot from "../../public/data/runtime.json";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { useCalculatorSession } from "../../src/hooks/useCalculatorSession.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { getRestorableDefaultSkills, reduceSessionAction, restoreDefaultSkills, selectSpirit } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";

const snapshot = withWebPreview(runtimeSnapshot);
const spiritId = snapshot.spirits.find(spirit => spirit.fullName === "地绡银龙").id;
const emptySkills = { single: null, four: [null, null, null, null] };
const initialState = createInitialState(snapshot);

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function selected(data = snapshot, personalConfiguration) {
  return selectSpirit(initialState, {
    initialState, personalConfiguration, side: "attacker", snapshot: data, spiritId,
  }).state;
}

function remember(side, data) {
  const repository = spiritConfigsRepository({ storage: memoryStorage(), now: () => "2026-10-27T00:00:00.000Z" });
  repository.save(repository.load(data), side, data);
  return repository.load(snapshot).configs[spiritId];
}

afterEach(cleanup);

test("银龙新默认四槽可用；旧空池自然保存与主动清空记录无法凭内容区分", () => {
  const defaults = chooseDefaultSkillIds(snapshot, spiritId);
  expect(defaults).toHaveLength(4);
  expect(defaults.every(Boolean)).toBe(true);
  expect(selected().sides.attacker.skills.four).toEqual(defaults);

  // Reproduce the old empty learnset while keeping the same stable spirit ID.
  const oldSnapshot = { ...snapshot, learnsets: snapshot.learnsets.map(learnset =>
    learnset.spiritId === spiritId ? { ...learnset, skillIds: [], defaultSkillIds: [] } : learnset) };
  const natural = reduceSessionAction(selected(oldSnapshot), {
    type: "side/set-nature", side: "attacker", value: "smart",
  });
  expect(natural.persistence.rememberSide).toBe("attacker");
  expect(natural.state.sides.attacker.skills).toEqual(emptySkills);

  let cleared = selected();
  for (let index = 0; index < 4; index += 1) {
    cleared = reduceSessionAction(cleared, {
      type: "side/set-four-skill", side: "attacker", index, value: null,
    }).state;
  }
  cleared = reduceSessionAction(cleared, { type: "side/set-single-skill", side: "attacker", value: null }).state;
  cleared = reduceSessionAction(cleared, { type: "side/set-nature", side: "attacker", value: "smart" }).state;

  const oldRecord = remember(natural.state.sides.attacker, oldSnapshot);
  const userRecord = remember(cleared.sides.attacker, snapshot);
  expect(oldRecord).toEqual(userRecord);
  // Missing provenance is not permission to overwrite deliberately empty slots.
  for (const personalConfiguration of [oldRecord, userRecord]) {
    expect(selected(snapshot, personalConfiguration).sides.attacker).toMatchObject({
      nature: "smart", skills: emptySkills,
    });
  }
});

test("新资料刷新会话保留旧空技能与手调；未保存个人配置时重新选择带出新默认", () => {
  const oldState = selected();
  oldState.sides.attacker.skills = structuredClone(emptySkills);
  oldState.sides.attacker.nature = "smart";
  oldState.sides.attacker.displayIvs.magicalAttack = 54;
  const store = createCalculatorSessionStore({ storage: memoryStorage() });
  store.saveSession({ present: oldState, past: [], future: [] });
  const { result } = renderHook(() => useCalculatorSession({
    initialState, onRememberSide: vi.fn(), onToast: vi.fn(), sessionStore: store,
  }));
  expect(result.current.state.sides.attacker).toMatchObject({
    nature: "smart", displayIvs: { magicalAttack: 54 }, skills: emptySkills,
  });
  const reselected = selectSpirit(result.current.state, { initialState, side: "attacker", snapshot, spiritId }).state;
  expect(reselected.sides.attacker.skills.four).toEqual(chooseDefaultSkillIds(snapshot, spiritId));
});

test("显式恢复只改本方四技能，保留其他配置；相同配招、未声明默认及本场形态不显示入口", () => {
  const state = selected();
  state.sides.attacker.skills.four = [null, null, null, null];
  state.sides.attacker.nature = "smart";
  state.sides.attacker.displayIvs.magicalAttack = 54;
  const before = structuredClone(state);
  const restored = restoreDefaultSkills(state, { side: "attacker", snapshot });
  expect(restored.persistence.rememberSide).toBe("attacker");
  const { skills, ...other } = restored.state.sides.attacker;
  expect(other).toEqual(Object.fromEntries(Object.entries(before.sides.attacker).filter(([key]) => key !== "skills")));
  expect(skills.single).toEqual(before.sides.attacker.skills.single);
  expect(restored.state.sides.defender).toEqual(before.sides.defender);
  expect(restored.state.marks).toEqual(before.marks);
  expect(skills.four.map(entry => entry?.skillId ?? entry)).toEqual(chooseDefaultSkillIds(snapshot, spiritId));
  expect(state).toEqual(before);
  expect(getRestorableDefaultSkills(restored.state, { side: "attacker", snapshot })).toBeNull();
  const noDeclaredDefaults = { ...snapshot, learnsets: snapshot.learnsets.map(learnset =>
    learnset.spiritId === spiritId ? { ...learnset, defaultSkillIds: undefined } : learnset) };
  expect(getRestorableDefaultSkills(state, { side: "attacker", snapshot: noDeclaredDefaults })).toBeNull();
  state.sides.attacker.battleForm = { spiritId };
  expect(getRestorableDefaultSkills(state, { side: "attacker", snapshot })).toBeNull();
});
