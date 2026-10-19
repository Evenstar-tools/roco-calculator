import { useEffect, useId, useState } from "react";
import { StatIcon } from "./StatIcon.jsx";
import { getNature } from "../domain/natures.js";
import { useLocale } from "../i18n/LocaleContext.jsx";

function clampIv(value, placeholder = false) {
  const numeric = placeholder ? Number(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return 0;
  return placeholder ? Math.max(0, numeric) : Math.min(60, Math.max(0, numeric));
}

export function StatTile({
  accent = "neutral",
  allowUnset = false,
  basePanel,
  change = null,
  delta = 0,
  displayIv,
  label,
  natureId = "neutral",
  onIvChange,
  onPanelToggle,
  panel,
  placeholder = false,
  race,
  showFinalPanel = true,
  stat,
}) {
  const { t } = useLocale();
  const inputId = useId();
  const [draft, setDraft] = useState(String(displayIv ?? ""));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部个体值变化时同步草稿，渲染期写入会丢掉输入法组字
    setDraft(String(displayIv ?? ""));
  }, [displayIv]);

  function handleChange(event) {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    if (nextDraft !== "") onIvChange(clampIv(nextDraft, placeholder));
    else if (allowUnset) onIvChange(null);
  }

  function handleBlur() {
    if (placeholder && draft === String(displayIv ?? "")) return;
    if (allowUnset && draft === "") return;
    const clamped = clampIv(draft, placeholder);
    setDraft(String(clamped));
    if (!placeholder || clamped !== displayIv) onIvChange(clamped);
  }

  const numericDelta = Number(delta) || 0;
  const changeText = t(numericDelta > 0 ? "增加" : "降低");
  const isModified = !placeholder && Boolean(change);
  const showingBase = isModified && !showFinalPanel;
  const isMaxIv = !placeholder && Number.parseInt(draft, 10) === 60;
  const displayedPanel = placeholder ? "—" : showingBase ? basePanel : panel;
  const panelActionLabel = showingBase
    ? t("{label}当前显示基础值{base}，最终值{final}，点击恢复最终六维", { label, base: basePanel, final: panel })
    : t("{label}最终值{final}，基础值{base}，{change}{delta}，点击查看修改前的六维", { label, base: basePanel, final: panel, change: changeText, delta: Math.abs(numericDelta) });
  const valueContent = (
    <>
      <span className="stat-tile__label" title={label}>
        <StatIcon gain={!placeholder && getNature(natureId).upStat === stat} stat={stat} />
        <span className="stat-tile__label-text">{label}</span>
      </span>
      <div className="stat-tile__panel-row">
        <output className="stat-tile__panel">{displayedPanel}</output>
        {isModified ? (
          <span className="stat-tile__delta">
            {showingBase ? (
              t("原值")
            ) : (
              <>
                {numericDelta > 0 ? "+" : ""}
                {numericDelta}
              </>
            )}
          </span>
        ) : null}
      </div>
      <span className="stat-tile__race">{t("种:{value}", { value: placeholder ? "—" : race })}</span>
    </>
  );

  return (
    <div
      className={`stat-tile stat-tile--${accent}${isMaxIv ? " stat-tile--iv-max" : ""}${showFinalPanel && change ? ` stat-tile--${change}` : ""}${showingBase ? " stat-tile--base-preview" : ""}`}
    >
      {isModified ? (
        <button
          aria-label={panelActionLabel}
          className="stat-tile__value-group stat-tile__value-group--toggle"
          onClick={onPanelToggle}
          title={t(showingBase ? "显示最终六维" : "显示修改前六维")}
          type="button"
        >
          {valueContent}
        </button>
      ) : (
        <div className="stat-tile__value-group">{valueContent}</div>
      )}

      <div className="stat-tile__iv-group">
        <label className="stat-tile__iv-label" htmlFor={inputId}>
          {t("个体")}
        </label>
        <input
          aria-label={t("{label}个体", { label })}
          className="stat-tile__iv-input"
          id={inputId}
          inputMode="numeric"
          max={placeholder ? undefined : "60"}
          min="0"
          onBlur={handleBlur}
          onChange={handleChange}
          onFocus={(event) => event.currentTarget.select()}
          placeholder={allowUnset ? "—" : undefined}
          step={placeholder ? "any" : "6"}
          type="number"
          value={draft}
        />
      </div>
    </div>
  );
}
