import { expect, test } from "vitest";
import { parseTeamDraft, serializeTeamDraft, TEAM_DRAFT_MAX_BYTES } from "../../src/state/team-draft-exchange.js";
import { createEmptyTeam, createTeamMember, teamPresetsRepository } from "../../src/state/team-presets.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";

const snapshot = globalPlaceholderCatalog();
function draft() {
  const team = createEmptyTeam("中文占位队伍", { idFactory: () => "source-team" });
  team.members[0] = createTeamMember(snapshot, snapshot.spirits[0].id);
  team.members[0].skills.four[0] = { skillId: snapshot.skills[0].id, context: { custom: 42, flag: false } };
  team.members[1] = { ...createTeamMember(snapshot, snapshot.spirits[1].id), spiritId: "future:unknown", natureId: "future-nature", future: { value: null } };
  team.members[1].displayIvs.hp = 72.5;
  team.future = { rain: 42, thunder: true, nested: [null, "中文"] };
  return team;
}
function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
}

test("Global team draft roundtrip preserves Chinese IDs, unset values and unknown fields, then imports as a new isolated team", () => {
  const source = draft();
  const text = serializeTeamDraft(source);
  expect(JSON.parse(text)).toMatchObject({ serverId: "global", schemaVersion: 1, versions: { game: null, data: null, rules: null } });
  expect(parseTeamDraft(text)).toEqual(source);
  const storage = memoryStorage();
  const repository = teamPresetsRepository({ storage, serverId: "global", idFactory: () => "new-team" });
  const before = { ...repository.load(snapshot), activeTeamId: source.id, teams: [source] };
  const saved = repository.importTeam(before, parseTeamDraft(text));
  expect(saved.teams).toHaveLength(2);
  expect(saved.teams[0]).toEqual(source);
  expect(saved.teams[1]).toMatchObject({ id: "new-team", name: source.name, members: source.members, future: source.future });
  const loaded = teamPresetsRepository({ storage, serverId: "global" }).load(snapshot);
  expect(loaded.teams[1].members[0]).toEqual(source.members[0]);
  expect(loaded.teams[1].members[1]).toMatchObject({ ...source.members[1], needsRepair: true });
  expect(teamPresetsRepository({ storage, serverId: "cn" }).load().teams).toEqual([]);
});

test.each([
  ["foreign server", (value) => { value.serverId = "cn"; }, "TEAM_DRAFT_SERVER_MISMATCH"],
  ["unknown format", (value) => { value.format = "game-native"; }, "TEAM_DRAFT_FORMAT"],
  ["unknown schema", (value) => { value.schemaVersion = 2; }, "TEAM_DRAFT_VERSION"],
  ["unverified version", (value) => { value.versions.data = "cn-version"; }, "TEAM_DRAFT_VERSION"],
  ["missing version", (value) => { delete value.versions.game; }, "TEAM_DRAFT_VERSION"],
  ["wrong slots", (value) => { value.payload.members.pop(); }, "TEAM_DRAFT_INVALID"],
  ["wrong IV", (value) => { value.payload.members[0].displayIvs.hp = "60"; }, "TEAM_DRAFT_INVALID"],
  ["wrong skills", (value) => { value.payload.members[0].skills.four = {}; }, "TEAM_DRAFT_INVALID"],
  ["unsafe field", (value) => { value.payload.future = JSON.parse('{"__proto__":{}}'); }, "TEAM_DRAFT_INVALID"],
])("rejects %s before callers can save", (_label, change, code) => {
  const value = JSON.parse(serializeTeamDraft(draft())); change(value);
  expect(() => parseTeamDraft(JSON.stringify(value))).toThrow(expect.objectContaining({ code }));
});

test("rejects malformed and oversized input and never exports a CN draft", () => {
  expect(() => parseTeamDraft("{broken")).toThrow(expect.objectContaining({ code: "TEAM_DRAFT_JSON" }));
  expect(() => parseTeamDraft(" ".repeat(TEAM_DRAFT_MAX_BYTES + 1))).toThrow(expect.objectContaining({ code: "TEAM_DRAFT_TOO_LARGE" }));
  expect(() => serializeTeamDraft(draft(), { serverId: "cn" })).toThrow(expect.objectContaining({ code: "TEAM_DRAFT_SERVER_MISMATCH" }));
});
