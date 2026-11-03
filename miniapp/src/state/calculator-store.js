import { createInitialState } from "../shared/state/defaults.js";
import { calculatorReducer } from "../shared/state/reducer.js";
import { withMiniappBattleLevelDefaults } from "./battle-level-defaults.js";

export function createCalculatorStore(snapshot, persistedState) {
  const initialState = createInitialState(snapshot);
  let state = withMiniappBattleLevelDefaults(snapshot, persistedState
    ? calculatorReducer(initialState, { type: "state/replace", value: persistedState })
    : initialState);
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  return {
    getState() {
      return state;
    },

    dispatch(action) {
      state = withMiniappBattleLevelDefaults(snapshot, calculatorReducer(state, action));
      notify();
      return action;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    reset() {
      state = withMiniappBattleLevelDefaults(snapshot, createInitialState(snapshot));
      notify();
    },
  };
}
