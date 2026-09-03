import { describe, expect, test, vi } from "vitest";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { createInitialState } from "../src/shared/state/defaults.js";

const COMPLETE_RACE_STATS = {
  hp: 100,
  speed: 100,
  physicalAttack: 100,
  magicalAttack: 100,
  physicalDefense: 100,
  magicalDefense: 100,
};

function createSnapshot() {
  return {
    meta: {
      id: "data-v1",
      rulesVersion: "rules-v1",
    },
    spirits: [
      { id: "spirit-a", raceStats: COMPLETE_RACE_STATS },
      { id: "spirit-b", raceStats: COMPLETE_RACE_STATS },
    ],
    skills: [
      { id: "skill-a" },
      { id: "skill-b" },
      { id: "skill-c" },
      { id: "skill-d" },
    ],
  };
}

describe("createCalculatorStore", () => {
  test("uses the synchronous calculator reducer for dispatch", () => {
    const snapshot = createSnapshot();
    const persistedState = {
      ...createInitialState(snapshot),
      mode: "four",
    };
    const store = createCalculatorStore(snapshot, persistedState);

    expect(store.getState()).toBe(persistedState);
    expect(store.dispatch({ type: "sides/swap" })).toEqual({
      type: "sides/swap",
    });
    expect(store.getState()).toMatchObject({
      mode: "four",
      sides: {
        attacker: { spiritId: "spirit-b" },
        defender: { spiritId: "spirit-a" },
      },
    });
  });

  test("notifies active subscribers after a dispatch and supports unsubscribe", () => {
    const store = createCalculatorStore(createSnapshot());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({ type: "mode/set", value: "four" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(store.getState());

    unsubscribe();
    store.dispatch({ type: "mode/set", value: "single" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("reset replaces state with fresh snapshot defaults and notifies subscribers", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    const initialState = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "mode/set", value: "four" });
    listener.mockClear();

    store.reset();

    expect(store.getState()).toEqual(createInitialState(snapshot));
    expect(store.getState()).not.toBe(initialState);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(store.getState());
  });
});
