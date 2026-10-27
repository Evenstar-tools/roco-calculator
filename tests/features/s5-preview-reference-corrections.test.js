// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  correctS5PreviewReferences, correctS5PreviewStoredJson,
} from "../../src/features/s5-preview/reference-corrections.js";
import { assertSnapshotReferences } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { encodeShareEnvelope } from "../../src/state/share.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { normalizeTriggerControls } from "../../src/domain/trigger-controls.js";
import { getLegacyAbuLevelInputs, getLegacyMinggulongLevelInputs } from "../../src/features/s5-preview/level-input-migration.js";
import { createPreviewStorage } from "../../src/runtime/preview-storage.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { serverStorageKey } from "../../src/state/server-storage.js";

const oldSpirit = "spirit_preview_s5_boss-thousand-spikes";
const canonicalSpirit = "spirit_786924cd03526ca4";
const oldTrait = "trait_preview_s5_boss-thousand-spikes";
const canonicalTrait = "trait_40aa89d1be037fd7";
const wornSpirit = "spirit_dbf6e5118a0b051e";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.resetModules(); history.replaceState(null, "", "/"); });

test("only exact duplicate reference values/keys are corrected, preserving unchanged branches and input", () => {
  const stable = { spiritId: wornSpirit, note: "spirit_preview_s5_boss-thousand-spikes-extra", constructor: "constructor" };
  const source = { present: { spiritId: oldSpirit }, past: [{ state: { traitIds: [oldTrait] } }],
    teams: [{ members: [{ spiritId: oldSpirit }] }], favorites: [{ spiritId: oldSpirit }],
    configs: { [oldSpirit]: { spiritId: oldSpirit, acquiredTraitValues: { [oldTrait]: { amount: 2 } } } }, stable };
  const saved = structuredClone(source);
  const result = correctS5PreviewReferences(source);
  expect(source).toEqual(saved);
  expect(result.present.spiritId).toBe(canonicalSpirit);
  expect(result.past[0].state.traitIds).toEqual([canonicalTrait]);
  expect(result.teams[0].members[0].spiritId).toBe(canonicalSpirit);
  expect(result.favorites[0].spiritId).toBe(canonicalSpirit);
  expect(result.configs[canonicalSpirit]).toEqual({ spiritId: canonicalSpirit, acquiredTraitValues: { [canonicalTrait]: { amount: 2 } } });
  expect(result.stable).toBe(stable);
  expect(correctS5PreviewReferences(stable)).toBe(stable);
  expect(correctS5PreviewReferences(result)).toBe(result);
});

test.each([false, true])("canonical species and trait configurations win key collisions in either insertion order (%s)", (canonicalFirst) => {
  const official = { nature: "neutral", raceStats: { physicalAttack: 127 }, custom: false };
  const obsolete = { nature: "old", raceStats: { physicalAttack: 100 }, custom: true };
  const speciesEntries = [[oldSpirit, obsolete], [canonicalSpirit, official]];
  const traitEntries = [[oldTrait, { stacks: 99 }], [canonicalTrait, { stacks: 2 }]];
  if (canonicalFirst) { speciesEntries.reverse(); traitEntries.reverse(); }
  const corrected = correctS5PreviewReferences({
    configs: Object.fromEntries(speciesEntries), values: Object.fromEntries(traitEntries),
  });
  expect(corrected.configs).toEqual({ [canonicalSpirit]: official });
  expect(corrected.configs[canonicalSpirit]).toBe(official);
  expect(corrected.values).toEqual({ [canonicalTrait]: { stacks: 2 } });
});

test("stored JSON preserves original formatting when no correction is necessary and does not reinterpret raw settings", () => {
  const raw = '{ "spiritId" : "' + wornSpirit + '" }';
  for (const input of [raw, "dark", "{broken", null, "constructor"]) {
    expect(correctS5PreviewStoredJson(input)).toBe(input);
  }
  expect(JSON.parse(correctS5PreviewStoredJson(JSON.stringify({ spiritId: oldSpirit })))).toEqual({ spiritId: canonicalSpirit });
});

