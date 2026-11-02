import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { buildS5BwikiRuntime } from "../../scripts/s5-bwiki-runtime.mjs";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { calculateAllPanelStats, calculatePanelStat } from "../../src/domain/stat.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { createInitialState } from "../../src/state/defaults.js";
import {
  createSpeedTargets,
  SPEED_TARGET_PROFILES,
} from "../../src/features/team-ability/domain/speed-targets.js";
import {
  BASE_SPEED_PROFILES,
  createBaseSpeedGroups,
  createSpeedRanking,
  selectBaseSpeedGroups,
} from "../../src/features/team-ability/domain/ranking-tools.js";
import {
  createDurabilityRanking,
  selectDurabilityRanking,
  STANDARD_DURABILITY_TEMPLATES,
} from "../../src/features/team-ability/domain/durability-ranking.js";

const preview = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const minggulong = preview.spirits.find(spirit => spirit.previewIdentity?.key === "minggulong");
const snapshot = { ...preview, spirits: [minggulong] };
const levels = [99, 89, 79, 69];
const levelIds = levels.map(level => `${minggulong.id}:level:${level}`);
const flattenTargets = groups => groups.flatMap(group => group.targets);

function mainViewForLevel(level, { natureId = "neutral", displayIvs = {}, category = "physical", spirit = minggulong, catalog = preview } = {}) {
  const source = { ...preview.spirits.find(spirit => spirit.id === "spirit_db5a2cb398dc0385"), traitIds: [] };
  const skill = { id: `ranking-probe-${category}`, name: "榜单面板回归", type: "普", category, basePower: 100, cost: 1 };
  // Use the real preview spirit/trait through the main VM. A plain probe skill
  // and trait-free source isolate incoming level effects from unrelated gains.
  const coreSnapshot = { ...catalog, spirits: [source, spirit], skills: [skill],
    learnsets: [source, spirit].map(spirit => ({ spiritId: spirit.id, skillIds: [skill.id] })) };
  const state = createInitialState(coreSnapshot);
  state.sides.defender.nature = natureId;
  state.sides.defender.displayIvs = { ...state.sides.defender.displayIvs, ...displayIvs };
  const trait = coreSnapshot.traits.find(entry => spirit.traitIds.includes(entry.id));
  for (const [direction, role] of [["forward", "defender"], ["reverse", "attacker"]]) {
    const control = getS5PreviewTraitInputs(trait, role).find(input => input.contextKey.endsWith("BattleLevel"));
    state.directions[direction].context[control.id] = level;
    state.directions[direction].context[control.contextKey] = level;
  }
  return buildCalculatorViewModel({ snapshot: coreSnapshot, state, activeDirection: "forward" });
}

