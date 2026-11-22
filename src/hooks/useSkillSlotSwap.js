import { useEffect, useRef, useState } from "react";

const slotSelector = "[data-skill-swap-slot]";

export function useSkillSlotSwap({ entries, onSwap, columns = 1 }) {
  const listRef = useRef(null);
  const pointer = useRef(null);
  const [drag, setDrag] = useState(null);

  function targetAt(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(slotSelector);
    return target && listRef.current?.contains(target) ? Number(target.dataset.skillSwapSlot) : null;
  }

  function cancel() {
    const session = pointer.current;
    if (!session) return;
    pointer.current = null;
    if (session.handle.hasPointerCapture?.(session.id)) session.handle.releasePointerCapture(session.id);
    setDrag(null);
  }

  useEffect(() => {
    function onEscape(event) {
      if (event.key !== "Escape" || !pointer.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    window.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  return {
    listRef,
    slotProps(index) {
      return {
        "data-skill-swap-slot": index,
        "data-skill-swap-state": drag?.over === index && drag.from !== index ? "target" : undefined,
      };
    },
    handleProps(index) {
      const end = (event) => { if (pointer.current?.id === event.pointerId) cancel(); };
      return {
        disabled: !entries[index],
        "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight",
        onPointerDown(event) {
          if (!entries[index] || pointer.current || event.button !== 0 || event.isPrimary === false) return;
          const handle = event.currentTarget;
          const id = event.pointerId;
          pointer.current = { from: index, id, handle, x: event.clientX, y: event.clientY, active: false };
          handle.setPointerCapture?.(id);
        },
        onPointerMove(event) {
          const session = pointer.current;
          if (!session || session.id !== event.pointerId || session.from !== index) return;
          if (!session.active && Math.hypot(event.clientX - session.x, event.clientY - session.y) < 5) return;
          session.active = true;
          const over = targetAt(event);
          setDrag((previous) => previous?.over === over ? previous : { from: index, over });
        },
        onPointerUp(event) {
          const session = pointer.current;
          if (!session || session.id !== event.pointerId || session.from !== index) return;
          const to = session.active ? targetAt(event) : null;
          cancel();
          if (to !== null && to !== index) onSwap(index, to);
        },
        onPointerCancel: end,
        onLostPointerCapture: end,
        onKeyDown(event) {
          const offset = { ArrowUp: -columns, ArrowDown: columns, ArrowLeft: -1, ArrowRight: 1 }[event.key];
          if (!event.altKey || typeof offset !== "number" || !entries[index] || pointer.current) return;
          event.preventDefault();
          event.stopPropagation();
          const to = index + offset;
          if (to < 0 || to >= entries.length) return;
          if (columns > 1 && ["ArrowLeft", "ArrowRight"].includes(event.key) &&
            Math.floor(index / columns) !== Math.floor(to / columns)) return;
          onSwap(index, to);
          requestAnimationFrame(() => listRef.current?.querySelector(
            `${slotSelector}[data-skill-swap-slot="${to}"] .skill-slot-swap-handle`,
          )?.focus());
        },
      };
    },
  };
}
