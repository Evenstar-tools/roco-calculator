import { expect, test } from "vitest";
import { diffText } from "../../src/features/balance-history/text-diff.js";

const marked = parts => parts.filter(part => part.changed).map(part => part.text);
const joined = parts => parts.map(part => part.text).join("");

test("数值整体标出，不拆成单个数字", () => {
  const diff = diffText("造成物伤，每次击败敌方，本技能威力永久+75。", "造成物伤，每次击败敌方，本技能威力永久+85。");
  expect(marked(diff.before)).toEqual(["+75"]);
  expect(marked(diff.after)).toEqual(["+85"]);
});

test("新增和删除的词组各自成段，原文逐字保留", () => {
  const before = "打断敌方时，被打断的技能进入2回合冷却。";
  const after = "打断对手技能时，获得双攻+30%，被打断的技能进入2回合冷却。";
  const diff = diffText(before, after);
  expect(marked(diff.before)).toEqual(["敌方"]);
  expect(marked(diff.after)).toEqual(["对手技能", "获得双攻+30%，"]);
  expect(joined(diff.before)).toBe(before);
  expect(joined(diff.after)).toBe(after);
});

test("几乎整段重写或缺一侧时不标记", () => {
  expect(marked(diffText("选择时获得一种随机印记。", "全队回复生命").after)).toEqual([]);
  expect(diffText("", "新内容").after).toEqual([{ text: "新内容", changed: false }]);
});

test("夹在两处改动之间的单个相同字并入改动", () => {
  const diff = diffText("使用技能后提升的速度+10，回合结束", "使用技能后降低的力量+10，回合结束");
  expect(marked(diff.before)).toEqual(["提升的速度"]);
  expect(marked(diff.after)).toEqual(["降低的力量"]);
});
