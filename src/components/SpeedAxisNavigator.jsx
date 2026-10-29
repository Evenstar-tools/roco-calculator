import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "../styles/speed-axis.css";

const isVisible = (scroll) => scroll && scroll.clientHeight > 0 && !scroll.closest("[hidden]");
const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
const rowsIn = (scroll) => [...scroll.querySelectorAll("tbody tr[data-speed-nav-key]")];

export default function SpeedAxisNavigator({ scrollRef, items, label }) {
  const [currentKey, setCurrentKey] = useState(items[0]?.key ?? null);
  const current = useRef(currentKey);
  const marked = useRef(null);
  const programScroll = useRef(null);
  const geometry = useRef(null);
  const index = Math.max(0, items.findIndex((item) => item.key === currentKey));
  const maximum = Math.max(0, items.length - 1);

  const select = useCallback((key, row) => {
    if (marked.current !== row) {
      marked.current?.removeAttribute("data-speed-axis-current");
      row?.setAttribute("data-speed-axis-current", "true");
      marked.current = row ?? null;
    }
    current.current = key;
    setCurrentKey(key);
  }, []);

  const locate = useCallback((nextIndex) => {
    const item = items[clamp(nextIndex, items.length - 1)];
    const scroll = scrollRef.current;
    if (!item || !isVisible(scroll)) return;
    const row = rowsIn(scroll).find((candidate) => candidate.dataset.speedNavKey === item.key);
    if (!row) return;
    const headerHeight = scroll.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = clamp(scroll.scrollTop + row.getBoundingClientRect().top -
      scroll.getBoundingClientRect().top - scroll.clientTop - headerHeight,
    Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    select(item.key, row);
    // A bottom row cannot always reach the top. Keep the requested tier until
    // a later scroll actually leaves this programmatically reached position.
    programScroll.current = { key: item.key, top };
    scroll.scrollTop = top;
    programScroll.current.top = scroll.scrollTop;
  }, [items, scrollRef, select]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;
    let frame = null;
    const table = scroll.querySelector("table");
    const byKey = new Map(items.map((item) => [item.key, item]));
    const sync = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const visible = Boolean(isVisible(scroll));
      const previous = geometry.current?.scroll === scroll ? geometry.current : null;
      const content = visible ? table?.getBoundingClientRect() : null;
      const next = {
        scroll, table, width: scroll.clientWidth, height: scroll.clientHeight,
        contentWidth: content?.width ?? previous?.contentWidth,
        contentHeight: content?.height ?? previous?.contentHeight,
        wasVisible: visible || Boolean(previous?.wasVisible),
      };
      geometry.current = next;
      if (!visible || !items.length) return;
      // Scroll can fire before ResizeObserver after native clamping/reflow.
      // Keep geometry across subscriptions and restore the old key before
      // reading visible rows, including when a parent rebuilds the items array.
      const viewportChanged = previous &&
        (previous.width !== next.width || previous.height !== next.height);
      if (viewportChanged && previous.wasVisible) {
        const anchor = items.findIndex((item) => item.key === current.current);
        if (anchor >= 0) {
          locate(anchor);
          return;
        }
      }
      const contentChanged = previous && (previous.table !== table ||
        previous.contentWidth !== next.contentWidth || previous.contentHeight !== next.contentHeight);
      if (contentChanged) programScroll.current = null;
      const rows = rowsIn(scroll).filter((row) => byKey.has(row.dataset.speedNavKey));
      const locked = programScroll.current;
      if (locked && byKey.has(locked.key) && Math.abs(scroll.scrollTop - locked.top) < 1) {
        select(locked.key, rows.find((row) => row.dataset.speedNavKey === locked.key));
        return;
      }
      programScroll.current = null;
      const edge = scroll.getBoundingClientRect().top + scroll.clientTop +
        (scroll.querySelector("thead")?.getBoundingClientRect().height ?? 0);
      const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > edge + 1) ?? rows.at(-1);
      if (row) select(row.dataset.speedNavKey, row);
    };
    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(sync);
    };
    if (!byKey.has(current.current)) {
      programScroll.current = null;
      select(items[0]?.key ?? null, null);
    }
    sync();
    scroll.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null;
    observer?.observe(scroll);
    if (table) observer?.observe(table);
    if (!observer) window.addEventListener("resize", sync);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      scroll.removeEventListener("scroll", onScroll);
      if (!observer) window.removeEventListener("resize", sync);
    };
  }, [items, scrollRef, select, locate]);

  useLayoutEffect(() => () => marked.current?.removeAttribute("data-speed-axis-current"), []);

  if (!items.length) return null;
  const ticks = [...new Set(Array.from({ length: Math.min(5, items.length) }, (_, tick) =>
    Math.round(tick * maximum / Math.max(1, Math.min(5, items.length) - 1))))]
    .filter((tick, position, candidates) => candidates.findIndex((candidate) => items[candidate].value === items[tick].value) === position);
  const onKeyDown = (event) => {
    const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[event.key];
    if (delta === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    locate(event.key === "Home" ? 0 : event.key === "End" ? maximum : index + delta);
  };
  return <aside className="speed-axis-nav" aria-label={label}>
    <output className="speed-axis-nav__value" aria-hidden="true">{items[index].value}</output>
    <div className="speed-axis-nav__track">
      <div className="speed-axis-nav__ticks" aria-hidden="true">
        {ticks.map((tick) => <span key={items[tick].key} style={{ top: `${maximum ? tick / maximum * 100 : 0}%` }}>{items[tick].value}</span>)}
      </div>
      <input type="range" min={0} max={maximum} step={1} value={maximum - index}
        disabled={items.length < 2} aria-label={label} aria-orientation="vertical"
        aria-valuetext={String(items[index].value)} title={label}
        onChange={(event) => locate(maximum - Number(event.target.value))} onKeyDown={onKeyDown} />
    </div>
  </aside>;
}
