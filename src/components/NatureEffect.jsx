import {
  STAT_LABELS,
  getNature,
} from "../domain/natures.js";
import { StatIcon } from "./StatIcon.jsx";

export function NatureEffect({ natureId }) {
  const nature = getNature(natureId);
  if (!nature.upStat || !nature.downStat) {
    return <div className="nature-effect nature-effect--neutral">无修正</div>;
  }

  return (
    <div
      aria-label={`${STAT_LABELS[nature.upStat]}提升百分之二十，${STAT_LABELS[nature.downStat]}降低百分之十`}
      className="nature-effect"
    >
      <span className="nature-effect__item nature-effect__item--up">
        <StatIcon stat={nature.upStat} />
        <span>{STAT_LABELS[nature.upStat]}</span>
        <strong>+20% ↑</strong>
      </span>
      <span aria-hidden="true" className="nature-effect__divider" />
      <span className="nature-effect__item nature-effect__item--down">
        <StatIcon stat={nature.downStat} />
        <span>{STAT_LABELS[nature.downStat]}</span>
        <strong>-10% ↓</strong>
      </span>
    </div>
  );
}
