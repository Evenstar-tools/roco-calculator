import { describe, expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import {
  decodeShareEnvelope, decodeShareState, encodeShareEnvelope, encodeShareState,
  MAX_SHARE_HASH_LENGTH, MAX_SHARE_JSON_BYTES, selectShareableInputs, selectConfigurationDraftInputs,
  shareHashFromInput, shareMetadataFromHash,
} from "../../src/state/share.js";

function cnEnvelope() {
  return { serverId: "cn", gameVersion: null, dataVersion: "cn-data", rulesVersion: "cn-rules",
    locale: "zh-CN", kind: "configuration",
    payload: selectShareableInputs(createInitialState({ meta: { id: "cn-data", rulesVersion: "cn-rules" } })) };
}

function globalEnvelope(locale = "en") {
  const payload = selectShareableInputs(createInitialState());
  payload.sides.attacker.spiritId = "user-reference-not-cn-data";
  payload.sides.attacker.nature = "unknown-global-nature";
  payload.directions.forward.context = { notes: [true, 0.5, null] };
  return { serverId: "global", gameVersion: null, dataVersion: null, rulesVersion: null,
    ...(locale ? { locale } : {}), kind: "configuration-draft", payload };
}

async function rawEnvelope(value, { serverId = value?.serverId ?? "global", locale = value?.locale ?? "-", serialized = JSON.stringify(value) } = {}) {
  const bytes = new TextEncoder().encode(serialized);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const body = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
  return `#v2.${serverId}.${locale}.${body}.${checksum}`;
}

describe("validated server share envelopes", () => {
  test.each(["en", "ja", "zh-CN", null])("round trips a data-independent Global draft with locale %s", async (locale) => {
    const input = globalEnvelope(locale);
    const hash = await encodeShareEnvelope(input);
    const expected = { protocolVersion: 2, ...input };
    expect(await decodeShareEnvelope(hash, { serverId: "global", kind: "configuration-draft", dataVersion: null, rulesVersion: null })).toEqual(expected);
    expect(shareMetadataFromHash(hash)).toEqual({ protocolVersion: 2, serverId: "global", ...(locale ? { locale } : {}), verified: false });
    expect(shareHashFromInput(`https://other.test/global/ja/${hash}`)).toBe(hash);
    expect(shareHashFromInput(`  ${hash}  `)).toBe(hash);
  });

  test("CN v2 preserves configuration and declares its actual payload versions", async () => {
    const input = cnEnvelope();
    const hash = await encodeShareEnvelope(input);
    const legacy = await decodeShareState(await encodeShareState(input.payload));
    expect(await decodeShareEnvelope(hash)).toEqual({ protocolVersion: 2, ...input, payload: legacy });
    await expect(decodeShareEnvelope(hash, { serverId: "global" })).rejects.toMatchObject({ code: "SHARE_SERVER_MISMATCH" });
    await expect(decodeShareEnvelope(hash, { dataVersion: "another-data" })).rejects.toMatchObject({ code: "SHARE_VERSION_MISMATCH" });
    await expect(decodeShareEnvelope(hash, { gameVersion: "known-game-build" })).rejects.toMatchObject({ code: "SHARE_VERSION_MISMATCH" });
  });

  test("an unset Global original-UI draft round trips null nature and IVs without filling CN defaults", async () => {
    const state = createInitialState();
    for (const side of Object.values(state.sides)) {
      side.nature = null;
      side.displayIvs = Object.fromEntries(Object.keys(side.displayIvs).map((key) => [key, null]));
    }
    const input = { ...globalEnvelope(), payload: selectConfigurationDraftInputs(state) };
    const decoded = await decodeShareEnvelope(await encodeShareEnvelope(input));
    expect(decoded.payload).toEqual(state);
    expect(Object.values(decoded.payload.sides.attacker.displayIvs)).toEqual([null, null, null, null, null, null]);
    await expect(encodeShareEnvelope({ ...cnEnvelope(), payload: { ...state, versions: { data: "cn-data", rules: "cn-rules" } } })).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
  });

  test("old v1 remains CN and retains the original state decoder", async () => {
    const hash = await encodeShareState(cnEnvelope().payload);
    const legacy = await decodeShareState(hash);
    expect(await decodeShareEnvelope(hash)).toMatchObject({ protocolVersion: 1, serverId: "cn", gameVersion: null, payload: legacy });
    expect(shareMetadataFromHash("#v1.pending.signature")).toMatchObject({ serverId: "cn", verified: false });
    await expect(decodeShareEnvelope(hash, { serverId: "global" })).rejects.toMatchObject({ code: "SHARE_SERVER_MISMATCH" });
  });

  test("prefix hints are untrusted and must agree with the validated envelope", async () => {
    const hash = await encodeShareEnvelope(globalEnvelope());
    const forged = hash.replace("#v2.global.en.", "#v2.cn.zh-CN.");
    expect(shareMetadataFromHash(forged)).toMatchObject({ serverId: "cn", verified: false });
    await expect(decodeShareEnvelope(forged)).rejects.toMatchObject({ code: "SHARE_INTEGRITY" });
    await expect(decodeShareEnvelope(hash.replace(".global.en.", ".global.ja."))).rejects.toMatchObject({ code: "SHARE_INTEGRITY" });
    expect(shareMetadataFromHash("#v2.global.en.payload.signature")).toMatchObject({ serverId: "global", verified: false });
    expect(shareMetadataFromHash("#v2.unknown.en.payload.signature")).toBeNull();
  });

  test("rejects damaged hashes, unknown protocol versions, invalid encoding and JSON", async () => {
    const hash = await encodeShareEnvelope(globalEnvelope());
    await expect(decodeShareEnvelope(`${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`)).rejects.toMatchObject({ code: "SHARE_INTEGRITY" });
    await expect(decodeShareEnvelope(hash.replace("#v2.", "#v3."))).rejects.toMatchObject({ code: "SHARE_UNSUPPORTED_VERSION" });
    await expect(decodeShareEnvelope("#v2.global.en.A.000000000000")).rejects.toMatchObject({ code: "SHARE_ENCODING" });
    await expect(decodeShareEnvelope(await rawEnvelope(null, { serialized: "{" }))).rejects.toMatchObject({ code: "SHARE_JSON" });
    await expect(decodeShareEnvelope("#v2.global.en.payload.signature")).rejects.toMatchObject({ code: "SHARE_INVALID_FORMAT" });
  });

  test.each([
    ["missing metadata", (value) => { delete value.gameVersion; }, "SHARE_SCHEMA"],
    ["unknown field", (value) => { value.extra = true; }, "SHARE_SCHEMA"],
    ["unsupported body protocol", (value) => { value.protocolVersion = 3; }, "SHARE_UNSUPPORTED_VERSION"],
    ["invalid locale", (value) => { value.locale = "fr"; }, "SHARE_SCHEMA"],
    ["unknown payload kind", (value) => { value.kind = "battle-result"; }, "SHARE_UNSUPPORTED_KIND"],
    ["invented Global rules", (value) => { value.rulesVersion = "cn-rules"; }, "SHARE_VERSION_MISMATCH"],
    ["invented game version", (value) => { value.gameVersion = "invented-global-build"; }, "SHARE_VERSION_MISMATCH"],
    ["invalid draft field", (value) => { value.payload.iv = 60; }, "SHARE_SCHEMA"],
    ["unknown draft schema", (value) => { value.payload.schemaVersion = 2; }, "SHARE_SCHEMA"],
  ])("rejects %s even with a valid integrity checksum", async (_label, mutate, code) => {
    const value = { protocolVersion: 2, ...globalEnvelope() };
    mutate(value);
    const hash = await rawEnvelope(value, { locale: "en" });
    await expect(decodeShareEnvelope(hash)).rejects.toMatchObject({ code });
    await expect(encodeShareEnvelope(value)).rejects.toMatchObject({ code });
  });

  test("Global cannot import a CN configuration by relabeling its server", async () => {
    const value = { protocolVersion: 2, ...cnEnvelope(), serverId: "global", locale: "en" };
    await expect(encodeShareEnvelope(value)).rejects.toMatchObject({ code: "SHARE_VERSION_MISMATCH" });
    await expect(decodeShareEnvelope(await rawEnvelope(value))).rejects.toMatchObject({ code: "SHARE_VERSION_MISMATCH" });
    await expect(encodeShareEnvelope({ ...cnEnvelope(), dataVersion: "different" })).rejects.toMatchObject({ code: "SHARE_VERSION_MISMATCH" });
  });

  test("rejects oversized, dangerous and deeply nested payloads before applying them", async () => {
    await expect(decodeShareEnvelope(`#v2.global.en.${"A".repeat(MAX_SHARE_HASH_LENGTH)}.000000000000`)).rejects.toMatchObject({ code: "SHARE_TOO_LARGE" });
    await expect(decodeShareEnvelope(await rawEnvelope(null, { serialized: " ".repeat(MAX_SHARE_JSON_BYTES + 1) }))).rejects.toMatchObject({ code: "SHARE_TOO_LARGE" });
    const oversized = globalEnvelope();
    oversized.payload.directions.forward.context.text = "中".repeat(Math.ceil(MAX_SHARE_JSON_BYTES / 3));
    await expect(encodeShareEnvelope(oversized)).rejects.toMatchObject({ code: "SHARE_TOO_LARGE" });
    const unsafe = globalEnvelope();
    unsafe.payload.directions.forward.context = JSON.parse('{"__proto__":{"polluted":true}}');
    await expect(decodeShareEnvelope(await rawEnvelope({ protocolVersion: 2, ...unsafe }))).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
    const nested = globalEnvelope();
    for (let i = 0; i < 34; i += 1) nested.payload.directions.forward.context = { child: nested.payload.directions.forward.context };
    await expect(encodeShareEnvelope(nested)).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
    expect({}.polluted).toBeUndefined();
  });

  test("sparse arrays and non-JSON fields cannot produce an unreadable share", async () => {
    const input = globalEnvelope();
    const sparse = ["first", ,];
    sparse.extra = "not an array element";
    input.payload.directions.forward.context.items = sparse;
    await expect(encodeShareEnvelope(input)).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
    input.payload.directions.forward.context = { [Symbol("ignored")]: "hidden" };
    await expect(encodeShareEnvelope(input)).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
  });

  test("Global draft export preserves unknown references, mark/status counters and trait parameters without CN normalization", async () => {
    const state = createInitialState();
    state.sides.attacker.spiritId = "unknown-global-spirit";
    state.sides.attacker.nature = "unknown-global-nature";
    state.sides.attacker.displayIvs.physicalAttack = 120;
    state.sides.attacker.traitValues = { "global-counter": { stacks: 105, enabled: true } };
    state.sides.attacker.acquiredTraitIds = ["global-trait", "unknown-extra-trait"];
    state.sides.attacker.acquiredTraitValues = { "global-trait": { "global-option": ["first", "second"] } };
    state.sides.attacker.skills.single = { skillId: "unknown-global-skill", context: { "global-rule": { count: 102 } } };
    state.sides.attacker.skills.four = Array.from({ length: 5 }, (_, index) => `unknown-slot-${index}`);
    state.marks.attacker.positive = { id: "global-mark", stacks: 102, triggerCount: 103 };
    state.negativeStatuses.attacker = { "global-status": 104, electrified: 5 };
    const payload = selectConfigurationDraftInputs({ ...state, temporaryUiValue: true });
    expect(payload).toEqual(state);
    const input = { ...globalEnvelope(), payload };
    const first = await decodeShareEnvelope(await encodeShareEnvelope(input));
    const again = await decodeShareEnvelope(await encodeShareEnvelope({ ...first, payload: selectConfigurationDraftInputs(first.payload) }));
    expect(again.payload).toEqual(state);
    await expect(encodeShareEnvelope({ ...cnEnvelope(), payload: { ...state, versions: { data: "cn-data", rules: "cn-rules" } } })).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
  });

  test("Global draft IVs and slot counts remain structurally bounded without borrowing CN game limits", async () => {
    const input = globalEnvelope();
    for (const value of [-1, 0.5, Infinity]) {
      input.payload.sides.attacker.displayIvs.hp = value;
      await expect(encodeShareEnvelope(input)).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
    }
    input.payload.sides.attacker.displayIvs.hp = 120;
    input.payload.sides.attacker.skills.four = Array.from({ length: 33 }, () => null);
    await expect(encodeShareEnvelope(input)).rejects.toMatchObject({ code: "SHARE_SCHEMA" });
  });
});
