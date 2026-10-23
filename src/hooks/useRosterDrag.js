import { useCallback, useEffect, useRef, useState } from "react";

export function useRosterDrag({ members, onReorder }) {
  const listRef = useRef(null);
  const sessionRef = useRef(null);
  const callbackRef = useRef(onReorder);
  const suppressClickRef = useRef(0);
  const [drag, setDrag] = useState(null);

  useEffect(() => { callbackRef.current = onReorder; }, [onReorder]);

  const publish = useCallback((session) => {
    setDrag({ from: session.from, over: session.over, x: session.x - session.offsetX,
      y: session.y - session.offsetY, width: session.width, height: session.height });
  }, []);

  const activate = useCallback((session) => {
    if (sessionRef.current !== session) return;
    session.active = true;
    clearTimeout(session.timer);
    if (session.pointerId !== undefined) listRef.current?.setPointerCapture?.(session.pointerId);
    window.getSelection()?.removeAllRanges();
    publish(session);
  }, [publish]);

  function begin(index, point, kind, pointerId) {
    if (!onReorder || !members[index] || sessionRef.current) return;
    const card = listRef.current?.querySelector(`[data-slot-index="${index}"]`);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const session = { from: index, over: index, kind, pointerId, active: false,
      x: point.clientX, y: point.clientY, startX: point.clientX, startY: point.clientY,
      offsetX: point.clientX - rect.left, offsetY: point.clientY - rect.top,
      width: rect.width, height: rect.height };
    sessionRef.current = session;
    session.timer = setTimeout(() => activate(session), kind === "touch" ? 320 : 220);
  }

  useEffect(() => {
    function finish(commit = false) {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      clearTimeout(session.timer);
      if (!session.active) return;
      suppressClickRef.current = performance.now() + 300;
      if (session.pointerId !== undefined && listRef.current?.hasPointerCapture?.(session.pointerId)) {
        listRef.current.releasePointerCapture(session.pointerId);
      }
      setDrag(null);
      if (commit && session.over !== null && session.from !== session.over) {
        callbackRef.current?.(session.from, session.over);
      }
    }

    function move(point, event) {
      const session = sessionRef.current;
      if (!session) return;
      session.x = point.clientX;
      session.y = point.clientY;
      if (!session.active) {
        if (Math.hypot(session.x - session.startX, session.y - session.startY) < (session.kind === "touch" ? 8 : 6)) return;
        if (session.kind === "touch") { finish(); return; }
        activate(session);
      }
      if (event.cancelable) event.preventDefault();
      const list = listRef.current;
      const bounds = list.getBoundingClientRect();
      const inside = session.x >= bounds.left && session.x <= bounds.right && session.y >= bounds.top && session.y <= bounds.bottom;
      session.over = null;
      if (inside) {
        const slots = [...list.querySelectorAll("[data-slot-position]")];
        const nearest = slots.map((slot) => {
          const rect = slot.getBoundingClientRect();
          return { position: Number(slot.dataset.slotPosition), distance: Math.hypot(session.x - (rect.left + rect.width / 2), session.y - (rect.top + rect.height / 2)) };
        }).sort((a, b) => a.distance - b.distance)[0];
        session.over = nearest?.position ?? null;
      }
      // Scroll the roster's existing scroll pane, rather than moving the whole dialog.
      let pane = list.parentElement;
      while (pane && pane !== document.body) {
        const style = getComputedStyle(pane);
        if (/(auto|scroll)/.test(style.overflowY) && pane.scrollHeight > pane.clientHeight + 1) {
          const rect = pane.getBoundingClientRect();
          if (session.y < rect.top + 36) pane.scrollTop -= 18;
          else if (session.y > rect.bottom - 36) pane.scrollTop += 18;
          break;
        }
        pane = pane.parentElement;
      }
      publish(session);
    }

    function pointerMove(event) {
      const session = sessionRef.current;
      if (session?.kind !== "pointer" || event.pointerId !== session.pointerId) return;
      move(event, event);
    }
    function pointerEnd(event) {
      const session = sessionRef.current;
      if (session?.kind === "pointer" && event.pointerId === session.pointerId) finish(event.type === "pointerup");
    }
    function touchMove(event) {
      const session = sessionRef.current;
      if (session?.kind !== "touch") return;
      if (event.touches.length !== 1) { finish(); return; }
      move(event.touches[0], event);
    }
    function touchEnd(event) {
      if (sessionRef.current?.kind !== "touch") return;
      if (sessionRef.current.active && event.cancelable) event.preventDefault();
      finish(event.type === "touchend");
    }
    function keyDown(event) {
      if (!sessionRef.current?.active) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") finish();
    }
    function click(event) {
      if (event.detail && listRef.current?.contains(event.target) && performance.now() < suppressClickRef.current) {
        event.preventDefault(); event.stopPropagation(); suppressClickRef.current = 0;
      }
    }
    function cancel() { finish(); }
    function contextMenu(event) {
      if (!sessionRef.current) return;
      event.preventDefault();
      if (sessionRef.current.kind !== "touch") finish();
    }
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerEnd);
    window.addEventListener("pointercancel", pointerEnd);
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd, { passive: false });
    window.addEventListener("touchcancel", touchEnd);
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("contextmenu", contextMenu);
    return () => {
      clearTimeout(sessionRef.current?.timer);
      sessionRef.current = null;
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerEnd);
      window.removeEventListener("pointercancel", pointerEnd);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("contextmenu", contextMenu);
    };
  }, [activate, publish]);

  const order = [0, 1, 2, 3, 4, 5];
  if (drag?.over !== null && drag?.over !== undefined) order.splice(drag.over, 0, order.splice(drag.from, 1)[0]);
  return {
    drag, listRef, order,
    onPointerDown(index, event) {
      if (event.pointerType === "touch" || event.button !== 0 || event.isPrimary === false) return;
      begin(index, event, "pointer", event.pointerId);
    },
    onTouchStart(index, event) {
      if (event.touches.length === 1) begin(index, event.touches[0], "touch");
    },
  };
}