describe("S5 冥古龙等级榜单", () => {
  test.each(Object.keys(SPEED_TARGET_PROFILES))("真实前瞻精灵在 %s 口径保留四档独立配置", profileId => {
    const targets = createSpeedTargets({ profileId, spirits: snapshot.spirits });
    const profile = SPEED_TARGET_PROFILES[profileId];

    expect(minggulong.fullName).toBe("冥古龙");
    expect(minggulong.raceStats.speed).toBe(70);
    expect(targets.map(target => target.level)).toEqual(levels);
    expect(targets.map(target => target.id)).toEqual(levelIds);
    expect(new Set(targets.map(target => target.id)).size).toBe(4);
    for (const target of targets) {
      expect(target.spirit).toBe(minggulong);
      expect(target.spiritId).toBe(minggulong.id);
      expect(target.name).toBe(`冥古龙 · ${target.level}级`);
      expect(target.speed).toBe(calculatePanelStat({
        kind: "speed", race: 70, displayIv: profile.displayIv,
        natureMultiplier: profile.natureMultiplier, level: target.level,
      }));
    }
    if (profileId === "neutral-max") expect(targets.map(target => target.speed)).toEqual([209, 199, 189, 179]);
    if (profileId === "positive-max") expect(targets.map(target => target.speed)).toEqual([241, 229, 217, 205]);
    if (profileId === "neutral-zero") expect(targets.map(target => target.speed)).toEqual([164, 157, 150, 143]);
    if (profileId === "negative-zero") expect(targets.map(target => target.speed)).toEqual([153, 146, 140, 134]);
    if (profileId === "positive-zero") expect(targets.map(target => target.speed)).toEqual([187, 178, 170, 162]);
  });

  test.each(Object.keys(SPEED_TARGET_PROFILES))("99/89级%s速度与当前主计算界面面板一致", profileId => {
    const profile = SPEED_TARGET_PROFILES[profileId];
    const targets = createSpeedTargets({ profileId, spirits: snapshot.spirits });
    for (const level of [99, 89]) {
      const target = targets.find(entry => entry.level === level);
      const main = mainViewForLevel(level, {
        natureId: profileId.startsWith("positive-") ? "timid" : profileId === "negative-zero" ? "grounded" : "neutral",
        displayIvs: { speed: profile.displayIv },
      });
      expect(main.sides.attacker.combatLevel).toBe(60);
      expect(main.sides.defender.combatLevel).toBe(level);
      expect(target.speed).toBe(main.sides.defender.panelStats.speed);
      expect(target.speed).toBe(main.sides.defender.finalPanelStats.speed);
    }
  });

  test("速度榜按实际速度排序，文字搜等级与数字搜实速都能定位配置", () => {
    const standard = flattenTargets(createSpeedRanking({ snapshot }));
    expect(standard).toHaveLength(4);
    expect(standard.every(target => target.level === 60 && !target.specialLabel)).toBe(true);
    expect(flattenTargets(createSpeedRanking({ snapshot, query: "89级" }))).toEqual([]);

    const all = createSpeedRanking({ snapshot, profiles: ["special"] });
    const special = flattenTargets(all);
    expect(special).toHaveLength(20);
    expect(special.every(target => target.level > 60 && target.specialLabel === `${target.level}级`)).toBe(true);
    expect(new Set(special.map(target => target.id)).size).toBe(20);
    expect(all.map(group => group.speed)).toEqual([241, 229, 217, 209, 205, 199, 189, 187, 179, 178, 170, 164, 162, 157, 153, 150, 146, 143, 140, 134]);
    const mixed = flattenTargets(createSpeedRanking({ snapshot,
      profiles: ["positive-max", "neutral-max", "neutral-zero", "negative-zero", "special"] }));
    expect(mixed).toHaveLength(24);
    expect(mixed.filter(target => target.level === 60)).toHaveLength(4);
    expect(mixed.filter(target => target.level > 60)).toHaveLength(20);
    expect(new Set(mixed.map(target => `${target.profileId}:${target.id}`)).size).toBe(24);

    const byLevel = flattenTargets(createSpeedRanking({ snapshot, profiles: ["special"], query: "89级" }));
    expect(byLevel.map(target => target.speed)).toEqual([229, 199, 178, 157, 146]);
    expect(byLevel.every(target => target.level === 89)).toBe(true);
    const bySpeed = flattenTargets(createSpeedRanking({ snapshot, profiles: ["special"], query: "２０５", queryMode: "auto" }));
    expect(bySpeed).toHaveLength(1);
    expect(bySpeed[0]).toMatchObject({ level: 69, profileId: "positive-max", speed: 205 });
  });

  test("种族总览只保留60级标准档，高等级仅由特殊口径收纳", () => {
    const groups = createBaseSpeedGroups({ snapshot });
    const members = groups.flatMap(group => group.members);
    expect(groups).toHaveLength(1);
    expect(members).toMatchObject([{ id: minggulong.id, name: "冥古龙", level: 60 }]);
    for (const group of groups) {
      const [member] = group.members;
      expect(member.name).toBe("冥古龙");
      expect(member.spirit).toBe(minggulong);
      expect(Object.keys(member.targets)).toEqual(BASE_SPEED_PROFILES);
      expect(group.values).toEqual(BASE_SPEED_PROFILES.map(profileId => member.targets[profileId].speed));
      for (const target of Object.values(member.targets)) {
        expect(target.id).toBe(member.id);
        expect(target.level).toBe(member.level);
      }
    }
    const matched = selectBaseSpeedGroups(groups, "89级").flatMap(group => group.members);
    expect(matched).toEqual([]);
    expect(selectBaseSpeedGroups(groups, "199")).toEqual([]);
  });

  test.each(Object.keys(STANDARD_DURABILITY_TEMPLATES))("%s 耐久保留等级面板，低于80级只除一次承伤倍率", templateId => {
    const ranking = createDurabilityRanking({ spirits: snapshot.spirits, templateId });
    const template = STANDARD_DURABILITY_TEMPLATES[templateId];
    const levelRows = ranking.rows.filter(row => row.level > 60);
    expect(levelRows.map(row => row.level)).toEqual(levels);
    expect(levelRows.map(row => row.id)).toEqual(levelIds);
    expect(new Set(ranking.rows.map(row => row.id)).size).toBe(5);
    expect(ranking.rows.find(row => row.level === 60)).toMatchObject({
      id: minggulong.id, name: "冥古龙", incomingDamageMultiplier: 1.4,
    });
    expect(ranking.template.level).toBe(60);
    for (const row of ranking.rows) {
      const expected = calculateAllPanelStats({
        raceStats: minggulong.raceStats, displayIvs: template.displayIvs,
        natureMultipliers: getNatureMultipliers(template.natureId), level: row.level,
      });
      expect(row.spiritId).toBe(minggulong.id);
      expect(row.name).toBe(row.level === 60 ? "冥古龙" : `冥古龙 · ${row.level}级`);
      expect(row.panelStats).toEqual(expected);
      const physical = expected.hp * expected.physicalDefense;
      const magical = expected.hp * expected.magicalDefense;
      const combined = expected.hp * expected.physicalDefense * expected.magicalDefense /
        (expected.physicalDefense + expected.magicalDefense);
      const incoming = row.level < 80 ? 1.4 : 1;
      expect(row.incomingDamageMultiplier).toBe(incoming);
      expect(row.panelDurability.raw).toEqual({ physical, magical, combined });
      for (const [metric, value] of Object.entries({ physical, magical, combined })) {
        expect(row.panelDurability.display[metric]).toBe(Math.round(value));
        expect(row.durability.raw[metric]).toBe(value / incoming);
        expect(row.durability.display[metric]).toBe(Math.round(value / incoming));
      }
    }
  });

  test.each(["physical", "magical"])("含60级的全部耐久档与主核心%s承伤一致，不新增防守等级系数", category => {
    const ranking = createDurabilityRanking({ spirits: snapshot.spirits });
    const template = ranking.template;
    for (const row of ranking.rows) {
      const main = mainViewForLevel(row.level, { ...template, category });
      const result = main.calculation.forward.selectedResult;
      const coefficient = result.formulaSteps.find(step => step.label === "等级系数与攻防比");
      const final = result.formulaSteps.find(step => step.label === "减伤、连击与最终倍率");
      const defense = category === "physical" ? "physicalDefense" : "magicalDefense";
      expect(main.sides.attacker.combatLevel).toBe(60);
      expect(main.sides.defender.combatLevel).toBe(row.level);
      expect(main.sides.defender.panelStats).toEqual(row.panelStats);
      expect(coefficient.input).toMatchObject({ level: 60, coefficient: 37 / 41,
        damageReductionMultiplier: 1, defenderDefense: row.panelStats[defense] });
      expect(final.input).toMatchObject({ finalDamageMultiplier: row.level < 80 ? 1.4 : 1, hitCount: 1 });
      expect(row.incomingDamageMultiplier).toBe(final.input.finalDamageMultiplier);
      expect(row.durability.raw[category]).toBe(
        main.sides.defender.health.maxHp * coefficient.input.defenderDefense / final.input.finalDamageMultiplier,
      );
      expect(result.totalDamage).toBe(Math.floor(coefficient.after * row.incomingDamageMultiplier));
    }
  });

  test("耐久四档先计承伤特性再只除一次属性倍率，搜索保留原排名", () => {
    const typeChart = { types: ["火", "幽", "龙"], matrix: [[1, 1, 2]] };
    const options = { spirits: snapshot.spirits, typeChart, attackType: "火" };
    const ranking = createDurabilityRanking({ ...options, multipliers: [2] });
    expect(ranking.rows.filter(row => row.level > 60).map(row => row.level)).toEqual(levels);
    expect(ranking.rows).toHaveLength(5);
    for (const row of ranking.rows) {
      expect(row.multiplier).toBe(2);
      expect(row.incomingDamageMultiplier).toBe(row.level < 80 ? 1.4 : 1);
      for (const metric of ["physical", "magical", "combined"]) {
        expect(row.baseDurability.raw[metric]).toBe(row.panelDurability.raw[metric] / row.incomingDamageMultiplier);
        expect(row.durability.raw[metric]).toBe(row.baseDurability.raw[metric] / 2);
        expect(row.durability.display[metric]).toBe(Math.round(row.panelDurability.raw[metric] / row.incomingDamageMultiplier / 2));
      }
    }
    expect(createDurabilityRanking({ ...options, multipliers: [0.5] }).rows).toEqual([]);
    for (const sortBy of ["physical", "magical", "combined"]) {
      expect(selectDurabilityRanking(ranking, { sortBy }).rows.filter(row => row.level > 60).map(row => row.level)).toEqual(levels);
      const filtered = selectDurabilityRanking(ranking, { query: "79级", sortBy });
      expect(filtered.rows).toHaveLength(1);
      expect(filtered.rows[0]).toMatchObject({
        level: 79, id: `${minggulong.id}:level:79`,
        globalRank: { [sortBy]: 3 }, filteredRank: { [sortBy]: 3 },
      });
    }
  });

  test("普通同名精灵不展开，属性候选保持既有入榜资格与 60 级模板", () => {
    const ordinary = {
      ...preview.spirits.find(spirit => spirit.id === "spirit_db5a2cb398dc0385"),
      fullName: "冥古龙", baseName: "冥古龙", raceStats: { ...minggulong.raceStats },
    };
    expect(ordinary.previewIdentity).toBeUndefined();
    const spirits = [minggulong, ordinary];
    const speed = createSpeedTargets({ spirits, profileId: "neutral-max" });
    const durability = createDurabilityRanking({ spirits });
    expect(speed).toHaveLength(5);
    expect(durability.rows).toHaveLength(6);
    for (const rows of [speed, durability.rows]) {
      expect(rows.filter(row => row.spiritId === ordinary.id)).toEqual([
        expect.objectContaining({ id: ordinary.id, name: "冥古龙", level: 60 }),
      ]);
    }
    const defaultTargets = flattenTargets(createSpeedRanking({ snapshot: { ...snapshot, spirits } }));
    const standardProfiles = ["negative-zero", "neutral-max", "neutral-zero", "positive-max"];
    expect(defaultTargets).toHaveLength(8);
    expect(defaultTargets.filter(target => target.spiritId === ordinary.id).map(target => target.profileId).sort()).toEqual(standardProfiles);
    expect(defaultTargets.filter(target => target.spiritId === minggulong.id && target.level === 60)
      .map(target => target.profileId).sort()).toEqual(standardProfiles);
    expect(defaultTargets.every(target => target.level === 60)).toBe(true);
    const special = flattenTargets(createSpeedRanking({ snapshot: { ...snapshot, spirits }, profiles: ["special"] }));
    expect(special).toHaveLength(20);
    expect(special.every(target => target.spiritId === minggulong.id && target.level > 60)).toBe(true);
    const unexpanded = createDurabilityRanking({ spirits, includeLevelVariants: false });
    // Recorded S5 stats remain eligible when level expansion is disabled.
    expect(unexpanded.rows).toHaveLength(2);
    expect(unexpanded.rows.map(row => row.id).sort()).toEqual([ordinary.id, minggulong.id].sort());
    for (const row of unexpanded.rows) {
      expect(row.level).toBe(60);
      expect(row.incomingDamageMultiplier).toBe(row.spiritId === minggulong.id ? 1.4 : 1);
      for (const metric of ["physical", "magical", "combined"]) {
        expect(row.durability.raw[metric]).toBe(row.panelDurability.raw[metric] / row.incomingDamageMultiplier);
      }
    }
    expect(unexpanded.excluded).toEqual([]);
  });

  test("构造、筛选榜单不向原快照或种族值写入等级配置", () => {
    const before = structuredClone(snapshot);
    createSpeedRanking({ snapshot, profiles: Object.keys(SPEED_TARGET_PROFILES) });
    createBaseSpeedGroups({ snapshot, query: "99级" });
    for (const templateId of Object.keys(STANDARD_DURABILITY_TEMPLATES)) {
      createDurabilityRanking({ spirits: snapshot.spirits, templateId, query: "69级" });
    }
    expect(snapshot).toEqual(before);
    expect(minggulong).not.toHaveProperty("level");
    expect(minggulong.id).toBe(before.spirits[0].id);
  });
});

