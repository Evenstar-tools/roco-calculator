import { useEffect, useId, useState } from "react";
import { StatIcon } from "./StatIcon.jsx";

function clampIv(value) {
  const numeric = Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(60, Math.max(0, numeric));
}

export function StatTile({
  accent = "neutral",
  basePanel,
  change = null,
  delta = 0,
  displayIv,
  label,
  onIvChange,
  onPanelToggle,
  panel,
  race,
  showFinalPanel = true,
  stat,
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(String(displayIv));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部个体值变化时同步草稿，渲染期写入会丢掉输入法组字
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

  const numericDelta = Number(delta) || 0;
  const changeText = numericDelta > 0 ? "增加" : "降低";
  const isModified = Boolean(change);
  const showingBase = isModified && !showFinalPanel;
  const displayedPanel = showingBase ? basePanel : panel;
  const panelActionLabel = showingBase
    ? `${label}当前显示基础值${basePanel}，最终值${panel}，点击恢复最终六维`
    : `${label}最终值${panel}，基础值${basePanel}，${changeText}${Math.abs(numericDelta)}，点击查看修改前的六维`;
  const valueContent = (
    <>
      <span className="stat-tile__label" title={label}>
        <StatIcon stat={stat} />
        <span className="stat-tile__label-text">{label}</span>
      </span>
      <div className="stat-tile__panel-row">
        <output className="stat-tile__panel">{displayedPanel}</output>
        {isModified ? (
          <span className="stat-tile__delta">
            {showingBase ? (
              "原值"
            ) : (
              <>
                {numericDelta > 0 ? "+" : ""}
                {numericDelta}
              </>
            )}
          </span>
        ) : null}
      </div>
      <span className="stat-tile__race">种:{race}</span>
    </>
  );

  return (
    <div
      className={`stat-tile stat-tile--${accent}${showFinalPanel && change ? ` stat-tile--${change}` : ""}${showingBase ? " stat-tile--base-preview" : ""}`}
    >
      {isModified ? (
        <button
          aria-label={panelActionLabel}
          className="stat-tile__value-group stat-tile__value-group--toggle"
          onClick={onPanelToggle}
          title={showingBase ? "显示最终六维" : "显示修改前六维"}
          type="button"
        >
          {valueContent}
        </button>
      ) : (
        <div className="stat-tile__value-group">{valueContent}</div>
      )}

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
