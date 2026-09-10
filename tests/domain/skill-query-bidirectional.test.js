import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { matchesSource, querySpiritFamilies, spiritSkills } from "../../src/features/skill-query/query-model.js";

const season = {
  spirits: [{ id: "a", fullName: "幼体", familyId: "family" }, { id: "b", fullName: "成体", familyId: "family" }, { id: "c", fullName: "独立" }],
  skills: [{ id: "x", name: "技能甲" }, { id: "y", name: "技能乙" }, { id: "z", name: "未知" }],
  learnsets: [
    { spiritId: "a", skillIds: ["x"], acquisitions: { x: ["解锁：Lv.2"] } },
    { spiritId: "b", skillIds: ["y"], acquisitions: { y: ["技能石"] } },
    { spiritId: "c", skillIds: ["x", "y", "z"], acquisitions: { x: ["默认学习", "技能石", "技能石"], y: ["火血脉"], z: ["等级待确认"] } },
  ],
};
test("先判断同一形态全部可学，再按家族聚合，不能跨形态凑技能", () => {
  expect(querySpiritFamilies(season, { skillIds: ["x", "y"] }).map((family) => family.representative.id)).toEqual(["c"]);
  expect(querySpiritFamilies(season, { skillIds: ["y"], query: "幼体" })[0].representative.id).toBe("b");
  expect(querySpiritFamilies(season, { skillIds: ["x", "y"], source: "default" })).toEqual([]);
  expect(querySpiritFamilies(season, { skillIds: ["missing"] })).toEqual([]);
});
test("精灵查询复用别名、拼音、图鉴号，优先定位命中的具体形态", () => {
  const metadata = [{ id: "b", aliases: ["玩家昵称"], pinyin: "chengti", initials: "ct", dexNo: "123" }];
  for (const query of ["玩家昵称", "CHENGTI", "ct", "123", "成体"]) {
    expect(querySpiritFamilies(season, { query, metadata })[0].representative.id).toBe("b");
  }
});
test("完整学习面不受技能查询条件影响，多来源去重，未知不冒充默认", () => {
  const rows = spiritSkills(season, "c");
  expect(rows.map((skill) => skill.id)).toEqual(["x", "y", "z"]);
  expect(rows[0].methods).toEqual(["默认学习", "技能石"]);
  expect(matchesSource("等级待确认", "default")).toBe(false);
  expect(matchesSource("解锁：Lv.1", "default")).toBe(true);
  expect(spiritSkills(season, "missing")).toEqual([]);
});

test("家族反查默认最终普通形态，不选首领，不使用无法同时学习的终阶", () => {
  const data = { spirits: [
    { id: "a", fullName: "幼体", stage: "一阶", familyId: "f" },
    { id: "b", fullName: "终阶", stage: "三阶", familyId: "f" },
    { id: "c", fullName: "首领", stage: "首领", familyId: "f" },
  ], learnsets: [{ spiritId: "a", skillIds: ["x", "y"] }, { spiritId: "b", skillIds: ["x"] }, { spiritId: "c", skillIds: ["x"] }] };
  expect(querySpiritFamilies(data, { skillIds: ["x"] })[0].representative.id).toBe("b");
  expect(querySpiritFamilies(data, { skillIds: ["x", "y"] })[0].representative.id).toBe("a");
  expect(querySpiritFamilies(data, { query: "幼体" })[0].representative.id).toBe("a");
});
test("真实 S4 掠影与月蚀交集只含银月狼王，完整学习表包含其他技能", () => {
  const catalog = unpackCatalog(JSON.parse(readFileSync("public/data/skill-query/catalog.json", "utf8")));
  const current = catalog.seasons.find((item) => item.id === "S4");
  const ids = ["掠影", "月蚀"].map((name) => current.skills.find((skill) => skill.name === name).id);
  const families = querySpiritFamilies(current, { skillIds: ids });
  expect(families.flatMap((family) => family.members.map((spirit) => spirit.fullName))).toEqual(["银月狼王"]);
  const rows = spiritSkills(current, families[0].representative.id);
  expect(rows.length).toBeGreaterThan(2);
  expect(rows.some((skill) => skill.name === "重组")).toBe(true);
  expect(rows.find((skill) => skill.name === "月蚀")).toMatchObject({ cost: 5, basePower: 130, category: "physical" });
  const old = catalog.seasons.find((item) => item.id === "S3");
  expect(querySpiritFamilies(old, { skillIds: ids })).toEqual([]);
});
