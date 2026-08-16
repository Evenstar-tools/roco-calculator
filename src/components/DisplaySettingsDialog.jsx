export function DisplaySettingsDialog({
  onClose,
  onPowerDisplayModeChange,
  onTypeCoverageChange,
  open = false,
  powerDisplayMode = "skill",
  typeCoverageEnabled = false,
}) {
  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label="显示设置"
        aria-modal="true"
        className="share-dialog display-settings-dialog"
        role="dialog"
      >
        <h2>显示设置</h2>
        <div className="display-settings-option display-settings-option--power">
          <span>
            <strong>技能栏威力</strong>
            <small>面板威力已包含本系、克制、天气与能力等级</small>
          </span>
          <div
            aria-label="技能栏威力显示"
            className="display-settings-segment"
            role="group"
          >
            <button
              aria-pressed={powerDisplayMode === "skill"}
              onClick={() => onPowerDisplayModeChange?.("skill")}
              type="button"
            >
              技能威力
            </button>
            <button
              aria-pressed={powerDisplayMode === "panel"}
              onClick={() => onPowerDisplayModeChange?.("panel")}
              type="button"
            >
              面板威力
            </button>
          </div>
        </div>
        <label className="display-settings-option">
          <span>
            <strong>属性克制与打击面</strong>
            <small>在结果栏显示弱点、抗性和技能覆盖</small>
          </span>
          <input
            aria-label="属性克制与打击面"
            checked={typeCoverageEnabled}
            onChange={(event) => onTypeCoverageChange?.(event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={onClose} type="button">
            完成
          </button>
        </div>
      </section>
    </div>
  );
}
