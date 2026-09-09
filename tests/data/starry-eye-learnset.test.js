import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { matchesSource, querySpiritFamilies, spiritSkills } from "../../src/features/skill-query/query-model.js";
import { getLegalSkillIds } from "../../src/domain/skill-loadout.js";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const evidence = read("data/reviewed/starry-eye-learnset-2026-09-09.json");
const snapshot = read("data/snapshots/current.json");
const season = unpackCatalog(read("public/data/skill-query/catalog.json")).seasons.find(({ id }) => id === "S4");

test("星星眼截图的 44 个技能按来源完整收录，保留原四槽预设", () => {
  const entry = snapshot.learnsets.find(({ spiritId }) => spiritId === evidence.spiritId);
  expect(evidence.groups.map(({ skills }) => skills.length)).toEqual([13, 18, 13]);
  expect(entry.skillIds).toHaveLength(44);
  expect(new Set(entry.skillIds).size).toBe(44);
  expect(getLegalSkillIds(snapshot, evidence.spiritId)).toEqual(entry.skillIds);
  expect(entry.defaultSkillIds).toEqual([
    "skill_38827e39dbdda074", "skill_5f29d7618631421f", "skill_de420bb66be86bf2", "skill_b1f12cdc4830276c",
  ]);
  for (const group of evidence.groups) {
    const category = group.category === "默认" ? "default" : group.category;
    const names = snapshot.skills.filter(({ id }) => entry.acquisitions[id]?.some((text) => matchesSource(text, category))).map(({ name }) => name);
    expect(names.sort()).toEqual([...group.skills].sort());
    expect(entry.sources.some(({ revision }) => revision === 7271)).toBe(true);
  }
});

test("生成目录支持正反查询和三类来源筛选，不误报旧技能为赛季新技能", () => {
  const rows = spiritSkills(season, evidence.spiritId);
  expect(rows).toHaveLength(44);
  for (const group of evidence.groups) {
    const filter = group.category === "默认" ? "default" : group.category;
    expect(rows.filter(({ methods }) => methods.some((text) => matchesSource(text, filter))).map(({ name }) => name).sort())
      .toEqual([...group.skills].sort());
    for (const name of group.skills) {
      const skill = rows.find((row) => row.name === name);
      expect(querySpiritFamilies(season, { skillIds: [skill.id], source: filter }).some(({ members }) =>
        members.some(({ id }) => id === evidence.spiritId)), name).toBe(true);
    }
  }
  expect(rows.find(({ name }) => name === "防御").introducedSeason).not.toBe("S4");
  const ids = ["错乱", "离子震荡", "引力偏转", "无畏之心"].map((name) => rows.find((row) => row.name === name).id);
  expect(querySpiritFamilies(season, { skillIds: ids }).some(({ members }) =>
    members.some(({ id }) => id === evidence.spiritId))).toBe(true);
});
