import { useEffect, useRef, useState } from "react";
import { reduceSessionAction } from "../state/calculator-session.js";
import { createUndoHistory } from "../state/undo-history.js";
import { useLocale } from "../i18n/LocaleContext.jsx";

function sessionIssueMessage(code, restoring) {
  if (code === "STORAGE_CONFLICT") return "另一标签页已更新会话；本标签内容已保留，请先导出再刷新";
  if (code === "INCOMPATIBLE_SERVER_VERSION" || code === "SERVER_MISMATCH") return "会话版本或服务器不匹配；原记录已保留，未载入";
  if (code === "STORAGE_CORRUPT") return "工作会话记录损坏；原记录已保留，未覆盖";
  return restoring ? "工作会话恢复失败；原记录已保留" : "工作会话保存失败；本标签内容仍保留";
}

export function useCalculatorSession({ initialState, onRememberSide, onToast, onCommit, sessionStore = null, restoreSession = true, serverId = "cn" }) {
  const { t } = useLocale();
  const [startup] = useState(() => {
    const history = createUndoHistory({ limit: 50 });
    try {
      const saved = sessionStore?.loadSession();
      if (saved && restoreSession) {
        history.restore(saved);
        return { state: saved.present, history, warning: "", restored: true };
      }
      return { state: initialState, history, warning: "" };
    } catch (error) {
      return { state: initialState, history, warning: sessionIssueMessage(error.code, true) };
    }
  });
  const [state, setState] = useState(startup.state);
  const stateRef = useRef(startup.state);
  const undoHistoryRef = useRef(startup.history);
  const lastStorageIssue = useRef("");
  const undoBatchRef = useRef(null);
  const undoBatchSequenceRef = useRef(0);
  const discreteUndoBatchRef = useRef(null);
  const [undoCount, setUndoCount] = useState(() => startup.history.size());
  const [redoCount, setRedoCount] = useState(() => startup.history.redoSize());
  useEffect(() => { if (startup.warning) onToast(t(startup.warning)); }, [startup, onToast, t]);

  function persistSession() {
    if (!sessionStore) return;
    try {
      sessionStore.saveSession({ present: stateRef.current, ...undoHistoryRef.current.snapshot() });
      lastStorageIssue.current = "";
    } catch (error) {
      if (lastStorageIssue.current !== (error.code ?? "unknown")) onToast(t(sessionIssueMessage(error.code, false)));
      lastStorageIssue.current = error.code ?? "unknown";
    }
  }

  function startUndoBatch() {
    if (undoBatchRef.current !== null) return undoBatchRef.current;
    undoBatchSequenceRef.current += 1;
    undoBatchRef.current = undoBatchSequenceRef.current;
    queueMicrotask(() => {
      undoBatchRef.current = null;
    });
    return undoBatchRef.current;
  }

  // Explicit uses are separate actions, even within the rapid-input window.
  function beginDiscreteAction() {
    undoBatchRef.current = null;
    discreteUndoBatchRef.current = startUndoBatch();
  }

  function commitState(nextState, rememberSide = null, {
    groupKey = null,
    recordHistory = true,
  } = {}) {
    if (nextState === stateRef.current) return nextState;
    if (recordHistory) {
      const batchToken = startUndoBatch();
      undoHistoryRef.current.record(stateRef.current, {
        batchToken,
        groupKey: discreteUndoBatchRef.current === batchToken ? null : groupKey,
        rememberSide,
      });
      setUndoCount(undoHistoryRef.current.size());
      setRedoCount(undoHistoryRef.current.redoSize());
    }
    const previous = stateRef.current;
    stateRef.current = nextState;
    setState(nextState);
    onCommit?.(nextState, previous, recordHistory);
    const configuredSide = rememberSide
      ? nextState.sides[rememberSide]
      : null;
    if (configuredSide?.spiritId) onRememberSide(configuredSide);
    persistSession();
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
      action?.traitId,
      action?.key,
      valueKeys,
    ].filter((value) => value !== undefined && value !== "").join(":");
    return commitSession(reduceSessionAction(stateRef.current, action, { serverId }), { groupKey });
  }

  function undoLastChange() {
    restoreHistory(undoHistoryRef.current.undo(stateRef.current), "已撤回上一步");
  }

  function redoLastChange() {
    restoreHistory(undoHistoryRef.current.redo(stateRef.current), "已重做一步");
  }

  function restoreHistory(previous, message) {
    if (!previous) return;
    undoBatchRef.current = null;
    const current = stateRef.current;
    stateRef.current = previous.state;
    setState(previous.state);
    onCommit?.(previous.state, current, true);
    for (const side of previous.rememberSides) {
      const configuredSide = previous.state.sides?.[side];
      if (configuredSide?.spiritId) onRememberSide(configuredSide);
    }
    setUndoCount(undoHistoryRef.current.size());
    setRedoCount(undoHistoryRef.current.redoSize());
    onToast(t(message));
    persistSession();
  }

  return {
    beginDiscreteAction,
    commitSession,
    hasRestoredSession: startup.restored === true,
    dispatch,
    state,
    stateRef,
    undoCount,
    undoLastChange,
    redoCount,
    redoLastChange,
  };
}
