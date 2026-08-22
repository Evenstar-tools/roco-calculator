import { describe, expect, test } from "vitest";
import { createUndoHistory } from "../src/state/undo-history.js";

describe("createUndoHistory", () => {
  test("coalesces rapid changes from the same control into one undo step", () => {
    const history = createUndoHistory({ coalesceMs: 400, limit: 50 });

    history.record({ value: 0 }, { groupKey: "attack-stage", now: 1000 });
    history.record({ value: 1 }, { groupKey: "attack-stage", now: 1200 });

    expect(history.size()).toBe(1);
    expect(history.undo()).toEqual({ rememberSides: [], state: { value: 0 } });
  });

  test("keeps separate controls and changes outside the rapid window distinct", () => {
    const history = createUndoHistory({ coalesceMs: 400, limit: 50 });

    history.record({ value: 0 }, { groupKey: "attack-stage", now: 1000 });
    history.record({ value: 1 }, { groupKey: "defense-stage", now: 1100 });
    history.record({ value: 2 }, { groupKey: "defense-stage", now: 1600 });

    expect(history.size()).toBe(3);
    expect(history.undo()?.state).toEqual({ value: 2 });
  });
});
