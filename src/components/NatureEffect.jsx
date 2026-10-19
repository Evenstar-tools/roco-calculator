import {
  STAT_LABELS,
  getNature,
} from "../domain/natures.js";
import { StatIcon } from "./StatIcon.jsx";
import { useLocale } from "../i18n/LocaleContext.jsx";

export function NatureEffect({ natureId, placeholder = false }) {
  const { t } = useLocale();
  if (placeholder && natureId == null) return <div className="nature-effect nature-effect--neutral">{t("未设置")}</div>;
  const nature = getNature(natureId);
  if (!nature.upStat || !nature.downStat) {
    return <div className="nature-effect nature-effect--neutral">{t(placeholder ? "国服中文参考" : "无修正")}</div>;
  }

  return (
    <div
      aria-label={placeholder ? `${t(STAT_LABELS[nature.upStat])}↑ ${t(STAT_LABELS[nature.downStat])}↓` : t("{up}提升百分之二十，{down}降低百分之十", { up: t(STAT_LABELS[nature.upStat]), down: t(STAT_LABELS[nature.downStat]) })}
      className="nature-effect"
    >
      <span className="nature-effect__item nature-effect__item--up">
        <StatIcon stat={nature.upStat} />
        <span>{t(STAT_LABELS[nature.upStat])}</span>
        <strong>{placeholder ? "↑" : "+20% ↑"}</strong>
      </span>
      <span aria-hidden="true" className="nature-effect__divider" />
      <span className="nature-effect__item nature-effect__item--down">
        <StatIcon stat={nature.downStat} />
        <span>{t(STAT_LABELS[nature.downStat])}</span>
        <strong>{placeholder ? "↓" : "-10% ↓"}</strong>
      </span>
    </div>
  );
}
