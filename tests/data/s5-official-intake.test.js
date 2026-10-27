import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import snapshot from "../../public/data/runtime.json";
import { getBattleFormChoices } from "../../src/domain/battle-form.js";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { s5PreviewIds, withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";

const source = "https://www.bilibili.com/opus/1263800141975912449";
const imported = catalog.entries.filter(entry => entry.evidence?.url === source);
const result = withS5PreviewCatalog(snapshot, catalog, { useTestRaceStats: true });
const spirit = key => result.spirits.find(item => item.id === s5PreviewIds(key).spiritId);

test("首批三家族合入当前预览：官图六维与彩图保留，前置形态不回落全100", () => {
  const families = [
    ["little-ming-dragon", "minggulong"],
    ["silver-chain", "underground-silver-scale", "underground-silver-dragon"],
    ["sinking-gold-beast", "dragonhead-gold", "gold-vein-dragon"],
  ];
  const stats = [
    { hp: 118, physicalAttack: 128, magicalAttack: 42, physicalDefense: 81, magicalDefense: 63, speed: 70 },
    { hp: 100, physicalAttack: 53, magicalAttack: 123, physicalDefense: 82, magicalDefense: 120, speed: 120 },
    { hp: 145, physicalAttack: 131, magicalAttack: 58, physicalDefense: 127, magicalDefense: 88, speed: 80 },
  ];
  for (const [index, family] of families.entries()) {
    for (const key of family) {
      expect(spirit(key)).toMatchObject({ previewIdentity: { raceStatsPlaceholder: false,
        asset: { kind: "official-portrait" } },
      evolutionChainIds: family.map(member => s5PreviewIds(member).spiritId) });
      if (key === family.at(-1)) expect(spirit(key).raceStats).toMatchObject(stats[index]);
      else expect(spirit(key)).toMatchObject({ raceStats: null, calculationStatus: "pending-race-stats" });
    }
  }
});

test("首批图示四技能接入默认槽，未知参数保持阻断，重复导入不丢配置", () => {
  const firstBatch = catalog.entries.filter(entry => entry.evidence?.url === "https://www.bilibili.com/opus/1263792411026391049");
  expect(firstBatch).toHaveLength(8);
  for (const entry of firstBatch) {
    expect(spirit(entry.key).description).toBe(entry.description);
    expect(spirit(entry.key).description).toBeTruthy();
    const defaults = chooseDefaultSkillIds(result, s5PreviewIds(entry.key).spiritId);
    expect(defaults.map(id => result.skills.find(skill => skill.id === id)?.name))
      .toEqual(entry.announcedSkills.map(skill => skill.name));
    for (const skill of entry.skills.filter(skill => skill.cost === null)) {
      expect(result.skills.find(item => item.id === skill.id))
        .toMatchObject({ cost: null, basePower: null, calculationStatus: "pending-skill-data" });
    }
    for (const reference of entry.officialSkillRefs) {
      expect(result.skills.find(skill => skill.id === reference.id)?.iconUrl).toBe(reference.iconUrl);
    }
  }
  expect(withS5PreviewCatalog(result, catalog, { useTestRaceStats: true })).toBe(result);
});

test("官方家族图只替换已公布六维，初阶仍明确使用原100测试占位", () => {
  expect(imported).toHaveLength(17);
  expect(spirit("shadow-papercut")).toMatchObject({ stage: "二阶", raceStats: {
    hp: 123, physicalAttack: 143, magicalAttack: 56, physicalDefense: 104, magicalDefense: 83, speed: 120,
  }, previewIdentity: { raceStatsPlaceholder: false } });
  expect(spirit("little-scissor")).toMatchObject({ stage: "一阶", raceStats: { hp: 100, physicalAttack: 100 },
    previewIdentity: { raceStatsPlaceholder: true } });
  expect(spirit("diliutun").types).toEqual(["毒", "幻"]);
  expect(spirit("egg-wrap").types).toEqual(["普通", "萌"]);
  expect(spirit("diliutun").traitDescription).toContain("1~6点");
  expect(spirit("diniantun").traitDescription).toContain("1~20点");
  for (const entry of imported) {
    const projected = spirit(entry.key);
    expect(entry.asset?.kind).toBe("official-portrait");
    expect(projected.asset.localUrl).toBe(entry.asset.localUrl);
    expect(existsSync(resolve("public", `.${entry.asset.localUrl}`))).toBe(true);
    expect(projected.description).toBe(entry.description);
    expect(projected.description).toBeTruthy();
    if (entry.raceStats) {
      expect(projected.previewIdentity.raceStatsPlaceholder).toBe(false);
      expect(projected.raceStats.total).toBe(Object.values(entry.raceStats).reduce((a, b) => a + b, 0));
    }
  }
});

test("阿瓦鲨保留两套正式六维和二阶分支，变种不互串", () => {
  expect(spirit("awa-shark-lemon")).toMatchObject({ stage: "二阶", raceStats: { hp: 123, physicalAttack: 117, magicalAttack: 46 } });
  expect(spirit("awa-shark-tiger")).toMatchObject({ stage: "二阶", raceStats: { hp: 90, physicalAttack: 146, magicalAttack: 57 } });
  const choices = getBattleFormChoices(result.spirits, { spiritId: spirit("awa-shark-lemon").id });
  expect(choices.map(item => item.id)).toContain(spirit("lele-shark").id);
  expect(choices.map(item => item.id)).not.toContain(spirit("awa-shark-tiger").id);
});

test("家族图四技能按图序进入每只默认槽；共享新技能单例且缺项不补0", () => {
  for (const entry of imported) {
    const defaults = chooseDefaultSkillIds(result, s5PreviewIds(entry.key).spiritId);
    expect(defaults.map(id => result.skills.find(skill => skill.id === id)?.name))
      .toEqual(entry.announcedSkills.map(skill => skill.name));
    for (const definition of entry.skills) {
      const matches = result.skills.filter(skill => skill.name === definition.name);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ cost: null, basePower: null, type: null, calculationStatus: "pending-skill-data" });
      expect(matches[0].iconUrl).toBe(`/assets/skills/${definition.id}.png`);
      expect(existsSync(resolve("public", `.${definition.iconUrl}`))).toBe(true);
    }
    for (const reference of entry.officialSkillRefs) {
      const formal = snapshot.skills.find(skill => skill.id === reference.id);
      const projected = result.skills.find(skill => skill.id === reference.id);
      if (reference.iconUrl) expect(projected).toEqual({ ...formal, iconUrl: reference.iconUrl });
      else expect(projected).toBe(formal);
      expect(existsSync(resolve("public", `.${reference.iconUrl}`))).toBe(true);
    }
  }
  expect(result.skills.filter(skill => skill.name === "续杯")).toHaveLength(1);
  expect(result.skills.find(skill => skill.name === "夏垫").description).toContain("2次随机奉献");
  expect(withS5PreviewCatalog(result, catalog, { useTestRaceStats: true })).toBe(result);
});
