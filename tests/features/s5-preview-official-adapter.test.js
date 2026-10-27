import { expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { getBattleFormChoices } from "../../src/domain/battle-form.js";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { s5PreviewIds, validateS5PreviewCatalog, withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";
import { createInitialState } from "../../src/state/defaults.js";
import { selectSpirit } from "../../src/state/calculator-session.js";

// Synthetic official-card fixtures exercise the adapter without asserting game facts.
const evidence = { kind: "official-image", url: "https://example.com/official-card", frame: "card.jpg" };
const stats = { hp: 80, physicalAttack: 90, magicalAttack: 110, physicalDefense: 70, magicalDefense: 75, speed: 95 };
const skill = (fields = {}) => ({ id: "skill_preview_s5_shared", name: "共享新技能", type: "水", category: "magical",
  cost: null, basePower: null, description: "官方已公布的技能说明。", evidence: { ...evidence }, ...fields });
const entry = (key) => ({ key, name: key, kind: "family", traitSummary: "官方特性说明。", mechanicKey: "fixture",
  types: ["水"], evidence: { ...evidence }, unknowns: [], skills: [skill()],
  officialSkillRefs: [{ id: "known", name: "已有技能", evidence: { ...evidence } }],
  defaultSkillIds: ["skill_preview_s5_shared", null, "known", null] });
function fixture() {
  return {
    catalog: { catalogId: "s5-official-adapter-fixture", source: { url: evidence.url }, entries: [entry("first"), entry("second")] },
    snapshot: {
      meta: { id: "fixture", rulesVersion: "fixture-rules" },
      spirits: [{ id: "existing", fullName: "现有精灵", types: ["水"], raceStats: { ...stats }, traitIds: [] }], traits: [],
      skills: [{ id: "known", name: "已有技能", type: "水", category: "magical", cost: 3, basePower: 60, description: "造成魔伤。" }],
      learnsets: [{ spiritId: "existing", skillIds: ["known"] }], typeChart: null,
    },
  };
}
const options = { useTestRaceStats: true };

test("官方六维、进化链和来源升级旧占位，空六维不套100且重复覆盖不漂移", () => {
  const { catalog, snapshot } = fixture();
  const old = withS5PreviewCatalog(snapshot, catalog, options);
  for (const candidate of catalog.entries) {
    candidate.raceStats = { ...stats };
    candidate.evolutionChainKeys = ["first", "second"];
    candidate.traitName = "官方特性名";
    candidate.announcedSkills = [{ name: "共享新技能", description: "官方公布的说明。", evidence: { ...evidence } }];
  }
  const result = withS5PreviewCatalog(old, catalog, options);
  const ids = ["first", "second"].map(key => s5PreviewIds(key).spiritId);
  for (const [index, id] of ids.entries()) {
    expect(result.spirits.find(item => item.id === id)).toMatchObject({
      raceStats: { ...stats, total: 520 }, stage: ["一阶", "二阶"][index], evolutionChainIds: ids,
      traitName: "官方特性名", previewIdentity: { raceStatsPlaceholder: false, raceStatsEvidence: evidence,
        source: { authority: "official-image", url: evidence.url }, announcedSkills: catalog.entries[index].announcedSkills },
    });
  }
  expect(old.spirits.find(item => item.id === ids[0]).raceStats.physicalAttack).toBe(100);
  expect(withS5PreviewCatalog(result, catalog, options)).toBe(result);
  catalog.entries[1].raceStats = null;
  const withoutStats = withS5PreviewCatalog(result, catalog, options).spirits.find(item => item.id === ids[1]);
  expect(withoutStats).toMatchObject({ raceStats: null, calculationStatus: "pending-race-stats", previewIdentity: { raceStatsPlaceholder: false } });
});

test("共享未知技能只生成一个实体，数值保留null；更新正式参数后清除pending", () => {
  const { catalog, snapshot } = fixture();
  const before = structuredClone({ catalog, snapshot });
  const result = withS5PreviewCatalog(snapshot, catalog, options);
  expect(result.skills.filter(item => item.name === "共享新技能")).toHaveLength(1);
  expect(result.skills.find(item => item.name === "共享新技能")).toMatchObject({
    cost: null, basePower: null, calculationStatus: "pending-skill-data", previewIdentity: { evidence },
  });
  for (const candidate of catalog.entries) {
    expect(result.learnsets.find(item => item.spiritId === s5PreviewIds(candidate.key).spiritId).skillIds)
      .toEqual(["skill_preview_s5_shared", "known"]);
  }
  expect(withS5PreviewCatalog(result, catalog, options)).toBe(result);
  expect({ catalog, snapshot }).toEqual(before);
  for (const candidate of catalog.entries) Object.assign(candidate.skills[0], { cost: 3, basePower: 70 });
  const upgraded = withS5PreviewCatalog(result, catalog, options);
  expect(upgraded.skills.find(item => item.name === "共享新技能")).not.toHaveProperty("calculationStatus");
  expect(result.skills.find(item => item.name === "共享新技能").basePower).toBeNull();
  expect(withS5PreviewCatalog(upgraded, catalog, options)).toBe(upgraded);
});

test("正式同名技能复用正式ID，默认槽映射不补满、不挤掉空位，个人预设优先", () => {
  const { catalog, snapshot } = fixture();
  const formal = { ...skill({ id: "formal-shared", cost: 5, basePower: 90 }) };
  snapshot.skills.push(formal);
  const result = withS5PreviewCatalog(snapshot, catalog, options);
  expect(result.skills).toBe(snapshot.skills);
  expect(result.skills.find(item => item.name === "共享新技能")).toBe(formal);
  const spiritId = s5PreviewIds("first").spiritId;
  expect(chooseDefaultSkillIds(result, spiritId)).toEqual(["formal-shared", null, "known", null]);
  const initialState = createInitialState(result);
  const selected = selectSpirit(initialState, { initialState, snapshot: result, side: "attacker", spiritId }).state;
  expect(selected.sides.attacker.skills).toEqual({ single: "formal-shared", four: ["formal-shared", null, "known", null] });
  const personalConfiguration = { ...selected.sides.attacker,
    skills: { single: "known", four: [null, "known", null, "formal-shared"] } };
  const restored = selectSpirit(selected, { initialState, snapshot: result, side: "attacker", spiritId, personalConfiguration }).state;
  expect(restored.sides.attacker.skills).toEqual(personalConfiguration.skills);
  expect(withS5PreviewCatalog(result, catalog, options)).toBe(result);
});

test.each([
  { cost: null, basePower: 70 }, { cost: 3, basePower: null },
  { cost: 3, basePower: null, category: "status" }, { cost: null, basePower: null, type: null, category: null },
])("缺失技能参数不会被当作0结算：%j", fields => {
  const { catalog, snapshot } = fixture();
  for (const candidate of catalog.entries) candidate.skills = [skill(fields)];
  const result = withS5PreviewCatalog(snapshot, catalog, options);
  const state = createInitialState(result);
  state.sides.attacker.skills.single = "skill_preview_s5_shared";
  const calculated = calculateMatchup(result, state).forward.selectedResult;
  expect(calculated).toMatchObject({ status: "unsupported", totalDamage: null, reason: "技能参数待确认，暂不可计算" });
  expect(calculated.skillCost).toBeUndefined();
});

test("共享定义冲突、伪官方证据、默认未声明技能与单向进化关系均拒绝", () => {
  for (const mutate of [
    catalog => { catalog.entries[1].skills[0].cost = 3; },
    catalog => { catalog.entries[0].skills[0].evidence.url = "http://example.com/card"; },
    catalog => { catalog.entries[0].defaultSkillIds = ["undeclared"]; },
    catalog => { catalog.entries[0].evolutionChainKeys = ["first", "second"]; },
    catalog => { catalog.entries[0].raceStats = { ...stats, total: 999 }; },
  ]) {
    const { catalog } = fixture(); mutate(catalog);
    expect(() => validateS5PreviewCatalog(catalog)).toThrow("S5 前瞻目录");
  }
});

test("同一基底两个分支沿用正式运行时关系，显式阶段不把第二分支当三阶", () => {
  const { catalog, snapshot } = fixture();
  catalog.entries.push(entry("third"));
  for (const [index, candidate] of catalog.entries.entries()) {
    candidate.stage = index === 0 ? "一阶" : "二阶";
    candidate.evolutionChainKeys = index === 0 ? ["first", "second", "third"] : ["first", candidate.key];
    candidate.description = `图鉴正文${index}，不改写。`;
  }
  const result = withS5PreviewCatalog(snapshot, catalog, options);
  const id = key => s5PreviewIds(key).spiritId;
  expect(getBattleFormChoices(result.spirits, { spiritId: id("first") }).map(item => item.id))
    .toEqual(["first", "second", "third"].map(id));
  expect(getBattleFormChoices(result.spirits, { spiritId: id("second") }).map(item => item.id)).toEqual(["first", "second"].map(id));
  expect(getBattleFormChoices(result.spirits, { spiritId: id("third") }).map(item => item.id)).toEqual(["first", "third"].map(id));
  expect(result.spirits.find(item => item.id === id("third"))).toMatchObject({ stage: "二阶", description: "图鉴正文2，不改写。" });
  expect(withS5PreviewCatalog(result, catalog, options)).toBe(result);
  catalog.entries[2].description = "修订图鉴原文。";
  catalog.entries[2].variantName = "另一个分支";
  const revised = withS5PreviewCatalog(result, catalog, options);
  expect(revised.spirits.find(item => item.id === id("third"))).toMatchObject({ description: "修订图鉴原文。", variantName: "另一个分支" });
});
