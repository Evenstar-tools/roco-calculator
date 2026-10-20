import { expect, test } from "vitest";
import { applyConfiguration, createProductInitialState, patchFourSkill, reduceSessionAction, rememberSingleSkill, replaceConfiguration, selectFourSkill, selectSingleSkill, selectSpirit } from "../../src/state/calculator-session.js";
import { selectConfigurationDraftInputs } from "../../src/state/share.js";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";
import { weatherDraft } from "../fixtures/global-weather-draft.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";

test("selecting a Global reference starts unset inputs without CN recommended skills or weather changes", () => {
  const snapshot = globalPlaceholderCatalog();
  const initial = createProductInitialState(snapshot);
  const draft = weatherDraft();
  const selected = selectSpirit(draft, { initialState: initial, snapshot, side: "attacker", spiritId: snapshot.spirits[0].id }).state;
  expect(selected.sides.attacker).toMatchObject({ spiritId: snapshot.spirits[0].id, nature: null,
    skills: { single: null, four: [null, null, null, null] } });
  expect(Object.values(selected.sides.attacker.displayIvs)).toEqual(Array(6).fill(null));
  expect(selected.directions).toEqual(draft.directions);
  expect(selected.marks).toEqual(draft.marks);
  expect(selected.sides.defender).toEqual(draft.sides.defender);
  expect(selectConfigurationDraftInputs(selected).versions).toEqual({ data: null, rules: null });
});

test.each(["personal", "team"])("Global %s configuration applies raw nature/IV/slot parameters and keeps battle draft context", (source) => {
  const snapshot = globalPlaceholderCatalog();
  const draft = weatherDraft();
  const member = { ...draft.sides.attacker, spiritId: snapshot.spirits[0].id, natureId: "future-nature",
    displayIvs: { ...draft.sides.attacker.displayIvs, hp: 72 }, updatedAt: "saved", needsRepair: false };
  member.skills.four = [...member.skills.four, ...Array(4).fill(null)];
  const result = applyConfiguration(draft, member, { snapshot, initialState: draft, source, side: "attacker", remember: false });
  expect(result.state.sides.attacker.nature).toBe("future-nature");
  expect(result.state.sides.attacker.displayIvs.hp).toBe(72);
  expect(result.state.sides.attacker.skills).toEqual(member.skills);
  expect(result.state.sides.attacker).not.toHaveProperty("updatedAt");
  expect(result.state.directions).toEqual(draft.directions);
  expect(selectConfigurationDraftInputs(result.state).sides.attacker.skills.four).toHaveLength(8);
  const loaded = selectSpirit(draft, { snapshot, initialState: draft, spiritId: member.spiritId, personalConfiguration: member, side: "attacker" });
  expect(loaded.state.sides.attacker).toEqual(result.state.sides.attacker);
});

test("Global skill selection and patching keep false conditions and unknown values without CN hit defaults", () => {
  const snapshot = globalPlaceholderCatalog();
  const draft = weatherDraft();
  draft.sides.attacker.skills.single = { skillId: "old", context: { rainWeather: false, custom: 41 }, overrides: { unknown: 19 } };
  const first = selectFourSkill(draft, { snapshot, side: "attacker", index: 0, skillId: snapshot.skills[0].id }).state;
  expect(first.sides.attacker.skills.four[0]).toEqual({ ...draft.sides.attacker.skills.four[0], skillId: snapshot.skills[0].id });
  const patched = patchFourSkill(first, { snapshot, side: "attacker", index: 0, patch: { context: { custom: 99 } } }).state;
  expect(patched.sides.attacker.skills.four[0].context).toEqual({ rainWeather: false, custom: 99 });
  const single = selectSingleSkill(patched, { snapshot, side: "attacker", direction: "forward", skillId: snapshot.skills[1].id }).state;
  expect(single.sides.attacker.skills.single).toEqual({ ...draft.sides.attacker.skills.single, skillId: snapshot.skills[1].id });
  expect(rememberSingleSkill(single, { snapshot, side: "attacker", direction: "forward" }).state).toBe(single);
  expect(single.directions).toEqual(draft.directions);
  expect(single.sides.attacker.skills.single).not.toHaveProperty("hitCount");
  const cleared = selectFourSkill(single, { snapshot, side: "attacker", index: 0, skillId: null }).state;
  expect(cleared.sides.attacker.skills.four[0]).toBeNull();
  expect(cleared.directions).toEqual(draft.directions);
});

