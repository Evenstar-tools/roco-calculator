import { useLocale } from "../i18n/LocaleContext.jsx";
import { Crosshair, SquaresFour } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function SkillStep({
  activeMode = "single",
  compact = false,
  fourSkillContent,
  onModeChange,
  onPowerDisplayModeChange,
  powerDisplayMode = "static",
  showOptionLabels = false,
  singleSkillContent,
  singleTraitContent,
}) {
  const { t } = useLocale();
  const [mode, setMode] = useState(activeMode);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 受控模式跟外部 activeMode，直接改成完全受控会丢掉尚未回写的本地切换
    setMode(activeMode);
  }, [activeMode]);

  function selectMode(nextMode) {
    setMode(nextMode);
    onModeChange?.(nextMode);
  }

  return (
    <section
      aria-label={t("技能配置")}
      className="calculator-step calculator-step--skills"
    >
      <div className="skill-step-toolbar">
        <div
          aria-label={t("技能模式")}
          className={`mode-tabs${compact && showOptionLabels ? " mode-tabs--labeled" : ""}`}
          data-guide-target="skills"
          role="tablist"
        >
          <button
            aria-label={t("单技能")}
            aria-controls="single-skill-panel"
            aria-selected={mode === "single"}
            id="single-skill-tab"
            onClick={() => selectMode("single")}
            role="tab"
            tabIndex={mode === "single" ? 0 : -1}
            title={t("单技能")}
            type="button"
          >
            {compact ? (
              <>
                <Crosshair aria-hidden="true" size={18} weight="bold" />
                {showOptionLabels ? <span className="mode-tabs__label">{t("单技能")}</span> : null}
              </>
            ) : (
              t("单技能")
            )}
          </button>
          <button
            aria-label={t("四技能")}
            aria-controls="four-skill-panel"
            aria-selected={mode === "four"}
            id="four-skill-tab"
            onClick={() => selectMode("four")}
            role="tab"
            tabIndex={mode === "four" ? 0 : -1}
            title={t("四技能")}
            type="button"
          >
            {compact ? (
              <>
                <SquaresFour aria-hidden="true" size={18} weight="fill" />
                {showOptionLabels ? <span className="mode-tabs__label">{t("四技能")}</span> : null}
              </>
            ) : (
              t("四技能")
            )}
          </button>
        </div>
        {!compact && onPowerDisplayModeChange ? (
          <div aria-label={t("技能威力口径")} className="power-basis-switch" role="group">
            <button
              aria-pressed={powerDisplayMode !== "panel"}
              onClick={() => onPowerDisplayModeChange("static")}
              type="button"
            >{t("静态威力")}</button>
            <button
              aria-pressed={powerDisplayMode === "panel"}
              onClick={() => onPowerDisplayModeChange("panel")}
              type="button"
            >{t("显示威力")}</button>
          </div>
        ) : null}
      </div>
      <div
        aria-labelledby="single-skill-tab"
        hidden={mode !== "single"}
        id="single-skill-panel"
        role="tabpanel"
      >
        {mode === "single" ? singleTraitContent : null}
        {singleSkillContent}
      </div>
      <div
        aria-labelledby="four-skill-tab"
        hidden={mode !== "four"}
        id="four-skill-panel"
        role="tabpanel"
      >
        {fourSkillContent}
      </div>
    </section>
  );
}
