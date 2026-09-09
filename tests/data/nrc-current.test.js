import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { applyNrcCurrent } from "../../scripts/bwiki/apply-nrc-current.mjs";
import { parseLuaData } from "../../scripts/bwiki/parse-lua-data.mjs";
import { applyS4Manual } from "../../scripts/bwiki/apply-s4-manual.mjs";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { matchesSource, querySpiritFamilies } from "../../src/features/skill-query/query-model.js";
import { getTraitEffectRule, resolveTraitEffectRule } from "../../src/domain/trait-effects.js";
import { calculateMatchup } from "../../src/domain/calculate.js";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const current = read("data/snapshots/current.json");
const evidence = read("data/reviewed/nrc-2026-09-10.json");
const season = unpackCatalog(read("public/data/skill-query/catalog.json")).seasons.find(({ id }) => id === "S4");

describe("新站正式资料全量回读", () => {
  test("622 个精灵的字段、特性与学习途径逐项匹配固定版本", () => {
    expect(current.spirits).toHaveLength(622);
    expect(season.skills).toHaveLength(579);
    expect(current.traits).toHaveLength(242);
    const byName = new Map(current.skills.map((skill) => [skill.name, skill.id]));
    const sourceSkills = new Map(evidence.skills.map((skill) => [skill.id, skill]));
    for (const raw of evidence.spirits) {
      const pet = current.spirits.find(({ fullName }) => fullName === raw.title);
      expect(pet, raw.title).toBeDefined();
      expect(pet.raceStats).toEqual({ hp: raw.stats.hp, physicalAttack: raw.stats.atk, magicalAttack: raw.stats.spa,
        physicalDefense: raw.stats.def, magicalDefense: raw.stats.spd, speed: raw.stats.spe,
        total: Object.values(raw.stats).reduce((sum, value) => sum + value, 0) });
      expect(pet.traitName).toBe(sourceSkills.get(raw.feature_skill_id).name);
      expect(pet.types).toEqual(raw.types.map((type) => type.replace(/系$/, "")));
      expect(pet.calculationStatus).toBeUndefined();
      const pool = evidence.learnsets[raw.learnset_id];
      const methods = new Map();
      const add = (id, method) => {
        const key = byName.get(sourceSkills.get(id).name);
        if (!methods.has(key)) methods.set(key, []);
        if (!methods.get(key).includes(method)) methods.get(key).push(method);
      };
      for (const { skill, level } of pool.native_skills) add(skill, `默认学习 Lv.${level}`);
      for (const { skill, level, blood } of pool.blood_skills) add(skill, `${blood}系血脉 Lv.${level}`);
      for (const skill of pool.skill_stones) add(skill, "技能石");
      if (pool.legendary?.requires === raw.title) add(pool.legendary.skill, `传说技能（${raw.title}）`);
      const row = current.learnsets.find(({ spiritId }) => spiritId === pet.id);
      expect(row.acquisitions, raw.title).toEqual(Object.fromEntries(methods));
      expect(season.learnsets.find(({ spiritId }) => spiritId === pet.id)?.acquisitions).toEqual(row.acquisitions);
    }
  });
  test("全部技能和特性说明逐项匹配，不把非攻击技能的缺省威力当新改动", () => {
    for (const raw of evidence.skills) {
      const item = (raw.category === "特性" ? current.traits : current.skills).find(({ name }) => name === raw.name);
      expect(item.description, raw.name).toBe(raw.desc);
      if (raw.category !== "特性") expect(item).toMatchObject({ cost: raw.energy, basePower: raw.power ?? 0 });
    }
  });
  test("正式同步幂等，历史截图导入不再覆盖新站数据", () => {
    expect(applyNrcCurrent(current, evidence)).toEqual(current);
    expect(applyS4Manual(current, read("data/reviewed/s4-manual-2026-09-09.json"))).toEqual(current);
  });
  test.each(["布灵", "布灵布灵"])("%s 的旧玩具作用于双攻能力层，不重复增加威力", (name) => {
    const pet = current.spirits.find(({ fullName }) => fullName === name);
    const trait = current.traits.find(({ id }) => pet.traitIds.includes(id));
    expect(trait.name).toBe("旧玩具");
    expect(trait.description).toBe("己方精灵每使用过1个不同系别的技能，自己入场时获得双攻+10%。");
    const withoutToy = { ...current, spirits: current.spirits.map((item) => item.id === pet.id ? { ...item, traitIds: [] } : item) };
    const target = current.spirits.find(({ fullName }) => fullName === "果实立方人");
    for (const category of ["physical", "magical"]) {
      const skill = current.skills.find(({ name: skillName }) => skillName === (category === "physical" ? "猛烈撞击" : "光球"));
      const side = (spiritId) => ({ spiritId, skills: { single: skill.id, four: [skill.id] } });
      const calculate = (data, stacks, stage) => calculateMatchup(data, {
        schemaVersion: 1, mode: "single", level: 60,
        sides: { attacker: side(pet.id), defender: side(target.id) },
        directions: { forward: { context: { attackerTraitStacks: stacks }, overrides: { attackLevelStage: stage } } },
      }).forward.selectedResult;
      for (const stacks of [0, 1, 2, 18]) {
        expect(resolveTraitEffectRule(trait, "attacker", {
          context: { attackerTraitStacks: stacks }, skill,
        })).toMatchObject({ attackLevelBonus: stacks, attackMultiplier: 1 + stacks / 10, powerMultiplier: 1, powerPercentAdd: 0 });
        const actual = calculate(current, stacks, 3);
        const equivalent = calculate(withoutToy, 0, 3 + stacks);
        expect(actual.totalDamage, `${name}/${category}/${stacks}`).toBe(equivalent.totalDamage);
        expect(actual.skillPower).toBe(equivalent.skillPower);
        expect(actual.totalDamage).toBeGreaterThan(0);
      }
      expect(calculate(current, 18, 0).totalDamage).toBeGreaterThan(calculate(current, 0, 0).totalDamage);
    }
    expect(getTraitEffectRule(trait, "defender")).toBeNull();
  });
  test("麦芒正式收录，传说技能限定最终形态，血脉等级不混入默认学习", () => {
    const skill = season.skills.find(({ name }) => name === "麦芒");
    const fruit = current.spirits.find(({ fullName }) => fullName === "果实立方人");
    expect(current.learnsets.find(({ spiritId }) => spiritId === fruit.id).acquisitions[skill.id]).toContain("默认学习 Lv.41");
    expect(querySpiritFamilies(season, { skillIds: [skill.id] }).length).toBeGreaterThan(1);
    const eclipse = season.skills.find(({ name }) => name === "月蚀");
    const learners = season.learnsets.filter(({ skillIds }) => skillIds.includes(eclipse.id));
    expect(learners.map(({ spiritId }) => current.spirits.find(({ id }) => id === spiritId).fullName)).toEqual(["银月狼王"]);
    expect(matchesSource("草系血脉 Lv.15", "default")).toBe(false);
    expect(matchesSource("传说技能（银月狼王）", "default")).toBe(true);
    expect(season.skills.some(({ name }) => ["降雨", "午夜爆音"].includes(name))).toBe(false);
    expect(current.spirits.find(({ fullName }) => fullName === "星星眼").raceStats.total).toBe(605);
    expect(current.spirits.filter(({ baseName }) => baseName === "满月砣").map(({ raceStats }) => raceStats.total)).toEqual([645, 645]);
    expect(current.spirits.find(({ id }) => id === "spirit_59a68cf08569c4a7").fullName).toBe("满月砣（下弦的样子）");
    expect(getTraitEffectRule({ name: "旧玩具" }, "attacker").kind).toBe("attack_percent");
    expect(getTraitEffectRule({ name: "秋收" }, "attacker")).toMatchObject({ types: ["机械"], effect: 50 });
  });
});

test("Lua 解析器只接受数据，禁止执行函数或尾随代码", () => {
  expect(parseLuaData('return { a = 1, list = {"中文", true}, ["b"] = false }')).toEqual({ a: 1, list: ["中文", true], b: false });
  expect(() => parseLuaData('return { a = os.execute("bad") }')).toThrow();
  expect(() => parseLuaData('return {} os.execute("bad")')).toThrow();
});
