import { CaretDown } from "@phosphor-icons/react";
import {
  NATURES,
  STAT_LABELS,
  normalizeNatureId,
} from "../domain/natures.js";

const GROUP_ORDER = [
  "hp",
  "physicalAttack",
  "magicalAttack",
  "speed",
  "physicalDefense",
  "magicalDefense",
];

function optionLabel(nature) {
  if (!nature.upStat || !nature.downStat) {
    return `${nature.name}（无修正）`;
  }
  return `${nature.name}（+${STAT_LABELS[nature.upStat]} -${STAT_LABELS[nature.downStat]}）`;
}

export function NatureSelect({ ariaLabel, onChange, value }) {
  const neutral = NATURES.find((nature) => nature.id === "neutral");

  return (
    <label className="nature-select">
      <span className="sr-only">{ariaLabel}</span>
      <select
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        value={normalizeNatureId(value)}
      >
        <option value={neutral.id}>{optionLabel(neutral)}</option>
        {GROUP_ORDER.map((upStat) => (
          <optgroup key={upStat} label={`+${STAT_LABELS[upStat]}`}>
            {NATURES.filter((nature) => nature.upStat === upStat).map(
              (nature) => (
                <option key={nature.id} value={nature.id}>
                  {optionLabel(nature)}
                </option>
              ),
            )}
          </optgroup>
        ))}
      </select>
      <CaretDown aria-hidden="true" size={14} weight="bold" />
    </label>
  );
}
