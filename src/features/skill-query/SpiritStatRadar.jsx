import { StatRadar } from "../../components/StatRadar.jsx";
import { useLocale } from "../../i18n/LocaleContext.jsx";

export default function SpiritStatRadar({ spirit }) {
  const { t } = useLocale();
  if (spirit.calculationStatus === "pending-race-stats" || spirit.previewIdentity?.raceStatsPlaceholder) return null;
  return <StatRadar className="sq-stat-radar" label={t("种族值")} stats={spirit.raceStats} />;
}
