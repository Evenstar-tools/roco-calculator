import { SlidersHorizontal, WarningCircle, X } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useCalculatorLocale } from "../i18n/calculator-text.js";

function isCompactChange(item) {
  return item.kind === "stat" && typeof item.before !== "string";
}

export function hasEntityChanges(changeInfo) {
  return [changeInfo, ...(changeInfo?.history ?? [])].some(record =>
    record?.items?.some(item => item?.kind && item.kind !== "new"));
}

const patchLabel = patch => patch?.label?.replace(/前瞻/g, "").replace(/S3[\s-]*季中/g, "赛季平衡");

function ChangeItem({ item }) {
  const { tc } = useCalculatorLocale();
  if (isCompactChange(item)) {
    const delta = Number(item.after) - Number(item.before);
    return (
      <li className="entity-change-card__metric">
        <span>{tc(item.label)}</span>
        <strong>{item.before} → {item.after}</strong>
        <em className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}>
          {delta > 0 ? `+${delta}` : delta || "—"}
        </em>
      </li>
    );
  }

  return (
    <li className="entity-change-card__detail">
      <strong>{tc(item.label)}</strong>
      {item.before ? <span><small>{tc("调整前")}</small>{tc(item.before)}</span> : null}
      {item.after ? <span><small>{tc(item.before ? "调整后" : "内容")}</small>{tc(item.after)}</span> : null}
      {item.note ? <em>{tc(item.note)}</em> : null}
    </li>
  );
}

export function EntityChangeHint({ changeInfo, className = "", children, entityName: fallbackName, active = false, renderPatchAction }) {
  const { tc } = useCalculatorLocale();
  const tooltipId = useId();
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [selectedPatch, setSelectedPatch] = useState(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const open = hovered || pinned;

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  function openOnHover() {
    cancelClose();
    setHovered(true);
  }

  function closeAfterPointerLeaves() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setHovered(false), 100);
  }

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    function reposition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = rect.bottom + 8;
      const above = rect.top - height - 8;
      const top = below + height <= window.innerHeight - 12 ? below
        : above >= 12 ? above : Math.max(12, window.innerHeight - height - 12);
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top });
    }
    reposition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reposition);
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", reposition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (
        anchorRef.current?.contains(event.target) ||
        document.getElementById(tooltipId)?.contains(event.target)
      ) return;
      setPinned(false);
      setHovered(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, tooltipId]);

  useEffect(() => () => cancelClose(), []);

  const hasChanges = hasEntityChanges(changeInfo);
  const changeGroups = [changeInfo, ...(changeInfo?.history ?? [])].filter(record => record?.items?.length);
  const multiplePatches = changeGroups.length > 1;
  if (!hasChanges && !children) return null;
  const entityName = tc(fallbackName ?? changeInfo?.entityName ?? "当前项目");
  const selectedIndex = selectedPatch?.entityName === entityName
    ? Math.max(0, changeGroups.findIndex((record, index) => (record.patch?.id ?? index) === selectedPatch.id)) : 0;
  const visibleGroups = multiplePatches ? [changeGroups[selectedIndex]] : changeGroups;
  function selectPatch(index) {
    setSelectedPatch({ entityName, id: changeGroups[index].patch?.id ?? index });
  }
  const actionLabel = tc(hasChanges ? "查看{name}本期改动" : "编辑{name}试算种族值", { name: entityName });
  const HintIcon = hasChanges ? WarningCircle : SlidersHorizontal;

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={actionLabel}
        data-active={active || undefined}
        className={`entity-change-hint ${className}`.trim()}
        onBlur={(event) => {
          if (panelRef.current?.contains(event.relatedTarget)) return;
          if (!pinned) setHovered(false);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
          setHovered(false);
        }}
        onFocus={openOnHover}
        onMouseEnter={openOnHover}
        onMouseLeave={closeAfterPointerLeaves}
        ref={anchorRef}
        title={actionLabel}
        type="button"
      >
        <HintIcon aria-hidden="true" size={16} weight="fill" />
      </button>
      {open ? createPortal(
        <div className="entity-change-layer" onClick={(event) => event.stopPropagation()}>
          <button
            aria-label={tc("关闭改动详情")}
            className="entity-change-layer__backdrop"
            onClick={() => {
              setPinned(false);
              setHovered(false);
            }}
            type="button"
          />
          <section
            aria-label={tc(hasChanges ? "{name}本期改动" : "{name}种族值试算", { name: entityName })}
            className="entity-change-card"
            id={tooltipId}
            onMouseEnter={openOnHover}
            onMouseLeave={closeAfterPointerLeaves}
            onFocus={() => { if (children || multiplePatches) setPinned(true); }}
            ref={panelRef}
            role={children || multiplePatches ? "dialog" : "tooltip"}
            style={position}
          >
            <header>
              <span>
                <small>{tc(hasChanges ? "更新" : "试算")}</small>
                <strong>{tc(multiplePatches ? "改动记录" : patchLabel(changeInfo?.patch) ?? "种族值编辑")}</strong>
                {!multiplePatches && <time>{changeInfo?.patch?.date}</time>}
              </span>
              <button
                aria-label={tc("关闭改动详情")}
                onClick={() => {
                  setPinned(false);
                  setHovered(false);
                }}
                type="button"
              >
                <X aria-hidden="true" size={15} weight="bold" />
              </button>
            </header>
            <div className="entity-change-card__title"><h3>{entityName}</h3>{!multiplePatches && renderPatchAction?.(changeGroups[0])}</div>
            {multiplePatches && <div className="entity-change-card__tabs" role="tablist" aria-label={tc("改动记录")}>
              {changeGroups.map((record, index) => <button key={record.patch?.id ?? index}
                id={`${tooltipId}-tab-${index}`} role="tab" type="button"
                aria-selected={selectedIndex === index} aria-controls={`${tooltipId}-patch`}
                tabIndex={selectedIndex === index ? 0 : -1}
                onClick={() => selectPatch(index)}
                onKeyDown={event => {
                  const next = event.key === "ArrowRight" ? (index + 1) % changeGroups.length
                    : event.key === "ArrowLeft" ? (index - 1 + changeGroups.length) % changeGroups.length
                      : event.key === "Home" ? 0 : event.key === "End" ? changeGroups.length - 1 : null;
                  if (next === null) return;
                  event.preventDefault();
                  selectPatch(next);
                  document.getElementById(`${tooltipId}-tab-${next}`)?.focus();
                }}>{patchLabel(record.patch) ? tc(patchLabel(record.patch)) : tc("记录 {index}", { index: index + 1 })}</button>)}
            </div>}
            {visibleGroups.map((record, groupIndex) => <section className="entity-change-card__patch" key={record.patch?.id ?? groupIndex}
              id={multiplePatches ? `${tooltipId}-patch` : undefined} role={multiplePatches ? "tabpanel" : undefined}
              aria-labelledby={multiplePatches ? `${tooltipId}-tab-${selectedIndex}` : undefined}>
              {multiplePatches && <div className="entity-change-card__patch-heading"><time>{record.patch?.date}</time>{renderPatchAction?.(record)}</div>}
              <ul>{record.items.map((item, index) => (
                <ChangeItem item={item} key={`${item.kind}-${tc(item.label)}-${index}`} />
              ))}</ul>
            </section>)}
            {children}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
