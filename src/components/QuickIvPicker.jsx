import { CheckSquareOffset } from "@phosphor-icons/react";
import { QUICK_STATS, STAT_LABELS } from "../domain/natures.js";
import { StatIcon } from "./StatIcon.jsx";

export function QuickIvPicker({
  label,
  onChange,
  side,
  values,
}) {
  return (
    <div
      aria-label={`${label}快捷个体`}
      className={`quick-iv quick-iv--${side}`}
      role="group"
    >
      <span className="quick-iv__label" title="个体加点">
        <CheckSquareOffset aria-hidden="true" size={18} weight="bold" />
        <span className="sr-only">个体加点</span>
      </span>
      {QUICK_STATS.map((stat) => {
        const checked = Number(values?.[stat]) === 60;
        return (
          <label
            className="quick-iv__option"
            data-checked={checked}
            key={stat}
            title={`${STAT_LABELS[stat]}个体 ${checked ? 60 : 0}`}
          >
            <StatIcon size={19} stat={stat} />
            <input
              aria-label={`${label}${STAT_LABELS[stat]}个体加点`}
              checked={checked}
              onChange={(event) =>
                onChange(stat, event.currentTarget.checked ? 60 : 0)
              }
              type="checkbox"
            />
          </label>
        );
      })}
    </div>
  );
}
