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
});
