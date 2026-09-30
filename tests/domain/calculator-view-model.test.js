import { describe, expect, test } from "vitest";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import {
  buildCalculatorViewModel,
  clampStage,
  getPanelView,
  getTraitView,
  stageMultiplier,
} from "../../src/domain/calculator-view-model.js";

test("面板能力等级按正负九十九层封顶", () => {
  expect(clampStage(100)).toBe(99);
  expect(clampStage(-100)).toBe(-99);
  expect(stageMultiplier(99)).toBeCloseTo(10.9);
  expect(stageMultiplier(-99)).toBeCloseTo(1 / 10.9);
});

const ivs = {
  hp: 60,
  magicalAttack: 60,
  magicalDefense: 60,
  physicalAttack: 60,
  physicalDefense: 60,
  speed: 60,
};

const snapshot = {
  learnsets: [
    { spiritId: "fire", skillIds: ["fire-hit"] },
    { spiritId: "water", skillIds: ["water-hit"] },
  ],
  meta: { id: "s3-view", rulesVersion: "rules-v1" },
  skills: [
    {
      basePower: 80,
      category: "physical",
      id: "fire-hit",
      name: "火焰冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "火",
    },
    {
      basePower: 70,
      category: "magical",
      id: "water-hit",
      name: "水流冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "水",
    },
  ],
  spirits: [
    {
      fullName: "火灵",
      id: "fire",
      raceStats: {
        hp: 110,
        magicalAttack: 82,
        magicalDefense: 90,
        physicalAttack: 128,
        physicalDefense: 95,
        speed: 116,
      },
      traitIds: ["focus"],
      types: ["火"],
    },
    {
      fullName: "水灵",
      id: "water",
      raceStats: {
        hp: 125,
        magicalAttack: 115,
        magicalDefense: 105,
        physicalAttack: 100,
        physicalDefense: 100,
        speed: 90,
      },
      traitIds: [],
      types: ["水"],
    },
  ],
  traits: [
    {
      description: "入场首回合，获得物攻+100%。",
      id: "focus",
      name: "专注力",
    },
  ],
  typeChart: null,
};

function state() {
  const direction = {
    context: {},
    currentHp: null,
    finalDamageMultiplier: 1,
    hitCount: 1,
    overrides: {},
    reduction: 1,
    selectedSkillIndex: 0,
    starfallStacks: 0,
  };
  return {
    directions: {
      forward: { ...direction, context: {}, overrides: {} },
      reverse: { ...direction, context: {}, overrides: {} },
    },
    level: 60,
    marks: {
      attacker: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
      defender: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
    },
    mode: "single",
    schemaVersion: 1,
    sides: {
      attacker: {
        displayIvs: { ...ivs },
        nature: "neutral",
        skills: { four: ["fire-hit", null, null, null], single: "fire-hit" },
        spiritId: "fire",
      },
      defender: {
        displayIvs: { ...ivs },
        nature: "neutral",
        skills: { four: ["water-hit", null, null, null], single: "water-hit" },
        spiritId: "water",
      },
    },
    versions: { data: "s3-view", rules: "rules-v1" },
  };
}

