const SELECTABLE_TYPES = new Set(["text", "search", "number", "tel", "url", "email", "password"]);

// Document delegation includes lazy dialogs and portals without changing field handlers.
export function installInputSelection(document) {
  let pointer = null;
  let composing = false;

  function eligible(target) {
    return target?.tagName === "INPUT" && SELECTABLE_TYPES.has(target.type)
      && !target.disabled && !target.readOnly && target.dataset.autoSelect !== "false";
  }

  function select(target) {
    if (!composing && eligible(target) && target.value && document.activeElement === target) target.select();
  }

  function resetPointer() { pointer = null; }

  function onPointerDown(event) {
    pointer = {
      target: event.target,
      fresh: document.activeElement !== event.target,
      select: event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey,
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
  }

  function onPointerMove(event) {
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) pointer.dragged = true;
  }

  function onFocus(event) {
    // Let a pointer gesture finish before selecting, so native drag selection survives.
    if (pointer?.target !== event.target) select(event.target);
  }

  function onClick(event) {
    const gesture = pointer;
    resetPointer();
    if (gesture?.target === event.target && gesture.fresh && gesture.select && !gesture.dragged
      && !event.defaultPrevented && event.detail <= 1) select(event.target);
  }

  function onCompositionStart() { composing = true; }
  function onCompositionEnd() { composing = false; }
  function onWindowBlur() { resetPointer(); composing = false; }

  const listeners = [
    ["pointerdown", onPointerDown, true],
    ["pointermove", onPointerMove, true],
    ["pointerup", onPointerMove, true],
    ["pointercancel", resetPointer, true],
    ["keydown", resetPointer, true],
    ["focusin", onFocus, false],
    ["click", onClick, false],
    ["compositionstart", onCompositionStart, true],
    ["compositionend", onCompositionEnd, true],
  ];
  for (const args of listeners) document.addEventListener(...args);
  document.defaultView?.addEventListener("blur", onWindowBlur);
  return () => {
    for (const args of listeners) document.removeEventListener(...args);
    document.defaultView?.removeEventListener("blur", onWindowBlur);
    onWindowBlur();
  };
}
