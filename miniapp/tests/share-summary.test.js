import { describe, expect, test } from "vitest";
import { createInitialState } from "../src/shared/state/defaults.js";
import { createShareSummary } from "../src/view-models/share-summary.js";

const snapshot = {
  meta: { id: "data-v1", rulesVersion: "rules-v1" },
  spirits: [
    { id: "a", fullName: "烈焰兽", traitIds: [] },
    { id: "b", fullName: "潮汐兽", traitIds: [] },
  ],
  skills: [
    { id: "s1", name: "烈焰冲击" },
    { id: "s2", name: "潮汐冲击" },
  ],
  traits: [],
};

describe("share summary", () => {
  test("summarizes the active direction, ability stages and non-default conditions", () => {
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.nature = "adamant";
    state.sides.attacker.displayIvs.physicalAttack = 0;
    state.directions.reverse.overrides = {
      attackLevelStage: 2,
      defenseLevelStage: -1,
    };
    state.directions.reverse.currentHp = 300;
    state.directions.reverse.reduction = 0.8;

    const summary = createShareSummary({
      direction: "reverse",
      snapshot,
      state,
    });

    expect(summary).toMatchObject({
      attackerName: "潮汐兽",
      defenderName: "烈焰兽",
      modeLabel: "四技能",
      attackStageLabel: "+2",
      defenseStageLabel: "-1",
    });
    expect(summary.defenderNature).toContain("固执");
    expect(summary.defenderIvs).toContain("物攻0");
    expect(summary.conditions).toEqual(["目标 HP 300", "减伤 20%"]);
  });

  test("includes applied skill effects and detailed trait controls", () => {
    const state = createInitialState(snapshot);
    const summary = createShareSummary({
      actions: {
        defense: [],
        modifiers: [
          {
            description: "自己获得全技能威力+20，迅捷。",
            effectHint: "全技能威力 +20",
            key: "skill:attacker:four:1",
            kind: "skill",
            name: "羽化加速",
          },
          {
            controls: [
              {
                canonicalKey: "trait.prophet.stacks",
                defaultValue: 0,
                label: "触发层数",
                type: "number",
              },
              {
                canonicalKey: "trait.prophet.attack",
                defaultValue: 50,
                label: "每层双攻",
                type: "number",
              },
              {
                canonicalKey: "trait.prophet.speed",
                defaultValue: 50,
                label: "每层速度",
                type: "number",
              },
            ],
            key: "trait:attacker:先知",
            kind: "trait",
            name: "先知",
            values: {
              "trait.prophet.attack": 50,
              "trait.prophet.speed": 50,
              "trait.prophet.stacks": 1,
            },
          },
        ],
      },
      activeActionKeys: ["skill:attacker:four:1"],
      direction: "forward",
      snapshot,
      state,
    });

    expect(summary.appliedSkillEffects).toEqual([
      "羽化加速已应用（全技能威力 +20）",
    ]);
    expect(summary.conditions).toContain(
      "先知：触发层数 1；每层双攻 50；每层速度 50",
    );
  });
});