function shareFixture() {
  const stats = { hp: 100, physicalAttack: 110, magicalAttack: 80, physicalDefense: 100, magicalDefense: 90, speed: 75 };
  const snapshot = {
    meta: { id: "preview-correction-fixture", rulesVersion: "fixture-rules" },
    spirits: [
      { id: canonicalSpirit, fullName: "千棘海针", raceStats: stats, traitIds: [canonicalTrait], types: ["水"] },
      { id: wornSpirit, fullName: "千棘海针（磨损的样子）", raceStats: stats, traitIds: [canonicalTrait], types: ["水"] },
    ],
    traits: [{ id: canonicalTrait, name: "溶解腐蚀" }], skills: [], learnsets: [],
  };
  const shared = createInitialState(snapshot);
  shared.sides.attacker.spiritId = oldSpirit;
  shared.sides.defender.spiritId = wornSpirit;
  return { snapshot, shared };
}

test("an old shared reference fails ordinary validation but the exact correction passes without replacing worn form or stats", () => {
  const { snapshot, shared } = shareFixture();
  expect(() => assertSnapshotReferences(shared, snapshot)).toThrow("不存在的精灵");
  const corrected = correctS5PreviewReferences(shared);
  expect(() => assertSnapshotReferences(corrected, snapshot)).not.toThrow();
  expect(corrected.sides.defender.spiritId).toBe(wornSpirit);
  expect(snapshot.spirits[0].raceStats.physicalAttack).toBe(110);
});

test.each([["pre", true], ["test", false]])("share import applies correction only in %s build", async (mode, corrected) => {
  vi.stubEnv("MODE", mode);
  vi.resetModules();
  const { useShareFlow } = await import("../../src/hooks/useShareFlow.js");
  const { snapshot, shared } = shareFixture();
  const initialState = createInitialState(snapshot);
  const hash = await encodeShareEnvelope({ serverId: "cn", locale: "zh-CN", gameVersion: null,
    dataVersion: shared.versions.data, rulesVersion: shared.versions.rules, kind: "configuration", payload: shared });
  history.replaceState(null, "", (mode === "pre" ? "/pre/" : "/cn/") + hash);
  const commitSession = vi.fn();
  const onToast = vi.fn();
  renderHook(() => useShareFlow({
    serverId: "cn", initialState, snapshot, state: initialState,
    stateRef: { current: initialState }, configurationReady: true, commitSession, onToast,
  }));
  if (corrected) {
    await waitFor(() => expect(commitSession).toHaveBeenCalledTimes(1));
    expect(commitSession.mock.calls[0][0].state.sides.attacker.spiritId).toBe(canonicalSpirit);
    expect(commitSession.mock.calls[0][0].state.sides.defender.spiritId).toBe(wornSpirit);
    expect(onToast).not.toHaveBeenCalled();
  } else {
    await waitFor(() => expect(onToast).toHaveBeenCalledTimes(1));
    expect(onToast.mock.calls[0][0]).toContain("不存在的精灵");
    expect(commitSession).not.toHaveBeenCalled();
  }
  expect(shared.sides.attacker.spiritId).toBe(oldSpirit);
});

const minggulongId = "spirit_preview_s5_minggulong";
const abuIds = ["spirit_preview_s5_abu", "spirit_preview_s5_boss-abu", "spirit_preview_s5_super-abu"];
function battleLevelControl(role = "attacker", isAbu = false) {
  const source = `${role}Trait`;
  return normalizeTriggerControls([{ contextKey: `${source}S5BattleLevel`, type: "number",
    defaultValue: isAbu ? 60 : 99, min: 1, max: 99, step: isAbu ? 2 : 10 }], { source, scope: "direction" })[0];
}
function oldLevelValues(level, count, role = "attacker", canonical = false, isAbu = false) {
  const controls = isAbu ? getLegacyAbuLevelInputs(role) : getLegacyMinggulongLevelInputs(role);
  return Object.fromEntries(controls.map((control, index) => [
    canonical ? canonicalTraitControlKey(control) : control.id, [level, count][index],
  ]));
}
function levelFixture(spiritId = minggulongId) {
  const { snapshot } = shareFixture();
  const isAbu = abuIds.includes(spiritId);
  const key = spiritId.replace("spirit_preview_s5_", "");
  const previewIdentity = { catalogId: "s5-correction-test", key, mechanicKey: isAbu ? "abu" : "minggulong" };
  const trait = { id: `trait_preview_s5_${key}`, name: isAbu ? "阿布特性" : "恶龙的奢望", previewIdentity };
  snapshot.traits.push(trait);
  snapshot.spirits.push({ ...snapshot.spirits[0], id: spiritId, fullName: isAbu ? "阿布" : "冥古龙",
    traitIds: [trait.id], traitName: trait.name, previewIdentity });
  const shared = createInitialState(snapshot);
  shared.sides.attacker.spiritId = spiritId;
  shared.sides.defender.spiritId = wornSpirit;
  shared.directions.forward.context = { ...shared.directions.forward.context,
    ...oldLevelValues(isAbu ? 60 : 99, 3, "attacker", false, isAbu) };
  shared.directions.reverse.context = { ...shared.directions.reverse.context,
    ...oldLevelValues(isAbu ? 60 : 99, 3, "defender", false, isAbu) };
  return { snapshot, shared };
}

