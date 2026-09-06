import { WarningCircle, X } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

function isCompactChange(item) {
  return item.kind === "stat" && typeof item.before !== "string";
}

function ChangeItem({ item }) {
  if (isCompactChange(item)) {
    const delta = Number(item.after) - Number(item.before);
    return (
      <li className="entity-change-card__metric">
        <span>{item.label}</span>
        <strong>{item.before} → {item.after}</strong>
        <em className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}>
          {delta > 0 ? `+${delta}` : delta || "—"}
        </em>
      </li>
    );
  }

  return (
    <li className="entity-change-card__detail">
      <strong>{item.label}</strong>
      {item.before ? <span><small>调整前</small>{item.before}</span> : null}
      {item.after ? <span><small>{item.before ? "调整后" : "内容"}</small>{item.after}</span> : null}
      {item.note ? <em>{item.note}</em> : null}
    </li>
  );
}

export function EntityChangeHint({ changeInfo, className = "" }) {
  const tooltipId = useId();
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
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
    const rect = anchorRef.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const height = Math.min(
      panelRef.current?.scrollHeight ?? 0,
      window.innerHeight - 24,
    );
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - height - 8);
    setPosition({ left, top });
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
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, tooltipId]);

  useEffect(() => () => cancelClose(), []);

  if (!changeInfo?.items?.length || changeInfo.isNew) return null;
  const entityName = changeInfo.entityName ?? "当前项目";

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={`查看${entityName}本期改动`}
        className={`entity-change-hint ${className}`.trim()}
        onBlur={() => {
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
        title={`查看${entityName}本期改动`}
        type="button"
      >
        <WarningCircle aria-hidden="true" size={16} weight="fill" />
      </button>
      {open ? createPortal(
        <div className="entity-change-layer">
          <button
            aria-label="关闭改动详情"
            className="entity-change-layer__backdrop"
            onClick={() => {
              setPinned(false);
              setHovered(false);
            }}
            type="button"
          />
          <section
            aria-label={`${entityName}本期改动`}
            className="entity-change-card"
            id={tooltipId}
            onMouseEnter={openOnHover}
            onMouseLeave={closeAfterPointerLeaves}
            ref={panelRef}
            role="tooltip"
            style={position}
          >
            <header>
              <span>
                <small>更新</small>
                <strong>{changeInfo.patch?.label?.replace(/前瞻/g, "").replace(/S3[\s-]*季中/g, "赛季平衡") ?? "本期改动"}</strong>
                <time>{changeInfo.patch?.date}</time>
              </span>
              <button
                aria-label="关闭改动详情"
                onClick={() => {
                  setPinned(false);
                  setHovered(false);
                }}
                type="button"
              >
                <X aria-hidden="true" size={15} weight="bold" />
              </button>
            </header>
            <h3>{entityName}</h3>
            <ul>{changeInfo.items.map((item, index) => (
              <ChangeItem item={item} key={`${item.kind}-${item.label}-${index}`} />
            ))}</ul>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