test("Global manual nature/IV inputs accept unset and unknown values without a CN cap", () => {
  const draft = weatherDraft();
  draft.sides.attacker.battleForm = { spiritId: "unknown-form", branchId: "unknown-branch" };
  expect(reduceSessionAction(draft, { type: "side/set-iv", side: "attacker", stat: "hp", value: 72 }, { serverId: "global" }).persistence.rememberSide).toBe("attacker");
  const edited = reduceSessionAction(draft, { type: "side/set-iv", side: "attacker", stat: "hp", value: 72 }, { serverId: "global" }).state;
  const named = reduceSessionAction(edited, { type: "side/set-nature", side: "attacker", value: "future-nature" }, { serverId: "global" }).state;
  expect(named.sides.attacker).toMatchObject({ nature: "future-nature", displayIvs: { hp: 72 } });
  const reset = reduceSessionAction(named, { type: "side/set-iv", side: "attacker", stat: "hp", value: null }, { serverId: "global" }).state;
  expect(reset.sides.attacker.displayIvs.hp).toBeNull();
  expect(reset.sides.attacker.battleForm).toEqual(draft.sides.attacker.battleForm);
  expect(reset.directions).toEqual(draft.directions);
});

test("Global focusing a second slot keeps rain 42/21, thunder and all other draft parameters", () => {
  const draft = weatherDraft();
  const focused = reduceSessionAction(draft, { type: "direction/update", direction: "forward",
    value: { selectedSkillIndex: 1, selectedDamageSource: "skill" } }, { serverId: "global" }).state;
  expect(focused.directions.forward).toEqual({ ...draft.directions.forward, selectedSkillIndex: 1 });
  expect(focused.directions.reverse).toEqual(draft.directions.reverse);
  expect(focused.marks).toEqual(draft.marks);
  expect(focused.sides).toEqual(draft.sides);
  for (const value of [{ selectedSkillIndex: 1, hitCount: 2 }, { context: { weatherRainTurns: 1 } }, { selectedDamageSource: "trait" }]) {
    expect(() => reduceSessionAction(draft, { type: "direction/update", direction: "forward", value }, { serverId: "global" }))
      .toThrow(expect.objectContaining({ code: "SERVER_DATA_UNVERIFIED" }));
  }
});

test("Global draft import preserves weather 42/21, thunder and a false skill condition exactly", () => {
  const draft = weatherDraft();
  expect(() => selectConfigurationDraftInputs(draft)).not.toThrow();
  const result = replaceConfiguration(createProductInitialState(UNVERIFIED_GLOBAL_SNAPSHOT), draft, { remember: false, source: "share", serverId: "global" });
  expect(result.state).toEqual(draft);
  expect(result.persistence.rememberSide).toBeNull();
});

test("Global swaps only the sides and their statuses, preserving directions and unknown fields", () => {
  const draft = weatherDraft();
  draft.extraWorkspace = { value: "kept" };
  draft.sides.extraMetadata = { field: "kept" };
  draft.sides.attacker.unknownSideField = { custom: 11 };
  draft.directions.forward.overrides.extraControl = 100;
  const next = reduceSessionAction(draft, { type: "sides/swap" }, { serverId: "global" }).state;
  expect(next.directions).toEqual(draft.directions);
  expect(next.sides.attacker).toEqual(draft.sides.defender);
  expect(next.sides.defender).toEqual(draft.sides.attacker);
  expect(next.sides.extraMetadata).toEqual(draft.sides.extraMetadata);
  expect(next.extraWorkspace).toEqual(draft.extraWorkspace);
  expect(reduceSessionAction(next, { type: "sides/swap" }, { serverId: "global" }).state).toEqual(draft);
});

test("Global mode and settlement preference edits do not normalize saved rule parameters", () => {
  const draft = weatherDraft();
  const mode = reduceSessionAction(draft, { type: "mode/set", value: "single" }, { serverId: "global" }).state;
  const next = reduceSessionAction(mode, { type: "calculation-option/set-negative-status", value: true }, { serverId: "global" }).state;
  expect(next.directions).toEqual(draft.directions);
  expect(next.sides).toEqual(draft.sides);
  expect(next.calculationOptions.includeNegativeStatusSettlement).toBe(true);
  expect(() => reduceSessionAction(draft, { type: "direction/update", direction: "forward", value: { context: { weatherRainTurns: 1 } } }, { serverId: "global" })).toThrow(expect.objectContaining({ code: "SERVER_DATA_UNVERIFIED" }));
});

test("the default CN session path still coordinates weather using the existing rules", () => {
  const draft = weatherDraft();
  const imported = replaceConfiguration(draft, structuredClone(draft), { remember: false, source: "share" }).state;
  const swapped = reduceSessionAction(draft, { type: "sides/swap" }).state;
  for (const next of [imported, swapped]) {
    expect(next.directions.forward.context).toMatchObject({ weatherRainTurns: 8, weatherThunder: false, rainWeather: true });
    expect(next.directions.reverse.context.weatherRainTurns).toBe(8);
  }
  expect(imported.sides.attacker.skills.four[0].context.rainWeather).toBe(true);
});
