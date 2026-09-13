import { expect, test } from "vitest";
import mapping from "../../public/data/lineup-code-map.json";
import snapshot from "../../data/snapshots/current.json";
import fixture from "../fixtures/qiandao-s4-new-lineup.json";
import { decodeLineupCode, exportLineupCode, importLineupCode } from "../../src/state/lineup-code.js";

test("imports the real S4 code with all six spirits and 24 skills and preserves the code", () => {
  const team = importLineupCode(fixture.code, snapshot, mapping);
  expect(team.members.map(member => snapshot.spirits.find(spirit => spirit.id === member.spiritId).fullName)).toEqual(fixture.memberNames);
  expect(team.members.map(member => member.skills.four.map(id => snapshot.skills.find(skill => skill.id === id).name))).toEqual(fixture.skillNames);
  expect(team.lineup).toEqual({ count: 6, mode: 5, magicId: 104002 });
  const exported = exportLineupCode(team, snapshot, mapping);
  expect(exported.code).toBe(fixture.code);
  expect(importLineupCode(exported.url, snapshot, mapping)).toEqual(team);
});

test("exports new spirits and Moon Eclipse without relying on preserved source IDs", () => {
  const team = importLineupCode(fixture.code, snapshot, mapping);
  for (const index of [3, 5]) {
    delete team.members[index].lineupSource;
    // 新建成员只携带本次新增映射的技能，避免其他同名技能的游戏 ID 歧义。
    team.members[index].skills.four = [null, index === 3 ? "skill_befd3ebf2018d7a8" : null, null, null];
  }
  const raw = decodeLineupCode(exportLineupCode(team, snapshot, mapping).code);
  expect(raw.members[3].spriteId).toBe(3763);
  expect(raw.members[5].spriteId).toBe(3776);
  expect(raw.members[3].skills[1]).toBe(7190470);
});
