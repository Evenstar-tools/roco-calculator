import { useCallback, useEffect, useRef, useState } from "react";

const slotSelector = "[data-skill-swap-slot]";

function movePreview(node, session) {
  if (!node) return;
  const { width, height, dx, dy, x, y } = session;
  const left = Math.max(4, Math.min(x + dx, window.innerWidth - width - 4));
  const top = Math.max(4, Math.min(y + dy, window.innerHeight - height - 4));
  node.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

export function useSkillSlotSwap({ entries, onSwap, columns = 1 }) {
  const listRef = useRef(null);
  const pointer = useRef(null);
  const preview = useRef(null);
  const [drag, setDrag] = useState(null);
  const previewRef = useCallback((node) => {
    preview.current = node;
    const session = pointer.current;
    if (!node || !session) return;
    session.width = node.offsetWidth;
    session.height = node.offsetHeight;
    // Keep the lifted card next to the grip and clear of the finger on touch screens.
    session.dx = session.rightGrip ? -session.width + 14 : -14;
    session.dy = session.touch ? -session.height - 8 : -session.height / 2;
    movePreview(node, session);
  }, []);

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
    draggedIndex: drag?.from,
    previewRef,
    slotProps(index) {
      return {
        "data-skill-swap-slot": index,
        "data-skill-swap-state": drag?.from === index ? "source" : drag?.over === index ? "target" : undefined,
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
          const row = handle.closest(slotSelector).getBoundingClientRect();
          pointer.current = { from: index, id, handle, x: event.clientX, y: event.clientY, active: false,
            touch: event.pointerType === "touch", rightGrip: event.clientX > row.left + row.width / 2 };
          handle.setPointerCapture?.(id);
        },
        onPointerMove(event) {
          const session = pointer.current;
          if (!session || session.id !== event.pointerId || session.from !== index) return;
          if (!session.active && Math.hypot(event.clientX - session.x, event.clientY - session.y) < 5) return;
          session.active = true;
          session.x = event.clientX;
          session.y = event.clientY;
          movePreview(preview.current, session);
          const over = targetAt(event);
          if (session.over !== over) {
            session.over = over;
            setDrag({ from: index, over });
          }
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
