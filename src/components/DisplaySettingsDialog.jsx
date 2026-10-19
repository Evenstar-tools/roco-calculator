import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { getSeasonTheme, SELECTABLE_SEASON_THEMES } from "../theme/season-themes.js";
import { X } from "@phosphor-icons/react";

export function DisplaySettingsDialog({
  compactOptionLabelsEnabled = false,
  dialogRef,
  damageComparisonEnabled = false,
  durabilityOverviewEnabled = false,
  formConfigMemoryEnabled = false,
  negativeStatusSettlementEnabled = false,
  onClose,
  onCompactOptionLabelsChange,
  onDamageComparisonChange,
  onDurabilityOverviewChange,
  onFormConfigMemoryChange,
  onNegativeStatusSettlementChange,
  onPowerDisplayModeChange,
  onTypeCoverageChange,
  open = false,
  powerDisplayMode = "static",
  typeCoverageEnabled = false,
}) {
  const { t } = useLocale();
  const { serverId, seasonThemeId, seasonPreview, seasonThemePreference = "default", onSeasonThemeChange } = useRuntime();
  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label={t("显示设置")}
        aria-modal="true"
        className="share-dialog display-settings-dialog"
        role="dialog"
        ref={dialogRef}
      >
        <h2>{t("显示设置")}<button aria-label={t("关闭显示设置")} className="display-settings-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </h2>
        <label className="display-settings-option display-settings-option--season">
          <span><strong>{t("赛季主题")}</strong></span>
          <select aria-label={t("赛季主题")}
            value={seasonPreview ? "preview" : serverId === "cn" && seasonThemePreference === "default" ? "s4" : seasonThemePreference}
            onChange={(event) => onSeasonThemeChange?.(event.target.value)}>
            {seasonPreview && <option disabled value="preview">{t("{theme}（预览）", {
              theme: `${seasonThemeId.toUpperCase()} ${getSeasonTheme(seasonThemeId).sourceName}`,
            })}</option>}
            {serverId !== "cn" && <option value="default">{t("默认（无赛季装饰）")}</option>}
            {SELECTABLE_SEASON_THEMES.map(({ id, sourceName }) => <option key={id} value={id}>{id.toUpperCase()} {sourceName}</option>)}
          </select>
        </label>
        <div className="display-settings-option display-settings-option--power">
          <span>
            <strong>{t("技能威力口径")}</strong>
            <small>{t("决定技能栏显示和手动输入代表的数值；切换本身不改变伤害。")}</small>
          </span>
          <div
            aria-label={t("技能威力口径")}
            className="display-settings-segment"
            role="group"
          >
            <button
              aria-pressed={powerDisplayMode !== "panel"}
              onClick={() => onPowerDisplayModeChange?.("static")}
              type="button"
            >{t("静态威力")}</button>
            <button
              aria-pressed={powerDisplayMode === "panel"}
              onClick={() => onPowerDisplayModeChange?.("panel")}
              type="button"
            >{t("显示威力")}</button>
          </div>
          {serverId === "cn" && <small>
            {t(powerDisplayMode === "panel"
              ? "结算本次增益并取整；手填值直接参与伤害计算。"
              : "技能自身规则调整后的威力，额外增益另算。")}
          </small>}
          <details className="display-settings-power-details">
            <summary>{t("口径说明")}</summary>
            <div className="display-settings-power-help">
              {serverId === "global" ? <small>{t("显示偏好可先保存，实际口径待国际服规则核验后启用。")}</small> : <><small>
                <strong>{t("静态威力：")}</strong>{t("技能自身规则、固定威力和继承迸发调整后的结果；不含本次额外触发的特性、本系和克制。")}</small>
              <small>
                <strong>{t("显示威力：")}</strong>{t("有效威力结算本系、克制、能力等级与其他威力乘区后取整（非负威力向下取整）；雨天计入威力加成区。手动填写后直接用于伤害计算。")}</small></>}
            </div>
          </details>
        </div>
        <label className="display-settings-option">
          <span>
            <strong>{t("显示选项名称")}</strong>
            <small>{t("在精简版显示属性和技能模式名称")}</small>
          </span>
          <input
            aria-label={t("显示选项名称")}
            checked={compactOptionLabelsEnabled}
            onChange={(event) => onCompactOptionLabelsChange?.(event.target.checked)}
            type="checkbox"
          />
        </label>
        <label className="display-settings-option">
          <span>
            <strong>{t("属性克制与打击面")}</strong>
            <small>{t("在结果栏显示弱点、抗性和技能覆盖")}</small>
          </span>
          <input
            aria-label={t("属性克制与打击面")}
            checked={typeCoverageEnabled}
            onChange={(event) => onTypeCoverageChange?.(event.target.checked)}
            type="checkbox"
          />
        </label>
        <label className="display-settings-option">
          <span>
            <strong>{t("显示面板耐久")}</strong>
            <small>{t("在具体版六维下方显示物理、魔法与综合耐久")}</small>
          </span>
          <input
            aria-label={t("显示面板耐久")}
            checked={durabilityOverviewEnabled}
            onChange={(event) =>
              onDurabilityOverviewChange?.(event.target.checked)
            }
            type="checkbox"
          />
        </label>
        <label className="display-settings-option">
          <span>
            <strong>{t("负面状态结算")}</strong>
            <small>{t("显示本回合新增状态与追加伤害")}</small>
          </span>
          <input
            aria-label={t("负面状态结算")}
            checked={negativeStatusSettlementEnabled}
            onChange={(event) =>
              onNegativeStatusSettlementChange?.(event.target.checked)
            }
            type="checkbox"
          />
        </label>
        <label className="display-settings-option">
          <span>
            <strong>{t("显示全精灵承伤入口")}</strong>
            <small>{t("关闭后隐藏结果栏和手机底栏的承伤对比按钮，不影响伤害计算")}</small>
          </span>
          <input
            aria-label={t("显示全精灵承伤入口")}
            checked={damageComparisonEnabled}
            onChange={(event) => onDamageComparisonChange?.(event.target.checked)}
            type="checkbox"
          />
        </label>
        <label className="display-settings-option">
          <span>
            <strong>{t("记忆萌化状态")}</strong>
            <small>{t("跨页面记住双方萌化开关，可能影响低阶精灵预设的加载。")}</small>
          </span>
          <input
            aria-label={t("记忆萌化状态")}
            checked={formConfigMemoryEnabled}
            onChange={(event) => onFormConfigMemoryChange?.(event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-action secondary-panel-primary" onClick={onClose} type="button">{t("完成")}</button>
        </div>
      </section>
    </div>
  );
}
