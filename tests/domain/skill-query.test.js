import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { seasonChanges, skillLearners, unpackCatalog, familyIds, learnerFamilies } from "../../src/features/skill-query/catalog.js";

describe("技能查询赛季对比", () => {
  it("单向进化链合为一家，代表必须能学，途径筛选不混淆形态", () => {
    const spirits = [
      { id: "a", fullName: "幼体", stage: "一阶", evolutionChainNames: ["成体", "首领"] },
      { id: "b", fullName: "成体", stage: "三阶" },
      { id: "c", fullName: "首领", stage: "首领" },
      { id: "d", fullName: "幼体异种", stage: "三阶" },
    ];
    const ids = familyIds(spirits);
    const season = { spirits: spirits.map(s => ({ ...s, familyId: ids.get(s.id) })), learnsets: [
      { spiritId: "a", skillIds: ["s"], acquisitions: { s: ["默认学习"] } },
      { spiritId: "b", skillIds: ["s"], acquisitions: { s: ["技能石"] } },
      { spiritId: "d", skillIds: ["s"], acquisitions: { s: ["默认学习"] } },
    ] };
    expect(learnerFamilies(season, "s")).toHaveLength(2);
    const family = learnerFamilies(season, "s", "首领")[0];
    expect(family.representative.id).toBe("b");
    expect(family.members.map(s => s.id)).toEqual(["a", "b"]);
    expect(learnerFamilies(season, "s", "成体", "default")[0].representative.id).toBe("a");
    expect(learnerFamilies(season, "s", "", "血脉")).toEqual([]);
  });
  it("实际压缩资源完整保留 S3 源表学习面，不误报为新赛季获得", () => {
    const read = (path) => JSON.parse(readFileSync(path, "utf8"));
    const data = unpackCatalog(read("public/data/skill-query/catalog.json"));
    const source = read("data/skill-query/s3-source.json");
    const baseline = data.seasons.find(({ id }) => id === "S3");
    const normalize = (name) => name.replace(/·本来的样子$/, "").replace(/·黑化的样子$/, "").replace(/·(.+)$/, "（$1）");
    for (const record of source.skills) {
      const skill = baseline.skills.find(({ name }) => name === record.name);
      expect(skill, record.name).toBeDefined();
      const learners = skillLearners(baseline, skill.id);
      for (const name of record.learners) {
        expect(learners.some(({ fullName }) => fullName === normalize(name)), `${record.name}: ${name}`).toBe(true);
      }
    }
    for (const season of data.seasons) {
      expect(new Set(season.skills.map(({ id }) => id)).size).toBe(season.skills.length);
      expect(season.learnsets.every(({ skillIds }) => skillIds.every((id) => season.skills.some((skill) => skill.id === id)))).toBe(true);
    }
    const current = data.seasons.find(({ id }) => id === data.currentSeason);
    expect(seasonChanges(current, { ...current, id: "S5" }).gains).toEqual([]);
    expect(seasonChanges(current, { ...current, id: "S5" }).newSkillIds.size).toBe(0);
  });
  it("同时识别新技能和老精灵新增旧技能，排除新精灵", () => {
    const previous = { skills: [{ id: "a" }, { id: "b" }], spirits: [{ id: "old" }], learnsets: [{ spiritId: "old", skillIds: ["a"] }] };
    const next = { skills: [...previous.skills, { id: "c" }], spirits: [{ id: "old" }, { id: "new" }], learnsets: [{ spiritId: "old", skillIds: ["a", "b", "c"] }, { spiritId: "new", skillIds: ["a", "c"] }] };
    const result = seasonChanges(previous, next);
    expect([...result.newSkillIds]).toEqual(["c"]);
    expect(result.gains).toEqual([{ spiritId: "old", skillIds: ["b", "c"] }]);
  });
  it("保留同一精灵的多种学习途径并还原后续赛季数据", () => {
    const packed = { schemaVersion: 1, currentSeason: "S5", seasons: [{ id: "S5", skills: [{ id: "a" }], spirits: [{ id: "s", fullName: "精灵" }], methodTexts: ["默认学习", "技能石"], relations: [[0, [[0, 0, 1]]]] }] };
    const data = unpackCatalog(packed);
    expect(skillLearners(data.seasons[0], "a")).toEqual([{ id: "s", fullName: "精灵", methods: ["默认学习", "技能石"] }]);
    expect(() => unpackCatalog({ schemaVersion: 2 })).toThrow();
  });
});
