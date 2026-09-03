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
    <div
      aria-label={`${label}耐久概览`}
      className={`durability-overview durability-overview--${accent}`}
      role="group"
    >
      <div className="durability-overview__metrics">
        {metrics.map(([metricLabel, value]) => (
          <div className="durability-overview__metric" key={metricLabel}>
            <span>{metricLabel}</span>
            <output>{value.toLocaleString("zh-CN")}</output>
          </div>
        ))}
      </div>
      <p className="durability-overview__note">
        按当前面板最大生命计算，不受当前剩余生命影响。综合耐久 = 最大生命 ×
        物防 × 魔防 ÷（物防 + 魔防）
      </p>
      <button
        className="durability-overview__analyze"
        disabled={!onAnalyze}
        onClick={onAnalyze}
        type="button"
      >
        分析此精灵
      </button>
    </div>
  );
}
