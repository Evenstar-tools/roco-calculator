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
  side,
  value,
}) {
  const selectedStat = getNature(value).upStat;
  const SideIcon = side === "attacker" ? Sword : Shield;

  return (
    <div
      aria-label={`${label}快捷性格`}
      className={`quick-nature quick-nature--${side}`}
      role="group"
    >
      <span className="quick-nature__side" title={label}>
        <SideIcon aria-hidden="true" size={18} weight="fill" />
        <span className="sr-only">{label}</span>
      </span>
      <button
        aria-label={`${label}普通性格`}
        aria-pressed={!selectedStat}
        className="quick-nature__option quick-nature__option--neutral"
        onClick={() => onChange("neutral")}
        title="普通（无修正）"
        type="button"
      >
        <Equals aria-hidden="true" size={16} weight="bold" />
        <span>普通</span>
      </button>
      {QUICK_STATS.map((stat) => (
        <button
          aria-label={`${label}${STAT_LABELS[stat]}增益`}
          aria-pressed={selectedStat === stat}
          className="quick-nature__option"
          key={stat}
          onClick={() => onChange(resolveCompactNaturePreset(stat, displayIvs))}
          title={`${STAT_LABELS[stat]} +20%`}
          type="button"
        >
          <StatIcon size={19} stat={stat} />
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