test("Minggulong old99/count3 becomes one current69 input in both directions without mutating history", () => {
  const { shared } = levelFixture();
  const source = { present: shared, past: [{ state: shared }], future: [], untouched: { theme: "s5" } };
  const before = structuredClone(source);
  const corrected = correctS5PreviewReferences(source);
  expect(source).toEqual(before);
  for (const state of [corrected.present, corrected.past[0].state]) {
    expect(state.directions.forward.context[battleLevelControl().id]).toBe(69);
    expect(state.directions.reverse.context[battleLevelControl("defender").id]).toBe(69);
    for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
      for (const control of getLegacyMinggulongLevelInputs(role)) {
        expect(state.directions[direction].context).not.toHaveProperty(control.id);
      }
    }
    expect(state.sides.attacker).not.toHaveProperty("level");
  }
  expect(corrected.untouched).toBe(source.untouched);
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
});

test("each Minggulong owner reads only its outgoing values; the new current input wins stale counts", () => {
  const { shared } = levelFixture();
  shared.sides.defender.spiritId = minggulongId;
  shared.directions.forward.context = { ...shared.directions.forward.context,
    [battleLevelControl().id]: 79, ...oldLevelValues(90, 1, "defender") };
  shared.directions.reverse.context = { ...shared.directions.reverse.context, ...oldLevelValues(90, 1) };
  const corrected = correctS5PreviewReferences(shared);
  expect(corrected.directions.forward.context[battleLevelControl().id]).toBe(79);
  expect(corrected.directions.reverse.context[battleLevelControl("defender").id]).toBe(79);
  expect(corrected.directions.reverse.context[battleLevelControl().id]).toBe(80);
  expect(corrected.directions.forward.context[battleLevelControl("defender").id]).toBe(80);
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
});

test("Minggulong and Abu owners migrate independently while unknown lower bounds remain blocked", () => {
  const { shared } = levelFixture();
  shared.sides.defender.spiritId = "spirit_preview_s5_abu";
  shared.directions.reverse.context = { ...shared.directions.reverse.context, ...oldLevelValues(60, 2, "attacker", false, true) };
  shared.directions.forward.context = { ...shared.directions.forward.context, ...oldLevelValues(60, 2, "defender", false, true) };
  const corrected = correctS5PreviewReferences(shared);
  for (const [direction, role] of [["reverse", "attacker"], ["forward", "defender"]]) {
    expect(corrected.directions[direction].context[battleLevelControl(role, true).id]).toBe(64);
    expect(corrected.directions[direction].context).not.toHaveProperty(battleLevelControl(role).id);
  }
  expect(corrected.directions.forward.context[battleLevelControl().id]).toBe(69);
  expect(corrected.directions.reverse.context[battleLevelControl("defender").id]).toBe(69);
  const invalid = levelFixture().shared;
  Object.assign(invalid.directions.forward.context, oldLevelValues(99, 10));
  expect(correctS5PreviewReferences(invalid)).toBe(invalid);
  expect(correctS5PreviewReferences({ spiritId: "spirit_preview_s5_minggulong_extra",
    traitValues: oldLevelValues(99, 3, "attacker", true) })).toEqual({
    spiritId: "spirit_preview_s5_minggulong_extra", traitValues: oldLevelValues(99, 3, "attacker", true),
  });
});

