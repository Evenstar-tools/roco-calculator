import { expect, test } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { buildSpiritFamilyIndex } from "../../src/components/spirit-family.js";
import { getBattleFormChoices } from "../../src/domain/battle-form.js";

const index = buildSpiritFamilyIndex(snapshot.spirits);
const find = name => snapshot.spirits.find(spirit => spirit.fullName === name);

test.each([
  ["抹茶布丁", ["果冻", "抹茶布丁", "椰浆布丁", "熔岩布丁"]],
  ["水泡壳", ["水泡壳", "水泡壳（蜕皮时的样子）"]],
  ["卡瓦重（草地附近的样子）", ["草地", "火山", "沙地", "雪山"].map(place => `卡瓦重（${place}附近的样子）`)],
  ["海枝枝（碧蓝珊瑚）", ["碧蓝珊瑚", "杏黄百合", "洋红沙丁", "翠绿纶布"].map(form => `海枝枝（${form}）`)],
])("%s 的关联互通，不只从低阶能找到分支", (name, expected) => {
  const family = index.get(find(name).id);
  expect(family.map(spirit => spirit.fullName)).toEqual(expect.arrayContaining(expected));
  for (const member of family) expect(index.get(member.id)).toBe(family);
  expect(new Set(family.map(spirit => spirit.id)).size).toBe(family.length);
  expect(family.some(spirit => spirit.fullName === "迪莫")).toBe(false);
});

test("关联发现不放宽萌化路径，也不改原始数据", () => {
  const before = JSON.stringify(snapshot.spirits);
  buildSpiritFamilyIndex(snapshot.spirits);
  expect(JSON.stringify(snapshot.spirits)).toBe(before);
  const legal = getBattleFormChoices(snapshot.spirits, { spiritId: find("抹茶布丁").id });
  expect(legal.map(spirit => spirit.fullName)).toEqual(["果冻", "抹茶布丁"]);
});

test("不按相似名称或缺失字段误并，无效引用安全忽略", () => {
  const spirits = [
    { id: "a", baseName: "小鱼", evolutionChainIds: ["missing"] },
    { id: "b", baseName: "小鱼王" },
    { id: "c" }, { id: "d" },
  ];
  const families = buildSpiritFamilyIndex(spirits);
  for (const spirit of spirits) expect(families.get(spirit.id)).toEqual([spirit]);
});
