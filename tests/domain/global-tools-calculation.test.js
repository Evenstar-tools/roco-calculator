import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { buildDeerInput, createDeerSetup, DEER_VARIANTS, evaluateDeerAttack } from "../../src/features/deer/deer-model.js";
import { buildDamageComparisonInput, createSkillDamageRanking } from "../../src/domain/skill-damage-ranking.js";
import { createTeamMember } from "../../src/state/team-presets.js";

const snapshot = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));

test("Global S3 deer and follow-up use the Global environment with canonical mechanism names", () => {
  const setup = createDeerSetup(snapshot);
  const input = buildDeerInput(snapshot, setup, DEER_VARIANTS[0], 1);
  expect(input.serverId).toBe("global");
  expect(snapshot.spirits.find(entry => entry.id === input.sides.defender.spiritId).fullName).toBe("魔力猫");
  const result = evaluateDeerAttack(snapshot, setup, DEER_VARIANTS[0], 1);
  expect(result.first.status).toBe("exact");
  expect(result.damage).toBeGreaterThan(0);
  expect(result.followup?.status).toBe("exact");
});

test("Global damage ranking explicitly passes the server and keeps canonical input unchanged", async () => {
  const setup = createDeerSetup(snapshot);
  const state = buildDeerInput(snapshot, setup, DEER_VARIANTS[0], 1);
  delete state.serverId; // App state historically has no server discriminator.
  const before = JSON.stringify(state);
  const spirit = snapshot.spirits.find(entry => entry.fullName === "魔力猫");
  const input = buildDamageComparisonInput({ snapshot, state, spirit });
  expect(input.serverId).toBe("global");
  expect(calculateMatchup(snapshot, input).forward.selectedResult.status).toBe("exact");
  const reduced = { ...snapshot, spirits: snapshot.spirits.filter(entry => [state.sides.attacker.spiritId, spirit.id].includes(entry.id)) };
  const ranking = await createSkillDamageRanking({ snapshot: reduced, state, scope: "all" });
  expect(ranking.issue).toBeNull();
  expect(ranking.rows).toHaveLength(2);
  expect(ranking.excluded).toHaveLength(0);
  expect(JSON.stringify(state)).toBe(before);
});

test("released Global team members get default four skills while legacy drafts remain blank", () => {
  const spirit = snapshot.spirits.find(entry => entry.fullName === "波普鹿");
  const member = createTeamMember(snapshot, spirit.id);
  expect(member.natureId).toBe("neutral");
  expect(Object.values(member.displayIvs)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(member.skills.four.filter(Boolean)).toHaveLength(4);
  expect(member.skills.single).toBe(member.skills.four[0]);
  const draft = createTeamMember({ ...snapshot, meta: { ...snapshot.meta, id: null } }, spirit.id);
  expect(draft.natureId).toBeNull();
  expect(draft.skills.four).toEqual([null, null, null, null]);
});
