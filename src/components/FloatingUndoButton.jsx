import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export const UNDO_POSITION_STORAGE_KEY =
  "rock-calculator.floating-undo-position.v1";

const BUTTON_WIDTH = 84;
const BUTTON_HEIGHT = 44;
const VIEWPORT_GAP = 18;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function readViewport() {
  return { width: globalThis.innerWidth || 1024, height: globalThis.innerHeight || 768 };
}

function clampPosition(position, { width, height }) {
  const bottomGap = width <= 1080 ? 82 : VIEWPORT_GAP;
  return {
    x: clamp(Number(position?.x) || 0, VIEWPORT_GAP, width - BUTTON_WIDTH - VIEWPORT_GAP),
    y: clamp(Number(position?.y) || 0, VIEWPORT_GAP, height - BUTTON_HEIGHT - bottomGap),
  };
}

function defaultPosition({ width, height }) {
  return { x: width - BUTTON_WIDTH - VIEWPORT_GAP, y: height - BUTTON_HEIGHT - VIEWPORT_GAP };
}

function readPosition() {
  try {
    const stored = JSON.parse(localStorage.getItem(UNDO_POSITION_STORAGE_KEY));
    if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) {
      return stored;
    }
  } catch {
    // 损坏的位置缓存不影响计算器使用。
  }
  return null;
}

function writePosition(position) {
  try {
    localStorage.setItem(UNDO_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // 无本地存储权限时仅在本次运行中保留位置。
  }
}

export function FloatingUndoButton({ count = 0, onUndo }) {
  const [preferredPosition, setPreferredPosition] = useState(readPosition);
  const [viewport, setViewport] = useState(readViewport);
  const position = clampPosition(preferredPosition ?? defaultPosition(viewport), viewport);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const available = count > 0;
  const label = available ? `撤回上一步（${count}）` : "暂无可撤回操作";

  useEffect(() => {
    function handleResize() {
      setViewport(readViewport());
    }
    globalThis.addEventListener?.("resize", handleResize);
    return () => globalThis.removeEventListener?.("resize", handleResize);
  }, []);

  function handlePointerDown(event) {
    dragRef.current = {
      origin: position,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) < 4 && !suppressClickRef.current) return;
    suppressClickRef.current = true;
    const next = clampPosition({
      x: drag.origin.x + deltaX,
      y: drag.origin.y + deltaY,
    }, viewport);
    drag.position = next;
    setPreferredPosition(next);
  }

  function handlePointerUp(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    if (dragRef.current.position) writePosition(dragRef.current.position);
    dragRef.current = null;
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (available) onUndo?.();
  }

  return (
    <button
      aria-disabled={!available}
      aria-label={label}
      className={`floating-undo${available ? " floating-undo--available" : ""}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onPointerUp={handlePointerUp}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      title={label}
      type="button"
    >
      <ArrowCounterClockwise aria-hidden="true" size={23} weight="bold" />
      <span aria-hidden="true">{Math.min(count, 50)}</span>
    </button>
  );
}
