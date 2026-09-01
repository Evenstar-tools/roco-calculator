import { useRef, useState } from "react";
import { reduceSessionAction } from "../state/calculator-session.js";
import { createUndoHistory } from "../state/undo-history.js";

export function useCalculatorSession({ initialState, onRememberSide, onToast }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);
  const undoHistoryRef = useRef(createUndoHistory({ limit: 50 }));
  const undoBatchRef = useRef(null);
  const undoBatchSequenceRef = useRef(0);
  const [undoCount, setUndoCount] = useState(0);

  function startUndoBatch() {
    if (undoBatchRef.current !== null) return undoBatchRef.current;
    undoBatchSequenceRef.current += 1;
    undoBatchRef.current = undoBatchSequenceRef.current;
    queueMicrotask(() => {
      undoBatchRef.current = null;
    });
    return undoBatchRef.current;
  }

  function commitState(nextState, rememberSide = null, {
    groupKey = null,
    recordHistory = true,
  } = {}) {
    if (nextState === stateRef.current) return nextState;
    if (recordHistory) {
      undoHistoryRef.current.record(stateRef.current, {
        batchToken: startUndoBatch(),
        groupKey,
        rememberSide,
      });
      setUndoCount(undoHistoryRef.current.size());
    }
    stateRef.current = nextState;
    setState(nextState);
    const configuredSide = rememberSide
      ? nextState.sides[rememberSide]
      : null;
    if (configuredSide?.spiritId) onRememberSide(configuredSide);
    return nextState;
  }

  function commitSession(result, options) {
    commitState(result.state, result.persistence.rememberSide, options);
    return result.state;
  }

  function dispatch(action) {
    const valueKeys = action?.value && typeof action.value === "object"
      ? Object.keys(action.value).sort().join(",")
      : "";
    const groupKey = [
      action?.type,
      action?.side,
      action?.direction,
      action?.index,
      action?.stat,
      action?.key,
      valueKeys,
    ].filter((value) => value !== undefined && value !== "").join(":");
    return commitSession(reduceSessionAction(stateRef.current, action), { groupKey });
  }

  function undoLastChange() {
    const previous = undoHistoryRef.current.undo();
    if (!previous) return;
    undoBatchRef.current = null;
    stateRef.current = previous.state;
    setState(previous.state);
    for (const side of previous.rememberSides) {
      const configuredSide = previous.state.sides?.[side];
      if (configuredSide?.spiritId) onRememberSide(configuredSide);
    }
    setUndoCount(undoHistoryRef.current.size());
    onToast("已撤回上一步");
  }

  return {
    commitSession,
    dispatch,
    state,
    stateRef,
    undoCount,
    undoLastChange,
  };
}
