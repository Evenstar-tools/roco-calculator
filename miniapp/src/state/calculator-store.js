import { createInitialState } from "../shared/state/defaults.js";
import { calculatorReducer } from "../shared/state/reducer.js";

export function createCalculatorStore(snapshot, persistedState) {
  let state = persistedState ?? createInitialState(snapshot);
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
      state = calculatorReducer(state, action);
      notify();
      return action;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    reset() {
      state = createInitialState(snapshot);
      notify();
    },
  };
}
