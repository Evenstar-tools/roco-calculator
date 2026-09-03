import { describe, expect, test } from "vitest";
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

  test("maps standalone bloodline damage without leaving a skill row selected", () => {
    const input = state();
    input.mode = "four";
    input.directions.forward.selectedDamageSource = "bloodline";
    input.directions.forward.context = {
      bloodlineMagicId: "photosynthetic-healing",
      bloodlineMagicTriggered: true,
    };
    input.directions.reverse.currentHp = 300;
    const clownSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "fire"
          ? { ...spirit, traitIds: ["clown-trick"] }
          : spirit,
      ),
      traits: [
        ...snapshot.traits,
        { id: "clown-trick", name: "戏耍", description: "实际回复转为真伤。" },
      ],
    };

    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot: clownSnapshot,
      state: input,
    });

    expect(view.result.bloodlineResult).toMatchObject({
      name: "戏耍·光合治愈",
      selected: true,
    });
    expect(view.result.selectedSkillName).toBe("戏耍·光合治愈");
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
    input.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 2 };
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

  test("applies a negative-status source only after use and repeats it next turn after a second use", () => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((entry) =>
        entry.id === "fire-hit" ? { ...entry, name: "引燃" } : entry,
      ),
    };
    const input = state();
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    input.negativeStatuses = {
      attacker: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
      defender: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
    };

    const unused = buildCalculatorViewModel({ activeDirection: "forward", snapshot: fixture, state: input });
    expect(unused.result.selectedResult.negativeStatusSettlement.added.burn).toBe(0);

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
    enabled.directions.forward.context.negativeStatusUseCountsBySlot = { 1: 1 };
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
    expect(disabledView.result.selectedResult.effectivePower).toBe(60);
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
