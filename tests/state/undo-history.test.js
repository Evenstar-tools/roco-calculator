import { describe, expect, test } from "vitest";
import { createUndoHistory } from "../../src/state/undo-history.js";

describe("undo history", () => {
  test("restores calculator snapshots in last-in-first-out order", () => {
    const history = createUndoHistory();
    const first = { value: 1 };
    const second = { value: 2 };

    history.record(first, { rememberSide: "attacker" });
    history.record(second, { rememberSide: "defender" });

    expect(history.undo()).toEqual({
      rememberSides: ["defender"],
      state: second,
    });
    expect(history.undo()).toEqual({
      rememberSides: ["attacker"],
      state: first,
    });
    expect(history.undo()).toBeNull();
  });

  test("keeps at most fifty changes", () => {
    const history = createUndoHistory({ limit: 50 });
    for (let value = 0; value < 55; value += 1) {
      history.record({ value });
    }

    expect(history.size()).toBe(50);
    for (let value = 54; value >= 5; value -= 1) {
      expect(history.undo()?.state).toEqual({ value });
    }
    expect(history.undo()).toBeNull();
  });

  test("coalesces one control's rapid changes and one synchronous user action", () => {
    const history = createUndoHistory({ coalesceMs: 400 });
    history.record({ value: 0 }, {
      batchToken: 1,
      groupKey: "ability:attacker",
      now: 100,
      rememberSide: "attacker",
    });
    history.record({ value: 1 }, {
      batchToken: 2,
      groupKey: "ability:attacker",
      now: 250,
      rememberSide: "defender",
    });
    history.record({ value: 2 }, {
      batchToken: 2,
      groupKey: "different-control",
      now: 250,
    });

    expect(history.size()).toBe(1);
    expect(history.undo()).toEqual({
      rememberSides: ["attacker", "defender"],
      state: { value: 0 },
    });
  });
});
