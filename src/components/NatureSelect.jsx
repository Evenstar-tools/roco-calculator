import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { StatIcon } from "./StatIcon.jsx";
import {
  NATURES,
  STAT_LABELS,
  normalizeNatureId,
} from "../domain/natures.js";

const GROUP_ORDER = [
  "hp",
  "physicalAttack",
  "magicalAttack",
  "speed",
  "physicalDefense",
  "magicalDefense",
];

function optionLabel(nature) {
  if (!nature.upStat || !nature.downStat) {
    return `${nature.name}（无修正）`;
  }
  return `${nature.name}（+${STAT_LABELS[nature.upStat]} -${STAT_LABELS[nature.downStat]}）`;
}

export function NatureSelect({ ariaLabel, onChange, value }) {
  const selected = NATURES.find((nature) => nature.id === normalizeNatureId(value));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const hoverTimer = useRef(null);
  const menuId = useId();

  function clearHover() { clearTimeout(hoverTimer.current); }
  function close(restoreFocus = false) {
    clearHover();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function show() {
    setExpanded(null);
    setOpen(true);
  }
  function choose(id) {
    onChange(id);
    close(true);
  }
  function expand(stat) {
    clearHover();
    setExpanded(stat);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const popup = menu.current;
    function position() {
      const box = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const width = (viewport?.width ?? window.innerWidth) - 16;
      const height = (viewport?.height ?? window.innerHeight) - 16;
      const popupWidth = Math.min(Math.max(box.width, 260), width);
      const fullHeight = Math.min(394, height);
      const bottom = topEdge + height;
      const top = box.bottom + 4 + fullHeight <= bottom
        ? box.bottom + 4
        : Math.max(topEdge, Math.min(box.top - fullHeight - 4, bottom - fullHeight));
      Object.assign(popup.style, {
        left: `${Math.max(leftEdge, Math.min(box.left, leftEdge + width - popupWidth))}px`,
        top: `${top}px`, width: `${popupWidth}px`, maxHeight: `${height}px`,
      });
    }
    // 原生顶层浮层不被队伍抽屉裁切，DOM 仍留在原弹层内以兼容焦点约束。
    popup.showPopover?.();
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      popup.hidePopover?.();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!root.current?.contains(event.target)) {
        clearHover();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    return () => {
      clearHover();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  function navigate(event) {
    event.stopPropagation();
    if (event.key === "Tab") { close(); return; }
    clearHover();
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    const current = event.target.closest('[role="treeitem"]');
    const group = current?.dataset.group;
    if (event.key === "ArrowRight" && group) {
      event.preventDefault(); expand(group); return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const parent = current?.dataset.parent ?? group;
      if (parent) menu.current.querySelector(`[data-group="${parent}"]`)?.focus();
      setExpanded(null); return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current.querySelectorAll('[role="treeitem"]')];
    const index = items.indexOf(current);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    items[next]?.focus();
  }

  return (
    <div className="nature-select" ref={root}>
      <button
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="tree"
        aria-controls={open ? menuId : undefined}
        className="nature-select__trigger"
        role="combobox"
        ref={trigger}
        type="button"
        value={selected.id}
        onClick={() => open ? close() : show()}
        onKeyDown={event => {
          if (event.key === "Tab") return;
          event.stopPropagation();
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) show();
            else menu.current.querySelector('[role="treeitem"]')?.focus();
          } else if (event.key === "Escape") { event.preventDefault(); close(); }
        }}
      >
        {optionLabel(selected)}
      </button>
      <CaretDown aria-hidden="true" size={14} weight="bold" />
      {open && <div className="nature-menu" id={menuId} ref={menu} popover="manual" role="tree" aria-label={`${ariaLabel}选择`} onKeyDown={navigate}>
        <button className="nature-menu__neutral" type="button" role="treeitem" aria-selected={selected.id === "neutral"} tabIndex={-1} onPointerEnter={clearHover} onClick={() => choose("neutral")}>普通（无修正）</button>
        {GROUP_ORDER.map(upStat => <div role="none" key={upStat}>
          <button className="nature-menu__group" type="button" role="treeitem" tabIndex={-1}
            aria-label={`${STAT_LABELS[upStat]}增益 +20%`}
            data-group={upStat} aria-expanded={expanded === upStat} aria-owns={expanded === upStat ? `${menuId}-${upStat}` : undefined}
            onPointerEnter={event => {
              if (event.pointerType === "touch") return;
              clearHover(); hoverTimer.current = setTimeout(() => setExpanded(upStat), 150);
            }} onPointerLeave={clearHover} onClick={() => expand(upStat)}>
            <span>{STAT_LABELS[upStat]}增益</span>
            <span className="nature-menu__gain"><StatIcon stat={upStat} />+20%</span>
          </button>
          {expanded === upStat && <div className="nature-menu__children" role="group" id={`${menuId}-${upStat}`}>
            {NATURES.filter(nature => nature.upStat === upStat).map(nature => <button
              key={nature.id} type="button" role="treeitem" tabIndex={-1} aria-selected={selected.id === nature.id}
              aria-label={optionLabel(nature)} data-parent={upStat} onClick={() => choose(nature.id)}>
              <span>{nature.name}</span><span className="nature-menu__loss">-{STAT_LABELS[nature.downStat]} 10%</span>
              {selected.id === nature.id && <span className="nature-menu__selected">已选</span>}
            </button>)}
          </div>}
        </div>)}
      </div>}
    </div>
  );
}
