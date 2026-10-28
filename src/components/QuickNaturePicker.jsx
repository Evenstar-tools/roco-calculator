import { useLocale } from "../i18n/LocaleContext.jsx";
import {
  ArrowUp,
  Equals,
  Shield,
  Sword,
} from "@phosphor-icons/react";
import {
  getNature,
  QUICK_STATS,
  resolveCompactNaturePreset,
  STAT_LABELS,
} from "../domain/natures.js";
import { StatIcon } from "./StatIcon.jsx";

export function QuickNaturePicker({
  displayIvs,
  label,
  onChange,
  placeholder = false,
  showOptionLabels = false,
  side,
  value,
}) {
  const { t } = useLocale();
  const selectedStat = getNature(value).upStat;
  const SideIcon = side === "attacker" ? Sword : Shield;

  return (
    <div
      aria-label={t("{label}快捷性格", { label })}
      className={`quick-nature quick-nature--${side}${showOptionLabels ? " quick-nature--labeled" : ""}`}
      role="group"
    >
      <span className="quick-nature__side" title={label}>
        <SideIcon aria-hidden="true" size={18} weight="fill" />
        <span className="sr-only">{label}</span>
      </span>
      <button
        aria-label={t("{label}普通性格", { label })}
        aria-pressed={placeholder ? value === "neutral" : !selectedStat}
        className="quick-nature__option quick-nature__option--neutral"
        onClick={() => onChange("neutral")}
        title={t(placeholder && value == null ? "未设置" : "普通（无修正）")}
        type="button"
      >
        <Equals aria-hidden="true" size={16} weight="bold" />
        <span>{placeholder && value == null ? "—" : t(showOptionLabels ? "普通" : "性格")}</span>
      </button>
      {QUICK_STATS.map((stat) => (
        <button
          aria-label={t("{label}{stat}增益", { label, stat: t(STAT_LABELS[stat]) })}
          aria-pressed={selectedStat === stat}
          className="quick-nature__option"
          key={stat}
          onClick={() => onChange(resolveCompactNaturePreset(stat, displayIvs))}
          title={placeholder ? t("{stat}增益", { stat: t(STAT_LABELS[stat]) }) : `${t(STAT_LABELS[stat])} +20%`}
          type="button"
        >
          <StatIcon size={19} stat={stat} />
          {showOptionLabels ? <span className="quick-nature__name">{t(STAT_LABELS[stat])}</span> : null}
          <ArrowUp
            aria-hidden="true"
            className="quick-nature__up"
            size={10}
            weight="bold"
          />
        </button>
      ))}
    </div>
  );
}
