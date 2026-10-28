import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { StatIcon } from "./StatIcon.jsx";
import { fitPickerMenu, getPickerBounds } from "./picker-menu-layout.js";
import { useLocale } from "../i18n/LocaleContext.jsx";
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

function optionLabel(nature, t, placeholder) {
  if (!nature) return t("未设置");
  if (placeholder) {
    return nature.upStat && nature.downStat
      ? t("{nature}（{up}↑ {down}↓）", { nature: t(nature.name), up: t(STAT_LABELS[nature.upStat]), down: t(STAT_LABELS[nature.downStat]) })
      : nature.id === "neutral" ? t("普通") : nature.name;
  }
  if (!nature.upStat || !nature.downStat) {
    const name = t(nature.name);
    return name === t("无修正") ? name : t("{nature}（无修正）", { nature: name });
  }
  return t("{nature}（+{up} -{down}）", { nature: t(nature.name), up: t(STAT_LABELS[nature.upStat]), down: t(STAT_LABELS[nature.downStat]) });
}

export function NatureSelect({ allowUnset = false, ariaLabel, onChange, placeholder = false, value }) {
  const { t } = useLocale();
  const selected = allowUnset && value == null ? null
    : placeholder ? NATURES.find((nature) => nature.id === value) ?? { id: value, name: String(value) }
      : NATURES.find((nature) => nature.id === normalizeNatureId(value));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const hoverTimer = useRef(null);
  const reposition = useRef(null);
  const menuId = useId();

  function clearHover() { clearTimeout(hoverTimer.current); }
  function close(restoreFocus = false) {
    clearHover();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function show() {
    setExpanded(selected?.upStat ?? null);
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
      // Top-layer nature menus escape drawer clipping, but still avoid app bars.
      const bounds = getPickerBounds(trigger.current);
      if (trigger.current.closest('[role="dialog"]')) {
        bounds.top = viewport?.offsetTop ?? 0;
        bounds.bottom = bounds.top + (viewport?.height ?? window.innerHeight);
      }
      const initial = fitPickerMenu(box, bounds, 0, 260);
      popup.style.width = `${initial.width}px`;
      const fullHeight = popup.scrollHeight + 2;
      const layout = fitPickerMenu(box, bounds, fullHeight, 260);
      const top = layout.placement === "down" ? box.bottom + 4 : box.top - layout.maxHeight - 4;
      Object.assign(popup.style, {
        left: `${layout.left}px`, top: `${top}px`, maxHeight: `${layout.maxHeight}px`,
      });
    }
    // 原生顶层浮层不被队伍抽屉裁切，DOM 仍留在原弹层内以兼容焦点约束。
    popup.showPopover?.();
    reposition.current = position;
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      reposition.current = null;
      popup.hidePopover?.();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);

  useLayoutEffect(() => { reposition.current?.(); }, [expanded]);

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
        value={selected?.id ?? ""}
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
        {optionLabel(selected, t, placeholder)}
      </button>
      <CaretDown aria-hidden="true" size={14} weight="bold" />
      {open && <div className="nature-menu" id={menuId} ref={menu} popover="manual" role="tree" aria-label={t("{label}选择", { label: ariaLabel })} onKeyDown={navigate}>
        {allowUnset && <button className="nature-menu__neutral" type="button" role="treeitem" aria-selected={selected === null} tabIndex={-1} onPointerEnter={clearHover} onClick={() => choose(null)}>{t("未设置")}</button>}
        <button className="nature-menu__neutral" type="button" role="treeitem" aria-selected={selected?.id === "neutral"} tabIndex={-1} onPointerEnter={clearHover} onClick={() => choose("neutral")}>{t("普通（无修正）")}</button>
        {GROUP_ORDER.map(upStat => <div role="none" key={upStat}>
          <button className="nature-menu__group" type="button" role="treeitem" tabIndex={-1}
            aria-label={t(placeholder ? "{stat}增益" : "{stat}增益 +20%", { stat: t(STAT_LABELS[upStat]) })}
            data-group={upStat} aria-expanded={expanded === upStat} aria-owns={expanded === upStat ? `${menuId}-${upStat}` : undefined}
            onPointerEnter={event => {
              if (event.pointerType === "touch") return;
              clearHover(); hoverTimer.current = setTimeout(() => setExpanded(upStat), 150);
            }} onPointerLeave={clearHover} onClick={() => expand(upStat)}>
            <span>{t("{stat}增益", { stat: t(STAT_LABELS[upStat]) })}</span>
            <span className="nature-menu__gain"><StatIcon stat={upStat} />{placeholder ? "↑" : "+20%"}</span>
          </button>
          {expanded === upStat && <div className="nature-menu__children" role="group" id={`${menuId}-${upStat}`}>
            {NATURES.filter(nature => nature.upStat === upStat).map(nature => <button
              key={nature.id} type="button" role="treeitem" tabIndex={-1} aria-selected={selected?.id === nature.id}
              aria-label={optionLabel(nature, t, placeholder)} data-parent={upStat} onClick={() => choose(nature.id)}>
              <span>{t(nature.name)}</span><span className="nature-menu__loss">{placeholder ? `${t(STAT_LABELS[nature.downStat])} ↓` : `-${t(STAT_LABELS[nature.downStat])} 10%`}</span>
              {selected?.id === nature.id && <span className="nature-menu__selected">{t("已选")}</span>}
            </button>)}
          </div>}
        </div>)}
      </div>}
    </div>
  );
}
