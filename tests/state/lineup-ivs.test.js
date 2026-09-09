import { expect, test } from "vitest";
import { inspectLineupIvs, recommendLineupIvs } from "../../src/state/lineup-ivs.js";
import { importLineupCode, exportLineupCode, decodeLineupCode, encodeLineupCode } from "../../src/state/lineup-code.js";
import snapshot from "../../data/snapshots/current.json";
import mapping from "../../public/data/lineup-code-map.json";
import fixture from "../fixtures/qiandao-lineup.json";

test.each([
  [[null, null, null], "missing"], [[1, 2, 6], "selected"], [[null, 4, 5], "selected"],
  [[80, 80, 80], "unknown"], [[0, null, null], "unknown"], [[1, 1, 2], "unknown"], [[7, 2, 3], "unknown"],
])("classifies source selections %j without guessing", (ids, status) => expect(inspectLineupIvs(ids).status).toBe(status));

function missingMember() {
  const member = importLineupCode(fixture.code, snapshot, mapping).members[0];
  member.lineupSource.talents = [null, null, null];
  return member;
}

test("restores valid choices at the documented 60 convention and preserves exact original code", () => {
  const raw = decodeLineupCode(fixture.code);
  raw.members[0].talents = [6, 1, 2];
  const code = encodeLineupCode(raw);
  const team = importLineupCode(code, snapshot, mapping);
  expect(team.members[0].displayIvs).toMatchObject({ hp: 60, physicalAttack: 60, speed: 60, magicalAttack: 0 });
  expect(team.members[0].ivsPending).toBeUndefined();
  expect(exportLineupCode(team, snapshot, mapping).code).toBe(code);
});

test("prefers same spirit and nature preset, breaking ties by skill overlap", () => {
  const member = missingMember();
  const values = inspectLineupIvs([1, 4, 6]).values;
  const preset = { spiritId: member.spiritId, natureId: member.natureId, skills: member.skills.four, displayIvs: values };
  expect(recommendLineupIvs(member, snapshot, [preset])).toEqual({ values, reason: "同精灵同性格预设" });
});

test("nature and skills suggest three stats without reducing-stat investment; manual and unknown values stay untouched", () => {
  const member = missingMember();
  const recommendation = recommendLineupIvs(member, snapshot);
  expect(Object.values(recommendation.values).filter(value => value === 60)).toHaveLength(3);
  expect(recommendation.values.magicalAttack).toBe(0);
  expect(recommendation.values.speed).toBe(60);
  member.displayIvs.hp = 30;
  expect(recommendLineupIvs(member, snapshot)).toBeNull();
  member.displayIvs.hp = 0;
  member.lineupSource.talents = [80, 80, 80];
  expect(recommendLineupIvs(member, snapshot)).toBeNull();
});

test("adopted and manual selections export, but concrete IV amounts are not serialized", () => {
  const team = importLineupCode(fixture.code, snapshot, mapping);
  team.members[0].displayIvs = inspectLineupIvs([1, 2, 6]).values;
  team.members[0].displayIvs.hp = 30;
  const raw = decodeLineupCode(exportLineupCode(team, snapshot, mapping).code);
  expect(raw.members[0].talents).toEqual([1, 2, 6]);
  expect(raw.members[1].talents).toEqual([80, 80, 80]);
  team.members[0].displayIvs.magicalAttack = 60;
  expect(() => exportLineupCode(team, snapshot, mapping)).toThrow("超过三项");
});
