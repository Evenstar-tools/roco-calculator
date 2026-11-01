import { StatIcon } from "../../components/StatIcon.jsx";
import { STAT_LABELS } from "../../domain/natures.js";
import { useLocale } from "../../i18n/LocaleContext.jsx";

// Clockwise from HP; match the in-game physical-left / magical-right layout.
const AXES = ["hp", "magicalAttack", "magicalDefense", "speed", "physicalDefense", "physicalAttack"]
  .map((stat, index) => ({ stat, x: Math.sin(index * Math.PI / 3), y: -Math.cos(index * Math.PI / 3) }));
const point = ({ x, y }, radius) => `${(120 + x * radius).toFixed(2)},${(80 + y * radius).toFixed(2)}`;
const outline = radius => AXES.map(axis => point(axis, radius)).join(" ");

export default function SpiritStatRadar({ spirit }) {
  const { t } = useLocale();
  const stats = spirit.raceStats;
  if (spirit.calculationStatus === "pending-race-stats" || spirit.previewIdentity?.raceStatsPlaceholder ||
      !AXES.every(({ stat }) => Number.isFinite(stats?.[stat]) && stats[stat] > 0)) return null;
  // One shared 0–300 scale for all released species (current maximum is 290).
  // Future larger values expand by whole hundreds instead of clipping.
  const maximum = Math.max(300, Math.ceil(Math.max(...AXES.map(({ stat }) => stats[stat])) / 100) * 100);
  return <figure className="sq-stat-radar" aria-label={t("种族值")}>
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <g className="sq-stat-radar__grid">
        {[18, 36, 54].map(radius => <polygon key={radius} points={outline(radius)} />)}
        {AXES.map(axis => <polyline key={axis.stat} points={`120,80 ${point(axis, 54)}`} />)}
      </g>
      <polygon className="sq-stat-radar__values" points={AXES.map(axis => point(axis, stats[axis.stat] / maximum * 54)).join(" ")} />
    </svg>
    {AXES.map(({ stat, x, y }) => <span key={stat} className="sq-stat-radar__label"
      style={{ left: `${50 + x * 44}%`, top: `${50 + y * 44}%` }}
      aria-label={`${t(STAT_LABELS[stat])} ${stats[stat]}`} title={t(STAT_LABELS[stat])}>
      <StatIcon stat={stat} size={18} /><b>{stats[stat]}</b>
    </span>)}
  </figure>;
}
