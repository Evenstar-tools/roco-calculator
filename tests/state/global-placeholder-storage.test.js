// @vitest-environment jsdom

import { afterEach, expect, test } from "vitest";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";
import { createProductInitialState } from "../../src/state/calculator-session.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { createTeamMember, createTeamMemberFromSide, createTeamMemberFromSpiritConfig, teamPresetsRepository } from "../../src/state/team-presets.js";

afterEach(() => localStorage.clear());

test("Global personal configurations restore known references and preserve unknown values without repair defaults", () => {
  const snapshot = globalPlaceholderCatalog();
  const side = { ...createProductInitialState(snapshot).sides.attacker, spiritId: snapshot.spirits[0].id,
    nature: "future-nature", traitValues: { future: { enabled: false } }, needsRepair: true, repairReason: "previously missing" };
  side.displayIvs.hp = 72;
  side.skills.four[0] = { skillId: snapshot.skills[0].id, context: { custom: 42, rainWeather: false } };
  const repo = spiritConfigsRepository({ serverId: "global" });
  repo.save(repo.load(snapshot), side, snapshot);
  const restored = spiritConfigsRepository({ serverId: "global" }).load(snapshot);
  expect(restored.configs[side.spiritId]).toMatchObject({ nature: side.nature, displayIvs: side.displayIvs, skills: side.skills, traitValues: side.traitValues });
  expect(restored.configs[side.spiritId]).not.toHaveProperty("needsRepair");
  expect(repo.clearIncomplete(restored, snapshot)).toEqual(restored);
  const unknown = { ...side, spiritId: "cn-placeholder:missing", skills: { single: null, four: ["future-skill"] } };
  repo.save(restored, unknown, snapshot);
  const pending = spiritConfigsRepository({ serverId: "global" }).load(snapshot).configs[unknown.spiritId];
  expect(pending).toMatchObject({ spiritId: unknown.spiritId, nature: unknown.nature, displayIvs: unknown.displayIvs, needsRepair: true });
  expect(pending.skills.four).toEqual(["future-skill"]);
});

test("Global teams start unset, preserve personal nulls and never auto-repair lineup IVs on refresh", () => {
  const snapshot = globalPlaceholderCatalog();
  const member = createTeamMember(snapshot, snapshot.spirits[0].id);
  expect(member).toMatchObject({ natureId: null, skills: { single: null, four: [null, null, null, null] } });
  expect(Object.values(member.displayIvs)).toEqual(Array(6).fill(null));
  member.skills.four[0] = { skillId: snapshot.skills[0].id, context: { custom: 42, rainWeather: false } };
  member.ivsPending = true;
  member.lineupSource = { talents: [79, 80, 81] };
  member.needsRepair = true;
  member.repairReason = "previously missing";
  const repo = teamPresetsRepository({ serverId: "global", idFactory: () => "global-test-team" });
  const created = repo.create(repo.load(snapshot), "草稿队伍");
  const saved = repo.updateMember(created, "global-test-team", 0, member);
  const refreshed = teamPresetsRepository({ serverId: "global" }).load(snapshot).teams[0].members[0];
  expect(refreshed).toMatchObject({ natureId: null, displayIvs: member.displayIvs, skills: member.skills, ivsPending: true, lineupSource: member.lineupSource });
  expect(refreshed).not.toHaveProperty("needsRepair");
  const unknown = { ...member, spiritId: "cn-placeholder:missing" };
  repo.updateMember(saved, "global-test-team", 1, unknown);
  expect(teamPresetsRepository({ serverId: "global" }).load(snapshot).teams[0].members[1]).toMatchObject({ spiritId: unknown.spiritId, displayIvs: unknown.displayIvs, skills: unknown.skills, needsRepair: true });
  const side = { ...createProductInitialState(snapshot).sides.attacker, spiritId: member.spiritId, nature: "future-nature" };
  for (const converted of [createTeamMemberFromSide(side, { serverId: "global" }), createTeamMemberFromSpiritConfig(side, { serverId: "global" })]) {
    expect(converted.natureId).toBe("future-nature");
    expect(converted.displayIvs).toEqual(side.displayIvs);
    expect(converted).not.toHaveProperty("nature");
  }
});

test("known reference IDs do not make incomplete or unknown-memory archives usable", () => {
  const snapshot = globalPlaceholderCatalog();
  const side = { ...createProductInitialState(snapshot).sides.attacker, spiritId: snapshot.spirits[0].id };
  side.skills.single = { skillId: snapshot.skills[0].id, memoryBySkill: { "future-skill": { context: { custom: 42 } } } };
  const repo = spiritConfigsRepository({ serverId: "global" });
  repo.save(repo.load(snapshot), side, snapshot);
  expect(repo.load(snapshot).configs[side.spiritId]).toMatchObject({ needsRepair: true, skills: side.skills });
  repo.save(repo.load(snapshot), { spiritId: snapshot.spirits[1].id, custom: { preserved: true } }, snapshot);
  expect(repo.load(snapshot).configs[snapshot.spirits[1].id]).toMatchObject({ needsRepair: true, custom: { preserved: true } });
  const teams = teamPresetsRepository({ serverId: "global", idFactory: () => "invalid-team" });
  const created = teams.create(teams.load(snapshot), "草稿");
  teams.updateMember(created, "invalid-team", 0, { spiritId: snapshot.spirits[0].id, custom: 7 });
  expect(teams.load(snapshot).teams[0].members[0]).toMatchObject({ spiritId: snapshot.spirits[0].id, custom: 7, needsRepair: true });
});
