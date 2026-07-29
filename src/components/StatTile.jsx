import { useEffect, useId, useState } from "react";
import { StatIcon } from "./StatIcon.jsx";

function clampIv(value) {
  const numeric = Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(60, Math.max(0, numeric));
}

export function StatTile({
  accent = "neutral",
  displayIv,
  label,
  onIvChange,
  panel,
  race,
  stat,
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(String(displayIv));

  useEffect(() => {
    setDraft(String(displayIv));
  }, [displayIv]);

  function handleChange(event) {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    if (nextDraft !== "") onIvChange(clampIv(nextDraft));
  }

  function handleBlur() {
    const clamped = clampIv(draft);
    setDraft(String(clamped));
    onIvChange(clamped);
  }

  return (
    <div className={`stat-tile stat-tile--${accent}`}>
      <div className="stat-tile__value-group">
        <span className="stat-tile__label" title={label}>
          <StatIcon stat={stat} />
          <span className="stat-tile__label-text">{label}</span>
        </span>
        <output className="stat-tile__panel">{panel}</output>
        <span className="stat-tile__race">种:{race}</span>
      </div>

      <div className="stat-tile__iv-group">
        <label className="stat-tile__iv-label" htmlFor={inputId}>
          个体
        </label>
        <input
          aria-label={`${label}个体`}
          className="stat-tile__iv-input"
          id={inputId}
          inputMode="numeric"
          max="60"
          min="0"
          onBlur={handleBlur}
          onChange={handleChange}
          onFocus={(event) => event.currentTarget.select()}
          step="6"
          type="number"
          value={draft}
        />
      </div>
    </div>
  );
}