describe("S5 超能阿布等级榜单", () => {
  let catalog, abu, superAbu, abuSnapshot;
  beforeAll(async () => {
    catalog = await buildS5BwikiRuntime();
    abu = catalog.spirits.find(spirit => spirit.previewIdentity?.key === "abu");
    superAbu = catalog.spirits.find(spirit => spirit.previewIdentity?.key === "super-abu");
    abuSnapshot = { ...catalog, spirits: [superAbu] };
  });
  const abuLevels = [99, 90, 80, 70];

  test("五种速度口径与主计算器面板一致，四档可搜索且不合并", () => {
    for (const profileId of Object.keys(SPEED_TARGET_PROFILES)) {
      const profile = SPEED_TARGET_PROFILES[profileId];
      const targets = createSpeedTargets({ spirits: abuSnapshot.spirits, profileId });
      expect(targets.map(target => target.level)).toEqual(abuLevels);
      for (const target of targets) {
        const main = mainViewForLevel(target.level, { spirit: superAbu, catalog,
          natureId: profileId.startsWith("positive-") ? "timid" : profileId === "negative-zero" ? "grounded" : "neutral",
          displayIvs: { speed: profile.displayIv },
        });
        expect(target.speed).toBe(main.sides.defender.finalPanelStats.speed);
        expect(target.id).toBe(`${superAbu.id}:level:${target.level}`);
      }
    }
    const groups = createBaseSpeedGroups({ snapshot: abuSnapshot });
    expect(groups.flatMap(group => group.members).map(member => member.level)).toEqual([60]);
    expect(flattenTargets(createSpeedRanking({ snapshot: abuSnapshot, query: "70级" }))).toEqual([]);
    const special = flattenTargets(createSpeedRanking({ snapshot: abuSnapshot, profiles: ["special"] }));
    expect(special).toHaveLength(20);
    expect(new Set(special.map(target => target.id)).size).toBe(20);
    expect(special.every(target => target.level > 60 && target.specialLabel === `${target.level}级`)).toBe(true);
    expect(flattenTargets(createSpeedRanking({ snapshot: abuSnapshot, profiles: ["special"], query: "70级" }))).toHaveLength(5);
  });

  test.each(Object.keys(STANDARD_DURABILITY_TEMPLATES))("%s 耐久对齐主计算器，60与70级承伤+30%且不重复减伤", templateId => {
    const ranking = createDurabilityRanking({ spirits: abuSnapshot.spirits, templateId });
    const levelRows = ranking.rows.filter(row => row.level > 60);
    expect(levelRows.map(row => row.level)).toEqual(abuLevels);
    expect(ranking.rows).toHaveLength(5);
    const standard = ranking.rows.find(row => row.level === 60);
    expect(standard).toMatchObject({ id: superAbu.id, name: "超能阿布", incomingDamageMultiplier: 1.3 });
    for (const row of ranking.rows) {
      for (const category of ["physical", "magical"]) {
        const main = mainViewForLevel(row.level, { ...ranking.template, category, spirit: superAbu, catalog });
        const result = main.calculation.forward.selectedResult;
        const final = result.formulaSteps.find(step => step.label === "减伤、连击与最终倍率");
        expect(main.sides.defender.panelStats).toEqual(row.panelStats);
        expect(final.input.finalDamageMultiplier).toBe(row.level < 80 ? 1.3 : 1);
        expect(row.incomingDamageMultiplier).toBe(final.input.finalDamageMultiplier);
        expect(row.durability.raw[category]).toBe(row.panelDurability.raw[category] / row.incomingDamageMultiplier);
      }
      expect(row.durability.raw.combined).toBe(row.panelDurability.raw.combined / row.incomingDamageMultiplier);
    }
  });

  test.each(Object.keys(STANDARD_DURABILITY_TEMPLATES))("%s 普通阿布60级计入三成承伤，低于超能70级以上并与同级超能并列", templateId => {
    const ranking = createDurabilityRanking({ spirits: [abu, superAbu], templateId });
    const ordinary = ranking.rows.find(row => row.spiritId === abu.id);
    const sameLevel = ranking.rows.find(row => row.spiritId === superAbu.id && row.level === 60);
    expect(ordinary).toMatchObject({ name: "阿布", level: 60, incomingDamageMultiplier: 1.3 });
    for (const metric of ["physical", "magical", "combined"]) {
      expect(ordinary.durability.raw[metric]).toBe(ordinary.panelDurability.raw[metric] / 1.3);
      expect(ordinary.durability.display[metric]).toBe(Math.round(ordinary.panelDurability.raw[metric] / 1.3));
      expect(sameLevel.durability.raw[metric]).toBe(ordinary.durability.raw[metric]);
      expect(sameLevel.globalRank[metric]).toBe(ordinary.globalRank[metric]);
      const rows = selectDurabilityRanking(ranking, { sortBy: metric }).rows;
      for (const row of rows.filter(row => row.level > 60)) {
        expect(row.durability.raw[metric]).toBeGreaterThan(ordinary.durability.raw[metric]);
        expect(rows.indexOf(row)).toBeLessThan(rows.indexOf(ordinary));
      }
    }
    for (const category of ["physical", "magical"]) {
      const main = mainViewForLevel(60, { ...ranking.template, category, spirit: abu, catalog });
      const final = main.calculation.forward.selectedResult.formulaSteps.find(step => step.label === "减伤、连击与最终倍率");
      expect(main.sides.defender.panelStats).toEqual(ordinary.panelStats);
      expect(final.input.finalDamageMultiplier).toBe(ordinary.incomingDamageMultiplier);
    }
  });

  test("关闭等级展开保留60级，普通同名与国际服资料不自动生成S5等级", () => {
    const ordinary = { ...superAbu, previewIdentity: undefined };
    expect(createSpeedTargets({ spirits: [ordinary] }).map(row => row.level)).toEqual([60]);
    expect(createDurabilityRanking({ spirits: abuSnapshot.spirits, includeLevelVariants: false }).rows).toEqual([
      expect.objectContaining({ level: 60, incomingDamageMultiplier: 1.3 }),
    ]);
    const identity = superAbu.previewIdentity;
    for (const previewIdentity of [undefined,
      { ...identity, catalogId: "s3-global" },
      { ...identity, key: "ordinary", mechanicKey: "super-abu" },
      { ...identity, mechanicKey: "ordinary" },
      { ...identity, mechanicKey: "abu" },
    ]) {
      const rows = createDurabilityRanking({ spirits: [{ ...superAbu, previewIdentity }] }).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ level: 60, incomingDamageMultiplier: 1 });
      expect(rows[0].durability).toEqual(rows[0].panelDurability);
    }
  });
});