test("Minggulong saved canonical trait values retain the effective level; the new canonical value wins", () => {
  const config = { spiritId: minggulongId, traitValues: oldLevelValues(99, 3, "attacker", true) };
  const corrected = correctS5PreviewReferences(config);
  expect(corrected.traitValues).toEqual({ [canonicalTraitControlKey(battleLevelControl())]: 69 });
  expect(config.traitValues).toEqual(oldLevelValues(99, 3, "attacker", true));
  const explicit = correctS5PreviewReferences({ ...config, traitValues: {
    ...config.traitValues, [canonicalTraitControlKey(battleLevelControl())]: 80,
  } });
  expect(explicit.traitValues).toEqual({ [canonicalTraitControlKey(battleLevelControl())]: 80 });
  expect(correctS5PreviewReferences(explicit)).toBe(explicit);
});

test.each(abuIds)("%s migrates old60/count3 to current66 in history and saved configs, capped at99", spiritId => {
  const { shared } = levelFixture(spiritId);
  const config = { spiritId, traitValues: oldLevelValues(60, 3, "attacker", true, true) };
  const source = { present: shared, past: [{ state: shared }], future: [], configs: [config] };
  const before = structuredClone(source);
  const corrected = correctS5PreviewReferences(source);
  expect(source).toEqual(before);
  for (const state of [corrected.present, corrected.past[0].state]) {
    for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
      expect(state.directions[direction].context[battleLevelControl(role, true).id]).toBe(66);
      for (const control of getLegacyAbuLevelInputs(role)) {
        expect(state.directions[direction].context).not.toHaveProperty(control.id);
      }
    }
  }
  const canonicalKey = canonicalTraitControlKey(battleLevelControl("attacker", true));
  expect(corrected.configs[0].traitValues).toEqual({ [canonicalKey]: 66 });
  const capped = correctS5PreviewReferences({ spiritId,
    traitValues: oldLevelValues(98, 2, "attacker", true, true) });
  expect(capped.traitValues).toEqual({ [canonicalKey]: 99 });
  const explicit = correctS5PreviewReferences({ ...config,
    traitValues: { ...config.traitValues, [canonicalKey]: 81 } });
  expect(explicit.traitValues).toEqual({ [canonicalKey]: 81 });
  const savedRaw = JSON.stringify(source);
  expect(JSON.parse(correctS5PreviewStoredJson(savedRaw))).toEqual(corrected);
  expect(correctS5PreviewReferences(corrected)).toBe(corrected);
});

test("Abu count-only legacy values use60, but ordinary and similarly named species are untouched", () => {
  const count = getLegacyAbuLevelInputs()[1];
  const source = { spiritId: abuIds[0], traitValues: { [canonicalTraitControlKey(count)]: 4 } };
  expect(correctS5PreviewReferences(source).traitValues).toEqual({
    [canonicalTraitControlKey(battleLevelControl("attacker", true))]: 68,
  });
  for (const spiritId of [wornSpirit, `${abuIds[0]}_extra`, "spirit_abu"]) {
    const ordinary = { ...source, spiritId };
    expect(correctS5PreviewReferences(ordinary)).toBe(ordinary);
  }
});

test("preview storage reads old levels as69 without rewriting raw or formal storage", () => {
  const { shared } = levelFixture();
  const key = "rock-calculator.servers.cn.calculator.session.v1";
  const previewKey = "rock-calculator.preview.s5." + key;
  const raw = JSON.stringify({ present: shared });
  localStorage.setItem(previewKey, raw);
  localStorage.setItem(key, raw);
  try {
    const corrected = JSON.parse(createPreviewStorage(localStorage).getItem(key));
    expect(corrected.present.directions.forward.context[battleLevelControl().id]).toBe(69);
    expect(localStorage.getItem(previewKey)).toBe(raw);
    expect(localStorage.getItem(key)).toBe(raw);
    expect(correctS5PreviewStoredJson(JSON.stringify(corrected))).toBe(JSON.stringify(corrected));
  } finally { localStorage.removeItem(previewKey); localStorage.removeItem(key); }
});

