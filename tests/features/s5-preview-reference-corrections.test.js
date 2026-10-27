// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  correctS5PreviewReferences, correctS5PreviewStoredJson,
} from "../../src/features/s5-preview/reference-corrections.js";
import { assertSnapshotReferences } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { encodeShareEnvelope } from "../../src/state/share.js";

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
