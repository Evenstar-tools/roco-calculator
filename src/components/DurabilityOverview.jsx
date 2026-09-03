import { calculateDurability } from "../features/team-ability/domain/durability.js";

function readPanelStat(stats, key, showFinalPanel) {
  const stat = stats.find((item) => item.key === key);
  return showFinalPanel ? stat?.panel : (stat?.basePanel ?? stat?.panel);
}

export function DurabilityOverview({
  accent,
  label,
  onAnalyze,
  showFinalPanel,
  stats,
}) {
  const durability = calculateDurability({
    maxHp: readPanelStat(stats, "hp", showFinalPanel),
    physicalDefense: readPanelStat(stats, "physicalDefense", showFinalPanel),
    magicalDefense: readPanelStat(stats, "magicalDefense", showFinalPanel),
  }).display;

  const metrics = [
    ["物理耐久", durability.physical],
    ["魔法耐久", durability.magical],
    ["综合耐久", durability.combined],
  ];

  return (
    <button
      aria-label={`${label}耐久概览`}
      className={`durability-overview durability-overview--${accent}${onAnalyze ? " is-interactive" : ""}`}
      data-tooltip={onAnalyze ? "点击进入能力分析" : undefined}
      disabled={!onAnalyze}
      onClick={onAnalyze}
      type="button"
    >
      <span className="durability-overview__metrics">
        {metrics.map(([metricLabel, value]) => (
          <span className="durability-overview__metric" key={metricLabel}>
            <span>{metricLabel}</span>
            <output>{value.toLocaleString("zh-CN")}</output>
          </span>
        ))}
      </span>
    </button>
  );
}