describe("buildCalculatorViewModel", () => {
  test("settles a negative-status trait acquired through Moon Memory", () => {
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "fire"
          ? { ...spirit, traitIds: ["moon-memory"] }
          : spirit,
      ),
      traits: [
        { id: "moon-memory", name: "铭记于月亮" },
        { id: "soul-burn", name: "灵魂灼伤" },
      ],
    };
    const input = state();
    input.mode = "four";
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.negativeStatuses = {
      attacker: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
      defender: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
    };
    input.sides.attacker.acquiredTraitIds = ["soul-burn"];
    input.sides.attacker.acquiredTraitValues = {};
    input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 1 };

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: input,
    });

    expect(view.result.selectedResult.negativeStatusApplications).toMatchObject({
      stacks: { freeze: 2 },
    });
  });

  test("keeps a selected preview placeholder visible but blocks calculation", () => {
    const placeholderSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "fire"
          ? {
              ...spirit,
              calculationStatus: "pending-race-stats",
              raceStats: null,
              traitIds: [],
            }
          : spirit,
      ),
    };

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: placeholderSnapshot,
      state: state(),
    });

    expect(view.configurationReady).toBe(false);
    expect(view.configurationIssue).toBe(
      "种族值待确认",
    );
    expect(view.sides.attacker.spirit).toMatchObject({
      calculationStatus: "pending-race-stats",
      fullName: "火灵",
      raceStats: null,
    });
    expect(view.sides.attacker.panelStats).toBeNull();
    expect(view.result).toBeNull();
  });

  test("maps direction without mutating raw state and preserves calculation output", () => {
    const input = state();
    const forward = buildCalculatorViewModel({
      activeDirection: "forward",
      completeSpiritIds: new Set(["water"]),
      favoriteSpiritIds: new Set(["fire"]),
      snapshot,
      state: input,
    });
    const reverse = buildCalculatorViewModel({
      activeDirection: "reverse",
      completeSpiritIds: new Set(["water"]),
      favoriteSpiritIds: new Set(["fire"]),
      snapshot,
      state: input,
    });

    expect(forward.configurationReady).toBe(true);
    expect(forward.active.attackSideKey).toBe("attacker");
    expect(reverse.active.attackSideKey).toBe("defender");
    expect(forward.result.attackerName).toBe("火灵");
    expect(reverse.result.attackerName).toBe("水灵");
    expect(forward.result.skillResults).toHaveLength(4);
    expect(forward.result.selectedResult.totalDamage).toBeGreaterThan(0);
    expect(forward.result.typeAnalysis.subjectName).toBe("火灵");
    expect(forward.result.typeAnalysis.defense.weaknesses).toContainEqual({
      type: "水",
      multiplier: 2,
    });
    expect(forward.result.typeAnalysis.offense.coverage).toContainEqual({
      type: "草",
      multiplier: 2,
    });
    expect(reverse.result.typeAnalysis.subjectName).toBe("水灵");
    expect(reverse.result.typeAnalysis.defense.weaknesses).toContainEqual({
      type: "草",
      multiplier: 2,
    });
    expect(forward.selectableSpirits.map((spirit) => spirit.favoriteState)).toEqual([
      "manual",
      "complete",
    ]);
    expect(forward.selectableSpirits[0]).toMatchObject({
      traitDescription: "入场首回合，获得物攻+100%。",
      traitName: "专注力",
    });
    expect(forward.sides.attacker.spirit).toMatchObject({
      traitDescription: "入场首回合，获得物攻+100%。",
      traitName: "专注力",
    });
    expect(input).toEqual(state());
  });

  test.each([
    ["bloodline", "clown-trick", "戏耍", "戏耍·光合治愈"],
    ["trait", "trait_skin_spikes", "刺肤", "刺肤"],
  ])("maps standalone %s damage with the main result's existing-status settlement", (source, traitId, traitName, damageName) => {
    const input = state();
    input.mode = "four";
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.negativeStatuses = { defender: { freeze: 3 } };
    input.directions.forward.selectedDamageSource = source;
    input.directions.forward.context = {
      bloodlineMagicId: "photosynthetic-healing",
      bloodlineMagicTriggered: true,
    };
    input.directions.reverse.currentHp = 300;
    const sourceSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "fire"
          ? { ...spirit, traitIds: [traitId] }
          : spirit,
      ),
      traits: [
        ...snapshot.traits,
        { id: traitId, name: traitName },
      ],
    };

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: sourceSnapshot,
      state: input,
    });

    const row = view.result[`${source}Result`];
    expect(row).toMatchObject({
      name: damageName,
      selected: true,
      negativeStatusSettlement: {
        actualStatusDamage: 0,
        freeze: { stacks: 3, thresholdPercent: 15 },
      },
    });
    expect(row.damage).toBe(view.result.selectedResult.totalDamage);
    expect(row.hpPercent).toBe(view.result.selectedResult.hpPercent);
    expect(row.negativeStatusSettlement.freeze)
      .toEqual(view.result.selectedResult.negativeStatusSettlement.freeze);
    expect(view.result.selectedSkillName).toBe(damageName);
    expect(view.result.skillResults.every((entry) => !entry.selected)).toBe(true);
  });

  test("analyzes the carried four skills even while the single-skill editor is active", () => {
    const input = state();
    input.sides.attacker.skills.single = null;
    input.sides.attacker.skills.four = ["fire-hit", null, null, null];

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot,
      state: input,
    });

    expect(view.result.typeAnalysis.offense.coverage).toContainEqual({
      type: "草",
      multiplier: 2,
    });
  });

  test("attaches optional negative-status settlement without changing direct damage", () => {
    const input = state();
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.directions.forward.hitCount = 2;
    input.directions.forward.context.negativeStatusRepeatSkillsBySlot = { single: "fire-hit" };
    input.negativeStatuses = {
      attacker: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
      defender: { burn: 1, freeze: 0, parasitism: 0, poison: 0 },
    };
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((entry) =>
        entry.id === "fire-hit" ? { ...entry, name: "易燃物质" } : entry,
      ),
    };

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: input,
    });

    const directDamage = view.calculation.forward.selectedResult.totalDamage;
    expect(view.result.selectedResult.totalDamage).toBe(directDamage);
    expect(view.result.selectedResult.negativeStatusApplications.stacks)
      .toMatchObject({ burn: 4 });
    expect(view.result.selectedResult.negativeStatusSettlement).toMatchObject({
      added: { burn: 4 },
      directDamage,
      stacks: { burn: 5 },
      turnPreview: {
        next: {
          added: { burn: 4 },
          stacks: { burn: 6 },
        },
        repeated: true,
      },
    });
  });

  test("仅灼烧生成下回合预估，冻结等异常保留本次结果", () => {
    for (const id of ["freeze", "poison", "parasitism", "electrified", "burn"]) {
      const input = state();
      input.calculationOptions = { includeNegativeStatusSettlement: true };
      input.negativeStatuses = { defender: { [id]: 1 } };
      const view = buildCalculatorViewModel({ activeDirection: "forward", snapshot, state: input });
      const settlement = view.result.selectedResult.negativeStatusSettlement;
      expect(settlement.lethal).toBe(false);
      if (id === "burn") {
        expect(settlement.turnPreview.focusStatusIds).toEqual(["burn"]);
      } else {
        expect(settlement.turnPreview).toBeUndefined();
      }
    }
  });

  test.each([true, false])("双向技能完整结果与选中结果共享异常结算口径（开关%s）", (enabled) => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((skill) => ({ ...skill, basePower: 1 })),
    };
    const input = state();
    input.mode = "four";
    input.calculationOptions = { includeNegativeStatusSettlement: enabled };
    input.negativeStatuses = {
      attacker: { freeze: 3 },
      defender: { freeze: 3 },
    };
    input.directions.forward.currentHp = 30;
    input.directions.reverse.currentHp = 30;

    for (const direction of ["forward", "reverse"]) {
      const view = buildCalculatorViewModel({
        activeDirection: direction,
        snapshot: fixture,
        state: input,
      });
      const rows = view.skillResultsByDirection?.[direction];
      expect(rows).toHaveLength(4);
      const selected = view.result.selectedResult;
      const row = rows[0];
      expect(row.totalDamage).toBe(selected.totalDamage);
      expect(row.negativeStatusSettlement).toEqual(selected.negativeStatusSettlement);
      expect(view.calculation[direction].results[0].negativeStatusSettlement)
        .toBeUndefined();
      if (enabled) {
        expect(row.negativeStatusSettlement).toMatchObject({
          lethal: true,
          freeze: { lethal: true, stacks: 3, thresholdPercent: 15 },
        });
      } else {
        expect(row.negativeStatusSettlement).toBeNull();
      }
    }
  });

  test("毒腺按超导本次结算能耗决定是否施加中毒", () => {
    const superconduct = {
      basePower: 90,
      category: "magical",
      cost: 3,
      id: "superconduct-toxic-gland",
      name: "超导",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const toxicGland = {
      description: "使用1能耗技能时，使敌方获得4层中毒。",
      id: "toxic-gland-dynamic-cost",
      name: "毒腺",
    };
    const fixture = {
      ...snapshot,
      learnsets: snapshot.learnsets.map((entry) =>
        entry.spiritId === "fire"
          ? { ...entry, skillIds: [superconduct.id] }
          : entry,
      ),
      skills: [...snapshot.skills, superconduct],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "fire"
          ? { ...spirit, traitIds: [toxicGland.id] }
          : spirit,
      ),
      traits: [...snapshot.traits, toxicGland],
    };
    const calculate = (burstTriggered) => {
      const input = state();
      input.calculationOptions = { includeNegativeStatusSettlement: true };
      input.directions.forward.context = {
        burstTriggered,
        negativeStatusUseCountsBySlot: { 1: 1 },
      };
      input.negativeStatuses = {
        attacker: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
        defender: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
      };
      input.sides.attacker.skills = {
        four: [
          { context: { burstTriggered }, skillId: superconduct.id },
          null,
          null,
          null,
        ],
        single: { context: { burstTriggered }, skillId: superconduct.id },
      };
      return buildCalculatorViewModel({
        activeDirection: "forward",
        snapshot: fixture,
        state: input,
      }).result.selectedResult;
    };

    expect(calculate(true)).toMatchObject({
      skillCost: 1,
      negativeStatusApplications: {
        stacks: { poison: 4 },
      },
    });
    expect(calculate(false)).toMatchObject({
      skillCost: 3,
      negativeStatusApplications: {
        stacks: { poison: 0 },
      },
    });
  });

  test.each(["single", "four"])("%s attacks preview one application independently of legacy use counts", (mode) => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((entry) =>
        entry.id === "fire-hit" ? { ...entry, name: "寒潮", type: "冰" } : entry,
      ),
      spirits: snapshot.spirits.map((entry) => entry.id === "fire"
        ? { ...entry, traitIds: ["snowball"] } : entry),
      traits: [{ id: "snowball", name: "加个雪球" }],
    };
    const input = state();
    input.mode = mode;
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.negativeStatuses = { attacker: {}, defender: { freeze: 2 } };
    const before = structuredClone(input);
    for (const count of [0, 1, 2]) {
      input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: count };
      const view = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
      expect(view.result.selectedResult.negativeStatusSettlement).toMatchObject({
        added: { freeze: 3 }, freeze: { stacks: 5, thresholdPercent: 25 },
      });
      expect(view.result.selectedResult.negativeStatusApplications.sources).toHaveLength(2);
    }
    delete input.directions.forward.context.negativeStatusUseCountsBySlot;
    expect(input).toEqual(before);
    input.calculationOptions.includeNegativeStatusSettlement = false;
    const disabled = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
    expect(disabled.result.selectedResult.negativeStatusSettlement).toBeNull();
  });

  test.each([
    ["易燃物质", "火", "burn", 4, {}],
    ["炙热波动", "火", "burn", 8, { counterTriggered: true }],
    ["烈焰风暴", "火", "burn", 6, {}],
    ["花火", "火", "burn", 4, {}],
    ["暴风雪", "冰", "freeze", 1, {}],
    ["极寒领域", "冰", "freeze", 2, { negativeStatusCounterState: true }],
    ["滚雪球", "冰", "freeze", 4, { counterTriggered: true }],
    ["寒潮", "冰", "freeze", 5, { negativeStatusCounterState: true }],
    ["通电", "电", "electrified", 1, {}],
    ["毒针", "毒", "poison", 1, {}],
    ["腐蚀酸液", "毒", "poison", 2, {}],
    ["连续毒针", "毒", "poison", 2, {}],
    ["毒囊", "毒", "poison", 6, { negativeStatusCounterState: true }],
    ["毒液渗透", "毒", "poison", 1, {}],
    ["虫群", "虫", "poison", 3, { donationPoisonCount: 3 }],
  ])("%s source is automatic in both modes and directions, with no four-row accumulation", (name, type, status, stacks, context) => {
    const fixture = { ...snapshot,
      skills: snapshot.skills.map((entry) => ({ ...entry, name, type, basePower: 1 })),
      spirits: snapshot.spirits.map((entry) => ({ ...entry, traitIds: [] })),
    };
    for (const mode of ["single", "four"]) for (const direction of ["forward", "reverse"]) {
      const input = state();
      input.mode = mode;
      const source = direction === "forward" ? "attacker" : "defender";
      const target = source === "attacker" ? "defender" : "attacker";
      const id = input.sides[source].skills.single;
      input.sides[source].skills.four = [{ skillId: id, hitCount: 2 }, { skillId: id, hitCount: 2 }, null, null];
      input.directions[direction].hitCount = 2;
      input.directions[direction].context = { ...context };
      input.calculationOptions = { includeNegativeStatusSettlement: true };
      input.negativeStatuses = { attacker: { freeze: 2, poison: 2 }, defender: { freeze: 2, poison: 2 } };
      const before = structuredClone(input);
      const view = buildCalculatorViewModel({ activeDirection: direction, snapshot: fixture, state: input });
      expect(view.result.selectedResult.status).toBe("exact");
      expect(view.result.selectedResult.negativeStatusApplications.stacks[status]).toBe(stacks);
      expect(view.result.selectedResult.totalDamage).toBe(view.calculation[direction].selectedResult.totalDamage);
      if (mode === "four") {
        expect(view.result.results[1].negativeStatusApplications.stacks[status]).toBe(stacks);
        expect(view.result.skillResults[1].negativeStatusSettlement.stacks[status])
          .toBe((input.negativeStatuses[target][status] ?? 0) + stacks);
      }
      expect(input).toEqual(before);
      input.calculationOptions.includeNegativeStatusSettlement = false;
      expect(buildCalculatorViewModel({ activeDirection: direction, snapshot: fixture, state: input })
        .result.selectedResult.negativeStatusSettlement).toBeNull();
    }
  });

  test.each([
    ["电子音乐", "电", "通电", "electrified", 2, 3, { weatherThunder: true }],
    ["生物碱", "草", "测试攻击", "poison", 2, 3, {}],
    ["高浓生物碱", "草", "测试攻击", "poison", 3, 3, {}],
    ["灵魂灼伤", "冰", "测试攻击", "burn", 4, 3, {}],
    ["毒腺", "普通", "测试攻击", "poison", 4, 1, {}],
    ["加个雪球", "冰", "暴风雪", "freeze", 3, 3, {}],
    ["贪心算法", "普通", "测试攻击", "burn", 6, 3, {}],
    ["爆裂玉米", "火", "测试攻击", "parasitism", 1, 3, {}],
    ["溶解扩散", "水", "测试攻击", "poison", 2, 3, {}],
    ["溶解腐蚀", "水", "测试攻击", "poison", 4, 3, {}],
    ["扩散侵蚀", "水", "测试攻击", "poison", 6, 3, {}],
  ])("%s trait joins the first attack preview only once", (traitName, type, name, status, stacks, cost, context) => {
    const fixture = { ...snapshot,
      skills: [...snapshot.skills.map((entry) => ({ ...entry, basePower: 1, cost, name, type })),
        { id: "poison-one", name: "毒孢子", category: "status", type: "毒", basePower: 0 },
        { id: "poison-two", name: "剧毒", category: "status", type: "毒", basePower: 0 }],
      spirits: snapshot.spirits.map((entry) => ({ ...entry, traitIds: ["application-trait"] })),
      traits: [{ id: "application-trait", name: traitName }],
    };
    for (const mode of ["single", "four"]) for (const direction of ["forward", "reverse"]) {
      const input = state();
      input.mode = mode;
      const source = direction === "forward" ? "attacker" : "defender";
      const target = source === "attacker" ? "defender" : "attacker";
      input.sides[source].skills.four = [input.sides[source].skills.single, "poison-one", "poison-two", null];
      input.directions[direction].context = { ...context };
      input.directions[direction].hitCount = 5;
      input.calculationOptions = { includeNegativeStatusSettlement: true };
      input.negativeStatuses = { attacker: {}, defender: {} };
      input.marks[target].negative = { id: "poison", stacks: 3 };
      const result = buildCalculatorViewModel({ activeDirection: direction, snapshot: fixture, state: input }).result.selectedResult;
      expect(result.negativeStatusApplications.stacks[status]).toBe(stacks);
      expect(result.negativeStatusApplications.sources.some((entry) => entry.kind === "trait" && entry.name === traitName)).toBe(true);
    }
  });

  test.each(["physical", "magical"])("legal zero damage %s attacks still preview their application; unsupported attacks do not", (category) => {
    const fixture = { ...snapshot,
      skills: snapshot.skills.map((entry) => ({ ...entry, category, name: "寒潮", type: "冰" })),
      spirits: snapshot.spirits.map((entry) => ({ ...entry, traitIds: [] })),
    };
    const input = state();
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.directions.forward.reduction = 0;
    const zero = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input }).result.selectedResult;
    expect(zero).toMatchObject({ status: "exact", totalDamage: 0, negativeStatusApplications: { stacks: { freeze: 1 } } });
    const unsupportedFixture = { ...fixture, skills: fixture.skills.map((entry) => ({ ...entry, basePower: null })) };
    input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 2, single: 2 };
    const unsupported = buildCalculatorViewModel({ activeDirection: "forward", snapshot: unsupportedFixture, state: input }).result.selectedResult;
    expect(unsupported.status).not.toBe("exact");
    expect(unsupported.negativeStatusApplications.stacks).toEqual({});
  });

  test.each(["易燃物质", "连续毒针", "打喷嚏"])("%s uses capped effective hits, not raw entry input", (name) => {
    const category = name === "打喷嚏" ? "status" : "physical";
    const status = name === "易燃物质" ? "burn" : name === "连续毒针" ? "poison" : "freeze";
    const fixture = { ...snapshot,
      skills: snapshot.skills.map((entry) => ({ ...entry, name, category, basePower: 1 })),
      spirits: snapshot.spirits.map((entry) => ({ ...entry, traitIds: [] })),
    };
    const input = state();
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.directions.forward.hitCount = 150;
    input.directions.forward.context.negativeStatusUseCountsBySlot = { single: 1 };
    const result = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input }).result.selectedResult;
    expect(result.hitCount).toBe(99);
    expect(result.negativeStatusApplications.stacks[status]).toBe(99);
    expect(result.negativeStatusApplications.sources[0].stacks[status]).toBe(99 * (name === "易燃物质" ? 2 : 1));
  });

  test("single result rows use the selected single skill, not the saved four-slot first skill", () => {
    const fixture = { ...snapshot, skills: snapshot.skills.map((entry) => ({ ...entry,
      name: entry.id === "fire-hit" ? "花火" : "暴风雪", basePower: 1,
    })) };
    const input = state();
    input.sides.attacker.skills.single = "water-hit";
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    const view = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
    expect(view.result.selectedResult.negativeStatusSettlement).toMatchObject({ added: { freeze: 1, burn: 0 } });
    expect(view.result.results[0].negativeStatusSettlement).toEqual(view.result.selectedResult.negativeStatusSettlement);
  });

  test("per-hit applications use the final trait-fixed hit count", () => {
    const fixture = { ...snapshot,
      skills: snapshot.skills.map((entry) => ({ ...entry, name: "易燃物质", description: "2连击，每次连击使敌方获得2层灼烧。", basePower: 1 })),
      spirits: snapshot.spirits.map((entry) => ({ ...entry, traitIds: ["filter"] })),
      traits: [{ id: "filter", name: "强制过滤" }],
    };
    const input = state();
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.directions.forward.hitCount = 7;
    input.directions.forward.context.forcedFilterActivated = true;
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input }).result.selectedResult)
      .toMatchObject({ hitCount: 1, negativeStatusApplications: { stacks: { burn: 2 } } });
  });

  test("pure status still needs explicit use; repeat preview is keyed by mode and skill identity", () => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((entry) =>
        entry.id === "fire-hit" ? { ...entry, name: "引燃", category: "status" } : entry,
      ),
    };
    const input = state();
    input.mode = "four";
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.negativeStatuses = {
      attacker: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
      defender: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
    };

    const unused = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
    expect(unused.result.selectedResult.negativeStatusSettlement).toBeNull();

    input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 1 };
    const once = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
    expect(once.result.selectedResult.negativeStatusSettlement).toMatchObject({
      added: { burn: 10 },
      turnPreview: { repeated: false, next: { added: { burn: 0 } } },
    });

    input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 2 };
    const twice = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
    expect(twice.result.selectedResult.negativeStatusSettlement).toMatchObject({
      added: { burn: 10 },
      turnPreview: { repeated: true, next: { added: { burn: 10 } } },
    });
    input.directions.forward.context.negativeStatusRepeatSkillsBySlot = {};
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input })
      .result.selectedResult.negativeStatusSettlement.turnPreview.repeated).toBe(false);
    input.directions.forward.context.negativeStatusRepeatSkillsBySlot = { 1: "fire-hit" };
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input })
      .result.selectedResult.negativeStatusRepeatNextTurn).toBe(true);
    input.mode = "single";
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input })
      .result.selectedResult.negativeStatusRepeatNextTurn).toBe(false);
    input.directions.forward.context.negativeStatusRepeatSkillsBySlot = { single: "fire-hit" };
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input })
      .result.selectedResult.negativeStatusRepeatNextTurn).toBe(true);
  });

  test("does not attach status settlement while the display setting is off", () => {
    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot,
      state: state(),
    });
    expect(view.result.selectedResult.negativeStatusSettlement).toBeNull();
  });

  test("settles 打喷嚏 only when negative-status settlement is enabled", () => {
    const fixture = {
      ...snapshot,
      learnsets: snapshot.learnsets.map((entry) =>
        entry.spiritId === "fire"
          ? { ...entry, skillIds: [...entry.skillIds, "sneeze"] }
          : entry,
      ),
      skills: [
        ...snapshot.skills,
        {
          basePower: 0,
          category: "status",
          id: "sneeze",
          name: "打喷嚏",
          provenance: { basePower: { source: "fixture" } },
          ruleId: null,
          type: "冰",
        },
      ],
    };
    const disabled = state();
    disabled.sides.attacker.skills.single = "sneeze";
    disabled.sides.attacker.skills.four = ["sneeze", null, null, null];
    const disabledView = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: disabled,
    });

    expect(disabledView.result.selectedResult).toMatchObject({
      status: "unsupported",
      negativeStatusSettlement: null,
    });

    const enabled = structuredClone(disabled);
    enabled.calculationOptions = { includeNegativeStatusSettlement: true };
    // 旧四技能槽1不能假定为单技能已使用。
    enabled.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 1 };
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: enabled })
      .result.selectedResult.negativeStatusSettlement).toBeNull();
    enabled.directions.forward.context.negativeStatusUseCountsBySlot = { single: 1 };
    enabled.directions.forward.hitCount = 3;
    const enabledView = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: enabled,
    });
    expect(enabledView.result.selectedResult).toMatchObject({
      hpPercent: 0,
      status: "exact",
      statusOnly: true,
      totalDamage: 0,
      negativeStatusSettlement: {
        added: { freeze: 3 },
        freeze: { stacks: 3, thresholdPercent: 15 },
      },
    });
    expect(enabledView.result.skillResults[0]).toMatchObject({
      hpPercent: 0,
      statusOnly: true,
    });
    enabled.directions.forward.context.negativeStatusUseCountsBySlot.single = 0;
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: enabled })
      .result.selectedResult.negativeStatusSettlement).toBeNull();
  });

  test("passes the target poison mark into diffusion erosion settlement", () => {
    const input = state();
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.marks.defender.negative = { id: "poison", stacks: 3 };
    input.sides.attacker.skills.single = "water-hit";
    input.sides.attacker.skills.four = ["water-hit", null, null, null];
    input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 1 };
    const fixture = {
      ...snapshot,
      learnsets: snapshot.learnsets.map((entry) =>
        entry.spiritId === "fire"
          ? { ...entry, skillIds: ["water-hit"] }
          : entry,
      ),
      spirits: snapshot.spirits.map((entry) =>
        entry.id === "fire"
          ? { ...entry, traitIds: ["diffusion-erosion"] }
          : entry,
      ),
      traits: [
        ...snapshot.traits,
        {
          description: "使用水系技能后，敌方获得中毒，层数等于中毒印记的2倍。",
          id: "diffusion-erosion",
          name: "扩散侵蚀",
        },
      ],
    };

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: input,
    });

    expect(view.result.selectedResult.negativeStatusSettlement.added)
      .toMatchObject({ poison: 6 });
  });

  test("uses target negative-status layers for dependent skill power only while enabled", () => {
    const fixture = {
      ...snapshot,
      learnsets: snapshot.learnsets.map((entry) =>
        entry.spiritId === "fire"
          ? { ...entry, skillIds: ["ice-break"] }
          : entry,
      ),
      skills: [
        ...snapshot.skills,
        {
          basePower: 60,
          category: "physical",
          id: "ice-break",
          name: "碎冰冰",
          provenance: { basePower: { source: "fixture" } },
          ruleId: null,
          type: "冰",
        },
      ],
    };
    const enabled = state();
    enabled.calculationOptions = { includeNegativeStatusSettlement: true };
    enabled.negativeStatuses = {
      attacker: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
      defender: { burn: 0, freeze: 2, parasitism: 0, poison: 0 },
    };
    enabled.sides.attacker.skills.single = {
      context: { enemyFreezeStacks: 9 },
      skillId: "ice-break",
    };
    enabled.sides.attacker.skills.four = [{
      context: { enemyFreezeStacks: 9 },
      skillId: "ice-break",
    }, null, null, null];

    const enabledView = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: enabled,
    });
    expect(enabledView.result.selectedResult.effectivePower).toBe(100);

    const disabled = structuredClone(enabled);
    disabled.calculationOptions.includeNegativeStatusSettlement = false;
    const disabledView = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: disabled,
    });
    expect(disabledView.result.selectedResult.effectivePower).toBe(240);
    const freezeInput = getSkillEffectInputs(fixture.skills.find((skill) => skill.id === "ice-break"))[0];
    enabled.sides.attacker.skills.four[0].context[freezeInput.id] = 50;
    enabled.sides.attacker.skills.single.context[freezeInput.id] = 50;
    // Shared freeze wins over both the old alias and the editor's canonical key.
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: enabled })
      .result.selectedResult.effectivePower).toBe(100);
    disabled.sides.attacker.skills.four[0].context[freezeInput.id] = 50;
    disabled.sides.attacker.skills.single.context[freezeInput.id] = 50;
    expect(buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: disabled })
      .result.selectedResult.effectivePower).toBe(1060);
  });

  test.each([
    ["鸩毒", "enemyPoisonStacks", "poison", 80, 150],
    ["极寒领域", "enemyFrozen", "freeze", 120, 60],
    ["过敏原", "enemyPoisoned", "poison", 60, 60],
  ])("%s 按结算开关关联状态并覆盖旧 canonical 条件", (name, key, status, linkedPower, manualPower) => {
    const skill = { id: "status-linked", name, basePower: 60, category: "magical", type: "普通" };
    const input = getSkillEffectInputs(skill).find((control) => control.contextKey === key);
    const manual = input.type === "boolean" ? false : 9;
    const fixture = { ...snapshot, skills: [...snapshot.skills, skill] };
    const value = state();
    value.negativeStatuses = { attacker: {}, defender: { [status]: 2 } };
    value.sides.attacker.skills.four = [{ skillId: skill.id, context: { [key]: manual, [input.id]: manual } }];
    value.sides.attacker.skills.single = value.sides.attacker.skills.four[0];
    value.calculationOptions = { includeNegativeStatusSettlement: true };
    const calculate = () => buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: value }).result.selectedResult;
    expect(calculate().effectivePower).toBe(linkedPower);
    if (name === "过敏原") expect(calculate().hitCount).toBe(3);
    value.calculationOptions.includeNegativeStatusSettlement = false;
    expect(calculate().effectivePower).toBe(manualPower);
    if (name === "过敏原") expect(calculate().hitCount).toBe(1);
  });

  test("returns an unresolved model when both spirits are not selected", () => {
    const input = state();
    input.sides.attacker.spiritId = null;

    const model = buildCalculatorViewModel({
      activeDirection: "forward",
      completeSpiritIds: new Set(),
      favoriteSpiritIds: new Set(),
      snapshot,
      state: input,
    });

    expect(model.configurationReady).toBe(false);
    expect(model.result).toBeNull();
    expect(model.calculation.forward.selectedResult).toMatchObject({
      reason: "请选择双方精灵",
      status: "unsupported",
    });
  });

  test("projects a triggered fixed-speed trait into the owning side panel", () => {
    const warningTrait = {
      description: "敌方技能足以击败自己时，速度+50。",
      id: "warning",
      name: "预警",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "fire"
          ? { ...spirit, traitIds: [warningTrait.id] }
          : spirit,
      ),
      traits: [warningTrait],
    };
    const input = state();
    input.directions.forward.context = {
      "attackerTrait.attackerTraitEffect.fff35f45": 50,
      "attackerTrait.traitActivated.8c9e2197": true,
    };

    const model = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: fixture,
      state: input,
    });

    expect(model.sides.attacker.finalPanelStats).toMatchObject({ speed: 271 });
  });
});

