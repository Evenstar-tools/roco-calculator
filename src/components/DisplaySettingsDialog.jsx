export function DisplaySettingsDialog({
  negativeStatusSettlementEnabled = false,
  onClose,
  onNegativeStatusSettlementChange,
  onPowerDisplayModeChange,
  onTypeCoverageChange,
  open = false,
  powerDisplayMode = "static",
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
            <strong>技能威力口径</strong>
            <small>决定技能栏显示和手动输入代表的数值；切换本身不改变伤害。</small>
          </span>
          <div
            aria-label="技能威力口径"
            className="display-settings-segment"
            role="group"
          >
            <button
              aria-pressed={powerDisplayMode !== "panel"}
              onClick={() => onPowerDisplayModeChange?.("static")}
              type="button"
            >
              静态威力
            </button>
            <button
              aria-pressed={powerDisplayMode === "panel"}
              onClick={() => onPowerDisplayModeChange?.("panel")}
              type="button"
            >
              显示威力
            </button>
          </div>
          <div className="display-settings-power-help">
            <small>
              <strong>静态威力：</strong>技能自身规则与固定威力调整后的结果；不含特性、印记、本系和克制。
            </small>
            <small>
              <strong>显示威力：</strong>有效威力结算本系、克制、天气、能力等级与其他威力乘区后四舍五入；手动填写后直接用于伤害计算。
            </small>
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
        <label className="display-settings-option">
          <span>
            <strong>负面状态结算</strong>
            <small>显示本回合新增状态与追加伤害</small>
          </span>
          <input
            aria-label="负面状态结算"
            checked={negativeStatusSettlementEnabled}
            onChange={(event) =>
              onNegativeStatusSettlementChange?.(event.target.checked)
            }
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
