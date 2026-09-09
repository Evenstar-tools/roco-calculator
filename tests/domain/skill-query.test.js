import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { seasonChanges, skillLearners, unpackCatalog, familyIds, learnerFamilies } from "../../src/features/skill-query/catalog.js";
import { parseSkillSeasons } from "../../scripts/import-skill-query-seasons.mjs";

describe("技能查询赛季对比", () => {
  it("基础身份相同的形态分支合并，不重复展示地鼠家族", () => {
    const ids = familyIds([
      { id: "dry", baseName: "地鼠", variantName: "枯水", fullName: "地鼠（枯水）", evolutionChainNames: ["遁地鼠（枯水）"] },
      { id: "wet", baseName: "地鼠", variantName: "储水", fullName: "地鼠（储水）", evolutionChainNames: ["遁地鼠（储水）"] },
      { id: "dry3", fullName: "遁地鼠（枯水）" },
      { id: "wet3", fullName: "遁地鼠（储水）" },
    ]);
    expect(new Set(ids.values()).size).toBe(1);
  });
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
      { spiritId: "b", skillIds: ["s", "evolved-only"], acquisitions: { s: ["技能石"], "evolved-only": ["默认学习"] } },
      { spiritId: "d", skillIds: ["s"], acquisitions: { s: ["默认学习"] } },
    ] };
    expect(learnerFamilies(season, "s")).toHaveLength(2);
    const family = learnerFamilies(season, "s", "首领")[0];
    expect(family.representative.id).toBe("a");
    expect(family.members.map(s => s.id)).toEqual(["a", "b"]);
    expect(learnerFamilies(season, "s", "成体", "default")[0].representative.id).toBe("a");
    expect(learnerFamilies(season, "s", "幼体", "技能石")[0].representative.id).toBe("b");
    expect(learnerFamilies(season, "s", "", "血脉")).toEqual([]);
    expect(learnerFamilies(season, "evolved-only")[0].representative.id).toBe("b");
  });
  it("赛季来自 BWIKI 技能栏，拒绝缺失或相互冲突的字段", () => {
    const row = (season) => `<tr class="divsort" data-param6="${season}"><td></td><td><a title="疾风涡轮">疾风涡轮</a></td></tr>`;
    expect(parseSkillSeasons(`<table>${row("S2")}</table>`)).toEqual({ 疾风涡轮: "S2" });
    expect(() => parseSkillSeasons(`<table>${row("")}</table>`)).toThrow();
    expect(() => parseSkillSeasons(`<table>${row("S1")}${row("S2")}</table>`)).toThrow();
    const data = unpackCatalog(JSON.parse(readFileSync("public/data/skill-query/catalog.json", "utf8")));
    const wiki = JSON.parse(readFileSync("data/skill-query/bwiki-seasons.json", "utf8"));
    for (const season of data.seasons) for (const skill of season.skills) {
      if (wiki.records[skill.name]) expect(skill.introducedSeason, skill.name).toBe(wiki.records[skill.name]);
    }
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
  it("包含新技能的学习面和老精灵新学，但不混入新精灵的旧技能", () => {
    const previous = { skills: [{ id: "a" }, { id: "b" }], spirits: [{ id: "old" }], learnsets: [{ spiritId: "old", skillIds: ["a"] }] };
    const next = { skills: [...previous.skills, { id: "c" }], spirits: [{ id: "old" }, { id: "new" }], learnsets: [{ spiritId: "old", skillIds: ["a", "b", "c"] }, { spiritId: "new", skillIds: ["a", "c"] }] };
    const result = seasonChanges(previous, next);
    expect([...result.newSkillIds]).toEqual(["c"]);
    expect(result.gains).toEqual([{ spiritId: "old", skillIds: ["b", "c"] }, { spiritId: "new", skillIds: ["c"] }]);
  });
  it("历史学习面缺失时只展示确定的新技能，未确认学习者的新技能不伪造关系", () => {
    const previous = { skills: [{ id: "a" }], spirits: [{ id: "old" }], learnsets: [] };
    const next = { skills: [...previous.skills, { id: "b" }, { id: "pending" }], spirits: previous.spirits, learnsets: [{ spiritId: "old", skillIds: ["a", "b"] }] };
    expect(seasonChanges(previous, next).gains).toEqual([{ spiritId: "old", skillIds: ["b"] }]);
  });
  it("保留同一精灵的多种学习途径并还原后续赛季数据", () => {
    const packed = { schemaVersion: 1, currentSeason: "S5", seasons: [{ id: "S5", skills: [{ id: "a" }], spirits: [{ id: "s", fullName: "精灵" }], methodTexts: ["默认学习", "技能石"], relations: [[0, [[0, 0, 1]]]] }] };
    const data = unpackCatalog(packed);
    expect(skillLearners(data.seasons[0], "a")).toEqual([{ id: "s", fullName: "精灵", methods: ["默认学习", "技能石"] }]);
    expect(() => unpackCatalog({ schemaVersion: 2 })).toThrow();
  });
});