test.each([minggulongId, abuIds[0]])("preview share import converts old levels before normal restoration (%s)", async spiritId => {
  vi.stubEnv("MODE", "pre");
  vi.resetModules();
  const { useShareFlow } = await import("../../src/hooks/useShareFlow.js");
  const isAbu = abuIds.includes(spiritId);
  const { snapshot, shared } = levelFixture(spiritId);
  const initialState = createInitialState(snapshot);
  const hash = await encodeShareEnvelope({ serverId: "cn", locale: "zh-CN", gameVersion: null,
    dataVersion: shared.versions.data, rulesVersion: shared.versions.rules, kind: "configuration", payload: shared });
  history.replaceState(null, "", "/pre/" + hash);
  const commitSession = vi.fn();
  const onToast = vi.fn();
  renderHook(() => useShareFlow({ serverId: "cn", initialState, snapshot, state: initialState,
    stateRef: { current: initialState }, configurationReady: true, commitSession, onToast }));
  await waitFor(() => expect(commitSession).toHaveBeenCalledTimes(1));
  const restored = commitSession.mock.calls[0][0].state;
  expect(restored.directions.forward.context[battleLevelControl("attacker", isAbu).id]).toBe(isAbu ? 66 : 69);
  expect(restored.directions.reverse.context[battleLevelControl("defender", isAbu).id]).toBe(isAbu ? 66 : 69);
  expect(onToast).not.toHaveBeenCalled();
  expect(shared.directions.forward.context).toEqual(expect.objectContaining(oldLevelValues(isAbu ? 60 : 99, 3, "attacker", false, isAbu)));
});

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
  };
}
function currentLevelState(level, mirrored = true, spiritId = minggulongId) {
  const isAbu = abuIds.includes(spiritId);
  const { shared } = levelFixture(spiritId);
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    const controls = isAbu ? getLegacyAbuLevelInputs(role) : getLegacyMinggulongLevelInputs(role);
    for (const control of controls) delete shared.directions[direction].context[control.id];
  }
  shared.directions.forward.context[battleLevelControl("attacker", isAbu).id] = level;
  if (mirrored) shared.directions.reverse.context[battleLevelControl("defender", isAbu).id] = level;
  return shared;
}

test.each([minggulongId, ...abuIds].flatMap(spiritId => [false, true].map(mirrored => [spiritId, mirrored])))
("new-only %s sessions/history keep serialized bytes and saves conflict-free (mirror %s)", (spiritId, mirrored) => {
  const native = memoryStorage();
  const storage = createPreviewStorage(native);
  const store = createCalculatorSessionStore({ storage });
  const key = serverStorageKey("cn", "calculator.session.v1");
  const rawKey = "rock-calculator.preview.s5." + key;
  expect(store.loadSession()).toBeNull();
  const previous = [];
  let latest;
  for (const level of [79, 80, 70]) {
    const present = currentLevelState(level, mirrored, spiritId);
    const payload = { present, past: [...previous], future: [] };
    expect(() => store.saveSession(payload)).not.toThrow();
    latest = payload;
    previous.push({ state: present, rememberSides: [] });
  }
  expect(correctS5PreviewReferences(latest.present)).toBe(latest.present);
  expect(storage.getItem(key)).toBe(native.getItem(rawKey));
  expect(store.loadSession()).toEqual(latest);
});

test.each([false, true])("蛋包蛋旧双勾选按原AND合并，缺省false、新值优先、canonical=%s", canonical => {
  for (const role of ["attacker", "defender"]) {
    const source = `${role}Trait`;
    const controls = normalizeTriggerControls(["TeamMoenhua", "EntryDefenseActive", "EggTriggered"].map(suffix => ({
      contextKey: `${source}S5${suffix}`, type: "boolean", defaultValue: false,
    })), { source, scope: "direction" });
    const [team, active, trigger] = controls.map(control => canonical ? canonicalTraitControlKey(control) : control.id);
    for (const first of [undefined, false, true]) for (const second of [undefined, false, true]) {
      if (first === undefined && second === undefined) continue;
      const old = { ...(first !== undefined ? { [team]: first } : {}), ...(second !== undefined ? { [active]: second } : {}) };
      const corrected = correctS5PreviewReferences(old);
      expect(corrected).toEqual({ [trigger]: first === true && second === true });
      expect(correctS5PreviewReferences(corrected)).toBe(corrected);
      expect(correctS5PreviewReferences({ ...old, [trigger]: false })).toEqual({ [trigger]: false });
      expect(JSON.parse(correctS5PreviewStoredJson(JSON.stringify(old)))).toEqual(corrected);
    }
  }
});
