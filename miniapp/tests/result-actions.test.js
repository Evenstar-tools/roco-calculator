import { describe, expect, test } from "vitest";
import { createInitialState } from "../src/shared/state/defaults.js";
import { createResultActions } from "../src/view-models/result-actions.js";

function snapshotFixture() {
  return {
    meta: { id: "test-data", rulesVersion: "test-rules" },
    skills: [
      {
        basePower: 0,
        category: "status",
        id: "steam",
        name: "蒸汽进行曲",
        type: "机械",
      },
      {
        basePower: 0,
        category: "defense",
        description: "减伤80%。",
        id: "shelter",
        name: "羽翼庇护",
        type: "翼",
      },
    ],
    spirits: [
      {
        fullName: "测试攻方",
        id: "attacker",
        raceStats: {
          hp: 100,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 100,
          physicalDefense: 100,
          speed: 100,
        },
        traitIds: [],
        types: ["普通"],
      },
      {
        fullName: "测试守方",
        id: "defender",
        raceStats: {
          hp: 100,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 100,
          physicalDefense: 100,
          speed: 100,
        },
        traitIds: [],
        types: ["普通"],
      },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

describe("result action view model", () => {
  test("攻击附异常无需触发，纯负面技能与攻击战后变化保留明确入口", () => {
    const snapshot = snapshotFixture();
    snapshot.skills = [
      { id: "cold", name: "寒潮", category: "magical", basePower: 95, type: "冰" },
      { id: "frost", name: "霜降", category: "status", basePower: 0, type: "冰" },
    ];
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.calculationOptions.includeNegativeStatusSettlement = true;
    state.sides.attacker.skills.four = ["cold", "frost"];
    const create = (rows = []) => createResultActions({ snapshot, state, direction: "forward", calculation: { rows } });
    expect(create().modifiers.map(action => action.name)).toEqual(["霜降"]);
    expect(create([{ postAttackEffects: { attackLevelStageAdd: 1 } }]).modifiers.map(action => action.name))
      .toEqual(["寒潮", "霜降"]);
    state.calculationOptions.includeNegativeStatusSettlement = false;
    expect(create().modifiers).toEqual([]);
  });

  test.each(["reduction", "activeDefenseStatus"])("普通攻击只在需要真实结束暂态防御 %s 时保留提交入口", (kind) => {
    const snapshot = snapshotFixture();
    snapshot.skills = [{ id: "scratch", name: "抓挠", category: "physical", basePower: 35, type: "普通" }];
    const state = createInitialState(snapshot);
    state.sides.attacker.skills.single = "scratch";
    if (kind === "reduction") state.directions.reverse.reduction = 0.5;
    else state.directions.forward.overrides.activeDefenseStatus = { skillId: "shelter", slotIndex: 0 };
    const actions = createResultActions({ snapshot, state, direction: "forward", calculation: { rows: [] } });
    expect(actions.modifiers).toHaveLength(1);
    expect(actions.modifiers[0]).toMatchObject({ name: "抓挠", negativeStatusApplication: false, negativeStatusToggle: false });
  });
  test.each([["有求必应", "己方双攻 +9层 · 己方速度 +60"], ["一意孤行", "己方双攻 +18层"]])("状态动作的预览包含 %s 实际增益", (name, expected) => {
    const snapshot = snapshotFixture();
    snapshot.skills[0].description = "选择：自己获得速度+60或物攻+90%。";
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.spiritId = "attacker";
    state.sides.attacker.skills.four = [{ skillId: "steam", context: { applyAttackBoost: true, choiceTraitTriggered: true } }];
    const actions = createResultActions({ snapshot, state, direction: "forward", traitViews: { attacker: { name, controls: [] } } });
    expect(actions.modifiers.find((action) => action.name === "蒸汽进行曲").effectHint).toBe(expected);
  });
  test("classifies carried skill and trait triggers into one action each", () => {
    const snapshot = snapshotFixture();
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.spiritId = "attacker";
    state.sides.attacker.skills.four = [
      {
        context: { applyAttackBoost: true, applySpeedBoost: true },
        skillId: "steam",
      },
      "shelter",
      null,
      null,
    ];
    const traitViews = {
      attacker: {
        controls: [
          {
            canonicalKey: "aggressiveTriggered",
            defaultValue: false,
            id: "aggressiveTriggered",
            label: "主动触发",
            type: "boolean",
          },
        ],
        description: "触发后提高攻击。",
        name: "勇猛",
        ownerSide: "attacker",
      },
      defender: {
        controls: [
          {
            canonicalKey: "guardTriggered",
            defaultValue: false,
            id: "guardTriggered",
            label: "防御触发",
            type: "boolean",
          },
        ],
        description: "触发后降低伤害。",
        name: "坚守",
        ownerSide: "defender",
      },
    };

    const actions = createResultActions({
      direction: "forward",
      snapshot,
      state,
      traitViews,
    });

    expect(actions.modifiers.map((item) => item.name)).toContain("蒸汽进行曲");
    expect(actions.defense.map((item) => item.name)).toEqual(
      expect.arrayContaining(["羽翼庇护", "坚守"]),
    );
    expect(actions.defense.find((item) => item.name === "羽翼庇护"))
      .toMatchObject({ triggerHint: "防御技能触发后按本次应对结算" });
    expect(actions.modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "trait",
          name: "勇猛",
          source: "特性",
          triggerHint: "开启“主动触发”后按当前参数结算",
        }),
      ]),
    );
  });

  test("uses the selected single skill as the only skill action", () => {
    const snapshot = snapshotFixture();
    const state = createInitialState(snapshot);
    state.mode = "single";
    state.sides.attacker.spiritId = "attacker";
    state.sides.attacker.skills.single = "shelter";

    const actions = createResultActions({
      direction: "forward",
      snapshot,
      state,
      traitViews: {},
    });

    expect(actions.defense).toEqual([
      expect.objectContaining({ mode: "single", name: "羽翼庇护" }),
    ]);
    expect([
      ...actions.defense,
      ...actions.modifiers,
    ].filter((item) => item.kind === "skill")).toHaveLength(1);
  });

  test("merges former status actions into modifiers", () => {
    const snapshot = snapshotFixture();
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.spiritId = "attacker";
    state.sides.attacker.skills.four = ["steam", null, null, null];

    const actions = createResultActions({
      direction: "forward",
      snapshot,
      state,
      traitViews: {},
    });

    expect(actions).not.toHaveProperty("status");
    expect(actions.modifiers).toEqual([
      expect.objectContaining({ name: "蒸汽进行曲" }),
    ]);
  });

  test("groups all controls from one trait into a single action card", () => {
    const snapshot = snapshotFixture();
    const state = createInitialState(snapshot);
    const controls = [
      {
        canonicalKey: "trait.judgment.stacks",
        defaultValue: 0,
        id: "judgmentStacks",
        label: "触发层数",
        type: "number",
      },
      {
        canonicalKey: "trait.judgment.attack",
        defaultValue: 20,
        id: "judgmentAttack",
        label: "每层攻防",
        type: "number",
      },
      {
        canonicalKey: "trait.judgment.speed",
        defaultValue: 20,
        id: "judgmentSpeed",
        label: "每层速度",
        type: "number",
      },
    ];

    const actions = createResultActions({
      direction: "forward",
      snapshot,
      state,
      traitViews: {
        attacker: {
          controls,
          description: "造成克制伤害后获得增益。",
          name: "裁决",
          ownerSide: "attacker",
        },
      },
    });
    const traitActions = actions.modifiers.filter(
      (item) => item.kind === "trait",
    );

    expect(traitActions).toHaveLength(1);
    expect(traitActions[0]).toMatchObject({
      controls,
      name: "裁决",
      values: {
        "trait.judgment.attack": 20,
        "trait.judgment.speed": 20,
        "trait.judgment.stacks": 0,
      },
    });
  });
});
