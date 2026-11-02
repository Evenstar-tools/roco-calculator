import { STAT_LABELS, getNature } from "../domain/natures.js";
import { ArrowFatDown, ArrowFatUp } from "@phosphor-icons/react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { StatIcon } from "./StatIcon.jsx";
import "./stat-radar.css";

// Clockwise from HP; physical stats on the left, magical stats on the right.
const AXES = ["hp", "magicalAttack", "magicalDefense", "speed", "physicalDefense", "physicalAttack"]
  .map((stat, index) => ({ stat, x: Math.sin(index * Math.PI / 3), y: -Math.cos(index * Math.PI / 3) }));
const point = ({ x, y }, radius, game = false) => `${((game ? 160 : 120) + x * radius).toFixed(2)},${((game ? 130 : 80) + y * radius).toFixed(2)}`;
const outline = radius => AXES.map(axis => point(axis, radius)).join(" ");

export function StatRadar({ className = "", displayIvs, ivLabel, label, minimumMaximum = 300, natureId, onIvChange, stats, variant }) {
  const { t } = useLocale();
  if (!AXES.every(({ stat }) => Number.isFinite(stats?.[stat]) && stats[stat] > 0)) return null;
  const maximum = Math.max(minimumMaximum, Math.ceil(Math.max(...AXES.map(({ stat }) => stats[stat])) / 100) * 100);
  const nature = getNature(natureId);
  const game = variant === "game";
  const radius = game ? 82 : 54;
  const center = game ? "160,130" : "120,80";
  const AxisLabel = onIvChange ? "label" : "span";
  return <figure className={`stat-radar${game ? " stat-radar--game" : ""} ${className}`} aria-label={label}>
    <svg viewBox={game ? "0 0 320 260" : "0 0 240 160"} aria-hidden="true">
      <g className="stat-radar__grid">
        {game ? [27, 54, 82].map(r => <circle key={r} cx="160" cy="130" r={r} />)
          : [18, 36, 54].map(r => <polygon key={r} points={outline(r)} />)}
        {AXES.map(axis => <polyline key={axis.stat} points={`${center} ${point(axis, radius, game)}`} />)}
      </g>
      <polygon className="stat-radar__values" points={AXES.map(axis => point(axis, stats[axis.stat] / maximum * radius, game)).join(" ")} />
    </svg>
    {AXES.map(({ stat, x, y }) => <AxisLabel key={stat} className="stat-radar__label"
      style={{ left: `${50 + x * (game ? 43 : 44)}%`, top: `${50 + y * (game ? 42 : 44)}%` }}
      aria-label={`${t(STAT_LABELS[stat])} ${stats[stat]}`} title={t(STAT_LABELS[stat])}>
      <StatIcon gain={nature.upStat === stat} stat={stat} size={18} />
      <b className={Number(displayIvs?.[stat]) > 0 ? "stat-radar__iv-gain" : undefined}>{stats[stat]}</b>
      {game && nature.upStat === stat && <ArrowFatUp aria-hidden="true" className="stat-radar__nature stat-radar__nature--up" size={15} weight="fill" />}
      {game && nature.downStat === stat && <ArrowFatDown aria-hidden="true" className="stat-radar__nature stat-radar__nature--down" size={15} weight="fill" />}
      {onIvChange && <input type="checkbox" checked={Number(displayIvs?.[stat]) === 60}
        aria-label={t("{label}{stat}个体加点", { label: ivLabel, stat: t(STAT_LABELS[stat]) })}
        title={t("{stat}个体 {value}", { stat: t(STAT_LABELS[stat]), value: displayIvs?.[stat] ?? 0 })}
        onChange={event => onIvChange(stat, event.currentTarget.checked ? 60 : 0)} />}
    </AxisLabel>)}
  </figure>;
}
