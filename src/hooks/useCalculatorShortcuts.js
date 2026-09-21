import { useEffect, useRef } from "react";

const TAB_HOLD_MS = 350;
const UNDO_HOLD_MS = 450;
const UNDO_REPEAT_MS = 120;
const INPUT_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]';

export function useCalculatorShortcuts({ enabled, viewMode, onPreview, onModeChange, canUndo, onUndo, canRedo, onRedo, onSearch, onSwap, onTeam, onHelp, bindings = {} }) {
  const actions = useRef(null);
  useEffect(() => {
    actions.current = { enabled, viewMode, onPreview, onModeChange, canUndo, onUndo, canRedo, onRedo, onSearch, onSwap, onTeam, onHelp, bindings };
  });

  useEffect(() => {
    let tab = null;
    let undoHeld = false;
    let undoTimer = null;

    function inputFocused(target = document.activeElement) {
      return Boolean(target?.closest?.(INPUT_SELECTOR));
    }

    function stopUndo() {
      undoHeld = false;
      clearTimeout(undoTimer);
      undoTimer = null;
    }

    function cancel() {
      if (tab) {
        tab = null;
        actions.current.onPreview(null);
      }
      stopUndo();
    }

    function repeatUndo() {
      if (!undoHeld || !actions.current.enabled || inputFocused() || !actions.current.canUndo) {
        stopUndo();
        return;
      }
      actions.current.onUndo();
      undoTimer = setTimeout(repeatUndo, UNDO_REPEAT_MS);
    }

    function keyDown(event) {
      if (!actions.current.enabled || event.defaultPrevented || event.isComposing || event.keyCode === 229 || inputFocused(event.target)) return;
      const current = actions.current;
      const key = event.key.toLowerCase();
      const shortcutKey = key === "/" && event.shiftKey ? "?" : key;
      if (key === "z" && event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && current.onRedo) {
        event.preventDefault();
        stopUndo();
        if (!event.repeat && current.canRedo) current.onRedo();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const commands = {
          [current.bindings.attacker ?? "a"]: () => current.onSearch?.("attacker"),
          [current.bindings.defender ?? "d"]: () => current.onSearch?.("defender"),
          [current.bindings.swap ?? "x"]: current.onSwap,
          [current.bindings.team ?? "t"]: current.onTeam,
          [current.bindings.help ?? "?"]: current.onHelp,
        };
        const command = (!event.shiftKey || shortcutKey === "?") && commands[shortcutKey];
        if (command) {
          event.preventDefault();
          stopUndo();
          if (!event.repeat) command();
          return;
        }
      }
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (tab || event.repeat) return;
        stopUndo();
        const next = actions.current.viewMode === "compact" ? "detailed" : "compact";
        tab = { next, startedAt: Date.now() };
        actions.current.onPreview(next);
      } else if (event.key.toLowerCase() === "z" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (undoHeld || event.repeat || !actions.current.canUndo) return;
        stopUndo();
        undoHeld = true;
        actions.current.onUndo();
        undoTimer = setTimeout(repeatUndo, UNDO_HOLD_MS);
      } else {
        stopUndo();
      }
    }

    function keyUp(event) {
      if (event.key === "Tab" && tab) {
        event.preventDefault();
        const pending = tab;
        tab = null;
        if (!pending.interacted && Date.now() - pending.startedAt < TAB_HOLD_MS) actions.current.onModeChange(pending.next);
        actions.current.onPreview(null);
      }
      if (event.key.toLowerCase() === "z" || event.key === "Control") stopUndo();
    }

    function editWhileHeld() {
      if (tab) tab.interacted = true;
      stopUndo();
    }

    function ownedTabDown(event) {
      if (!tab) return;
      if (event.key !== "Tab") {
        tab.interacted = true;
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        cancel();
        return;
      }
      // 临时界面内可编辑；已持有的 Tab 连发不能变成输入框移焦。
      event.preventDefault();
      event.stopPropagation();
    }

    function visibilityChange() {
      if (document.hidden) cancel();
    }

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keydown", ownedTabDown, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointerdown", editWhileHeld, true);
    document.addEventListener("focusin", editWhileHeld);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      cancel();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keydown", ownedTabDown, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointerdown", editWhileHeld, true);
      document.removeEventListener("focusin", editWhileHeld);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, []);
}
