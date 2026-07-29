import { CaretDown, SlidersHorizontal } from "@phosphor-icons/react";
import { useState } from "react";

function numericValue(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function AdvancedOptions({
  finalMultiplier,
  onFinalMultiplierChange,
  onReductionChange,
  onStarfallStacksChange,
  reductionPercent,
  starfallStacks,
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`advanced-options${open ? " is-open" : ""}`}>
      <button
        aria-expanded={open}
        className="advanced-options__toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>
          <SlidersHorizontal aria-hidden="true" size={19} />
          高级选项
        </span>
        <CaretDown aria-hidden="true" size={16} weight="bold" />
      </button>

      {open ? (
        <div className="advanced-options__content">
          <label className="field-group">
            <span>防御技能减伤</span>
            <span className="input-with-unit">
              <input
                aria-label="防御技能减伤"
                max="100"
                min="0"
                onChange={(event) => onReductionChange(numericValue(event.target.value))}
                type="number"
                value={reductionPercent}
              />
              <span>%</span>
            </span>
          </label>
          <label className="field-group">
            <span>星陨层数</span>
            <input
              aria-label="星陨层数"
              min="0"
              onChange={(event) =>
                onStarfallStacksChange(
                  Math.max(0, Math.floor(numericValue(event.target.value))),
                )
              }
              step="1"
              type="number"
              value={starfallStacks}
            />
          </label>
          <label className="field-group">
            <span>最终伤害倍率</span>
            <input
              aria-label="最终伤害倍率"
              min="0"
              onChange={(event) => onFinalMultiplierChange(numericValue(event.target.value, 1))}
              step="0.05"
              type="number"
              value={finalMultiplier}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
