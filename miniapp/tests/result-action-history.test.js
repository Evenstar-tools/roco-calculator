import { describe, expect, test } from "vitest";
import {
  createResultActionRecord,
  restoreResultAction,
} from "../src/state/result-action-history.js";

describe("result action history", () => {
  test("restores the exact state produced by the last action", () => {
    const beforeState = { directions: { forward: { level: 0 } } };
    const afterState = { directions: { forward: { level: 1 } } };
    const record = createResultActionRecord(
      "skill:attacker:four:0",
      beforeState,
      afterState,
    );

    expect(restoreResultAction(afterState, record)).toEqual({
      restored: true,
      state: beforeState,
    });
  });

  test("refuses to overwrite state changed after the action", () => {
    const beforeState = { directions: { forward: { level: 0 } } };
    const afterState = { directions: { forward: { level: 1 } } };
    const changedState = { directions: { forward: { level: 2 } } };
    const record = createResultActionRecord(
      "skill:attacker:four:0",
      beforeState,
      afterState,
    );

    expect(restoreResultAction(changedState, record)).toEqual({
      reason: "状态已变化，无法安全撤销；可在战斗条件中调整",
      restored: false,
      state: changedState,
    });
  });

  test("keeps the selected result row while undoing an unchanged action", () => {
    const beforeState = {
      directions: {
        forward: {
          overrides: {},
          selectedDamageSource: "skill",
          selectedSkillIndex: 0,
          traitDamageHitCount: 1,
        },
      },
    };
    const afterState = {
      directions: {
        forward: {
          overrides: { attackLevelStage: 1 },
          selectedDamageSource: "skill",
          selectedSkillIndex: 0,
          traitDamageHitCount: 1,
        },
      },
    };
    const currentState = {
      directions: {
        forward: {
          overrides: { attackLevelStage: 1 },
          selectedDamageSource: "skill",
          selectedSkillIndex: 2,
          traitDamageHitCount: 3,
        },
      },
    };
    const record = createResultActionRecord(
      "skill:attacker:four:0",
      beforeState,
      afterState,
    );

    expect(restoreResultAction(currentState, record)).toEqual({
      restored: true,
      state: {
        directions: {
          forward: {
            overrides: {},
            selectedDamageSource: "skill",
            selectedSkillIndex: 2,
            traitDamageHitCount: 3,
          },
        },
      },
    });
  });
});