describe("getTraitView", () => {
  test("换碟列出四个技能的固定威力加成", () => {
    const trait = {
      description: "自己携带的指定音波技能威力提升。",
      id: "disc-swap",
      name: "换碟",
    };
    const fixture = {
      ...snapshot,
      spirits: [
        {
          ...snapshot.spirits[0],
          traitIds: [trait.id],
        },
      ],
      traits: [trait],
    };

    expect(getTraitView(fixture, fixture.spirits[0], "attacker")).toMatchObject({
      description: expect.stringContaining("音波弹 +15"),
      skillPowerBonuses: [
        { fixedPowerAdd: 15, skillName: "音波弹" },
        { fixedPowerAdd: 20, skillName: "音爆" },
        { fixedPowerAdd: 20, skillName: "金属噪音" },
        { fixedPowerAdd: 5, perHit: true, skillName: "午夜噪音" },
      ],
    });
  });
});

describe("getPanelView", () => {
  test("uses calculated final stats and reports the visible delta", () => {
    const spirit = snapshot.spirits[0];
    const side = state().sides.attacker;
    const stats = getPanelView(spirit, side, {
      finalStats: {
        magicalAttack: 240,
        physicalAttack: 360,
        speed: 261,
      },
    });

    expect(stats.find(({ key }) => key === "speed")).toMatchObject({
      basePanel: 221,
      change: "increase",
      delta: 40,
      panel: 261,
    });
    expect(stats.find(({ key }) => key === "hp")).toMatchObject({
      basePanel: 408,
      change: null,
      delta: 0,
      panel: 408,
    });
  });
});
