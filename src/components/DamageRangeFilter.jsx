import { useRef, useState } from "react";

const legacyRanges = { all: [0, 125], half: [0, 50], survive: [0, 100], ko: [100, 125] };
const snap = (value) => Math.round(value / 25) * 25;
const label = ([min, max]) => max === 125 ? min === 0 ? "全部" : `≥${min}%` : `${min}%–${max}%`;

export default function DamageRangeFilter({ value = "all", onChange }) {
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);
  const range = Array.isArray(value) ? [value[0], value[1] ?? 125] : legacyRanges[value] ?? legacyRanges.all;
  const [min, max] = draft ?? range;
  const selected = [snap(min), snap(max)];
  function commit(next) {
    drag.current = null;
    setDraft(null);
    const [lower, upper] = next.map(snap);
    onChange(lower === 0 && upper === 125 ? "all" : upper === 125 ? [lower, null] : [lower, upper]);
  }
  function update(index, number) {
    const next = [...(drag.current ?? range)];
    next[index] = index === 0 ? Math.max(0, Math.min(number, next[1] - 25)) : Math.min(125, Math.max(number, next[0] + 25));
    if (drag.current) { drag.current = next; setDraft(next); }
    else commit(next);
  }
  function finish() { if (drag.current) commit(drag.current); }
  return <div className="dc-range" role="group" aria-label="承伤范围">
    <div className="dc-range-heading"><span>承伤范围 <strong>{label(selected)}</strong></span><button type="button" aria-pressed={min === 0 && max === 125} onClick={() => commit([0, 125])}>全部</button></div>
    <div className="dc-range-controls">
      <div className="dc-range-track">
        <div className="dc-range-segments">{[0, 25, 50, 75, 100].map((start) => <button key={start} type="button" aria-label={start === 100 ? "≥100%" : `${start}%至${start + 25}%`} aria-pressed={start >= selected[0] && start < selected[1]} onClick={() => commit([start, start + 25])} />)}</div>
        <div className="dc-range-ticks" aria-hidden="true">{[0, 25, 50, 75, 100, 125].map((tick) => <span key={tick}>{tick === 125 ? "以上" : `${tick}%`}</span>)}</div>
        {[0, 1].map((index) => <input key={index} aria-label={`承伤范围${index === 0 ? "下限" : "上限"}`} aria-valuetext={index === 1 && max === 125 ? "无上限" : `${selected[index]}%`} type="range" min="0" max="125" step="1" value={index === 0 ? min : max}
          onPointerDown={(event) => { drag.current = [...range]; event.currentTarget.setPointerCapture?.(event.pointerId); }}
          onChange={(event) => update(index, Number(event.target.value))} onPointerUp={finish} onLostPointerCapture={finish}
          onPointerCancel={() => { drag.current = null; setDraft(null); }} onBlur={finish}
          onKeyDown={(event) => {
            const delta = { ArrowLeft: -25, ArrowDown: -25, ArrowRight: 25, ArrowUp: 25 }[event.key];
            if (delta || event.key === "Home" || event.key === "End") {
              event.preventDefault(); update(index, event.key === "Home" ? 0 : event.key === "End" ? 125 : range[index] + delta);
            }
          }} />)}
      </div>
    </div>
  </div>;
}
