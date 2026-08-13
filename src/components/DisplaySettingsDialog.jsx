export function DisplaySettingsDialog({
  onClose,
  onTypeCoverageChange,
  open = false,
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
