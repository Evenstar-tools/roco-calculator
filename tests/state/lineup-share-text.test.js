import { expect, test } from "vitest";
import shareText from "../fixtures/game-lineup-share.txt?raw";
import previous from "../fixtures/qiandao-s4-new-lineup.json";
import mapping from "../../public/data/lineup-code-map.json";
import snapshot from "../../data/snapshots/current.json";
import { decodeLineupCode, exportLineupCode, importLineupCode } from "../../src/state/lineup-code.js";

const code = "B~Gxf~~~H~C~BQBSBPayBM~bDBK~ax_K~bAjC~y7~~~G~C~BQBPBUayBM~ayGq~bDBo~bAi4~6f~~~J~E~BQBPBUbUFM~a5SC~a5S0~a5QA~6z~~~M~X~BQBPBUbWjy~bbfG~bbee~bAkI~6p~~~H~e~BSBPBTbRq0~ayJy~bRq-~bMzk~7A~~~P~W~BQBPBUa7sk~bbee~bWhm~ayEy~ZZC~FA~A~A~A~A~D~A~A~A~A~A~D~";

test("imports the complete escaped game share text, reading all fields from the code", () => {
  const team = importLineupCode(shareText, snapshot, mapping);
  expect(team.members.map(member => snapshot.spirits.find(spirit => spirit.id === member.spiritId).fullName)).toEqual(previous.memberNames);
  expect(team.members.map(member => member.skills.four.map(id => snapshot.skills.find(skill => skill.id === id).name))).toEqual(previous.skillNames);
  expect(team.members.map(member => member.bloodlineType)).toEqual(["ice", "ground", "electric", "martial", "ice", "ghost"]);
  expect(team.lineup).toEqual({ count: 6, mode: 5, magicId: 104002 });
  expect(exportLineupCode(team, snapshot, mapping).code).toBe(code);
  expect(decodeLineupCode(shareText)).toEqual(decodeLineupCode(code));
});

test("ignores contradictory prose and does not derive team fields or name from it", () => {
  const changed = shareText.replace("愿力强化", "进化之力").replace("巨噬针鼹", "喵喵").replace("冰系血脉", "火系血脉");
  expect(decodeLineupCode(changed + "\n说明 &name=不应使用的队名")).toEqual(decodeLineupCode(code));
});

test.each([code, code.replace(/[~_]/g, "\\$&"), `队伍\r\n${code}\r\n复制到游戏`, `# 队伍\n# ${code}\n# 粘贴到游戏`])("accepts bare, escaped, Windows newline and heading-wrapped code: %s", input => {
  expect(decodeLineupCode(input)).toEqual(decodeLineupCode(code));
});

test("rejects ambiguous multiple codes instead of choosing a team silently", () => {
  expect(() => decodeLineupCode(shareText + "\n" + previous.code)).toThrow("多个阵容码");
});

test.each([
  "队伍\n魔法：愿力强化\n巨噬针鼹：冰系血脉、力量增效\n请复制到游戏",
  `队伍\n${code.slice(0, -1)}\n请复制到游戏`,
  `队伍\n${code.slice(0, 120)}\n${code.slice(120)}\n请复制到游戏`,
  "说明".repeat(2100) + "\n" + code,
])("rejects missing, truncated, split and oversized input without guessing", input => {
  expect(() => decodeLineupCode(input)).toThrow();
});
