import { describe, expect, test, vi } from "vitest";

import {
  RESULT_TRIGGER_ID,
  restoreResultContext,
} from "../src/platform/result-interaction.js";
import {
  createResultActionRecord,
  restoreResultAction,
} from "../src/state/result-action-history.js";
import { createUndoHistory } from "../src/state/undo-history.js";

describe("createUndoHistory", () => {
  test("coalesces rapid changes from the same control into one undo step", () => {
    const history = createUndoHistory({ coalesceMs: 400, limit: 50 });

    history.record({ value: 0 }, { groupKey: "attack-stage", now: 1000 });
    history.record({ value: 1 }, { groupKey: "attack-stage", now: 1200 });

    expect(history.size()).toBe(1);
    expect(history.undo()).toEqual({ rememberSides: [], state: { value: 0 } });
  });

  test("keeps separate controls and delayed changes distinct", () => {
    const history = createUndoHistory({ coalesceMs: 400, limit: 50 });

    history.record({ value: 0 }, { groupKey: "attack-stage", now: 1000 });
    history.record({ value: 1 }, { groupKey: "defense-stage", now: 1100 });
    history.record({ value: 2 }, { groupKey: "defense-stage", now: 1600 });

    expect(history.size()).toBe(3);
    expect(history.undo()?.state).toEqual({ value: 2 });
  });
});

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

describe("result interaction platform adapter", () => {
  test("uses element focus for H5 without native page scrolling", () => {
    const trigger = { focus: vi.fn() };
    const platform = {
      nextTick: vi.fn(),
      pageScrollTo: vi.fn(),
      showToast: vi.fn(),
    };

    expect(restoreResultContext({ platform, trigger })).toBe("h5-focus");
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(platform.nextTick).not.toHaveBeenCalled();
  });

  test("restores WeApp context with a stable selector and announcement", () => {
    let scheduled;
    const platform = {
      nextTick: vi.fn((callback) => {
        scheduled = callback;
      }),
      pageScrollTo: vi.fn(),
      showToast: vi.fn(),
    };

    expect(restoreResultContext({ platform, trigger: null }))
      .toBe("weapp-context");
    expect(platform.nextTick).toHaveBeenCalledOnce();
    scheduled();
    expect(platform.pageScrollTo).toHaveBeenCalledWith({
      duration: 0,
      selector: `#${RESULT_TRIGGER_ID}`,
    });
    expect(platform.showToast).toHaveBeenCalledWith({
      duration: 1500,
      icon: "none",
      title: "已关闭伤害结果，已返回结果栏",
    });
  });
});
