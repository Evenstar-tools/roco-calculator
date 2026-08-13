import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildSkillCategoryOptions,
  filterSkillChoices,
  normalizeSkillQuery,
} from "../src/view-models/skill-filters.js";

const choices = [
  {
    basePower: 60,
    category: "magical",
    cost: 1,
    id: "flash",
    name: "闪光",
    searchText: "闪光|光|magical|shanguang|sg",
    type: "光",
  },
  {
    basePower: 65,
    category: "physical",
    cost: 1,
    id: "slam",
    name: "猛烈撞击",
    searchText: "猛烈撞击|普通|physical|mengliezhuangji|mlzj",
    type: "普通",
  },
  {
    basePower: 0,
    category: "status",
    cost: 0,
    id: "boost",
    name: "魔法增效",
    type: "普通",
  },
  {
    basePower: 0,
    category: "defense",
    cost: 1,
    id: "guard",
    name: "防御",
    type: "普通",
  },
  {
    basePower: 90,
    category: "dual",
    cost: 2,
    id: "future",
    name: "未来技能",
    type: "幻",
  },
  {
    basePower: 80,
    category: "dual",
    cost: 3,
    id: "wish-power-light",
    name: "愿力冲击",
    pickerVisibility: "search-only",
    searchText: "愿力冲击|yuanlichongji|ylcj",
    type: "光",
  },
];

describe("skill category filters", () => {
  test("builds ordered non-empty categories and keeps unknown skills reachable", () => {
    expect(buildSkillCategoryOptions(choices)).toEqual([
      { count: 5, key: "all", label: "全部" },
      { count: 1, key: "physical", label: "物理" },
      { count: 1, key: "magical", label: "魔法" },
      { count: 1, key: "status", label: "变化" },
      { count: 1, key: "defense", label: "防御" },
      { count: 1, key: "other", label: "其他" },
    ]);
  });

  test("keeps generated Wish Power out of browsing but exposes exact and pinyin search", () => {
    expect(filterSkillChoices(choices, {
      category: "all",
      query: "",
    }).map((skill) => skill.id)).not.toContain("wish-power-light");
    for (const query of ["愿力冲击", "yuanlichongji", "ylcj"]) {
      expect(filterSkillChoices(choices, {
        category: "all",
        query,
      }).map((skill) => skill.id)).toEqual(["wish-power-light"]);
    }
  });

  test("combines category and normalized Chinese, type, pinyin and initials search", () => {
    expect(normalizeSkillQuery(" 光 系 ")).toBe("光系");
    for (const query of ["闪光", "光", "光系", "shanguang", "sg"]) {
      expect(filterSkillChoices(choices, {
        category: "magical",
        query,
      }).map((skill) => skill.id)).toEqual(["flash"]);
    }
    expect(filterSkillChoices(choices, {
      category: "physical",
      query: "光",
    })).toEqual([]);
    expect(filterSkillChoices(choices, {
      category: "other",
      query: "",
    }).map((skill) => skill.id)).toEqual(["future"]);
  });

  test("classifies the bundled 53-skill Dimo learnset by the real project data", () => {
    const runtime = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "src/data/bundled-runtime.json",
    ), "utf8"));
    const dimo = runtime.spirits.find((spirit) => spirit.fullName === "迪莫");
    const learnset = runtime.learnsets.find((entry) =>
      entry.spiritId === dimo.id
    );
    const skillsById = new Map(runtime.skills.map((skill) => [skill.id, skill]));
    const dimoSkills = learnset.skillIds.map((id) => skillsById.get(id));

    expect(buildSkillCategoryOptions(dimoSkills)).toEqual([
      { count: 53, key: "all", label: "全部" },
      { count: 24, key: "physical", label: "物理" },
      { count: 19, key: "magical", label: "魔法" },
      { count: 8, key: "status", label: "变化" },
      { count: 2, key: "defense", label: "防御" },
    ]);
  });
});
