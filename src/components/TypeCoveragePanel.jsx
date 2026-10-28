import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { ElementIcon } from "./ElementIcon.jsx";

function MatchupChip({ item, tone }) {
  const { tc, typeLabel } = useCalculatorLocale();
  return (
    <span
      aria-label={tc("{v0} {v1}倍", { v0: typeLabel(item.type), v1: item.multiplier })}
      className="type-analysis-chip"
      data-tone={tone}
      title={`${typeLabel(item.type)} ×${item.multiplier}`}
    >
      <ElementIcon label size={17} type={item.type} />
      <b>×{tc(item.multiplier)}</b>
    </span>
  );
}

function MatchupRow({ items, label, tone }) {
  const { tc } = useCalculatorLocale();
  return (
    <div className="type-analysis-row">
      <span className="type-analysis-row__label">{tc(label)}</span>
      <div className="type-analysis-row__items">
        {items.length > 0 ? (
          items.map((item) => (
            <MatchupChip item={item} key={item.type} tone={tone} />
          ))
        ) : (
          <span className="type-analysis-row__empty">—</span>
        )}
      </div>
    </div>
  );
}

export function TypeCoveragePanel({ analysis }) {
  const { tc } = useCalculatorLocale();
  if (!analysis) return null;
  return (
    <section aria-label={tc("属性分析")} className="type-analysis-panel">
      <h2>{tc("属性分析")}</h2>
      <div className="type-analysis-group">
        <h3>{tc(analysis.subjectName)}{tc(" · 自身防御面")}</h3>
        <MatchupRow
          items={analysis.defense.weaknesses}
          label="弱点"
          tone="weakness"
        />
        <MatchupRow
          items={analysis.defense.resistances}
          label="抗性"
          tone="resistance"
        />
      </div>
      <div className="type-analysis-group">
        <h3>{tc("四技能进攻面")}</h3>
        <MatchupRow
          items={analysis.offense.coverage}
          label="克制"
          tone="coverage"
        />
        <MatchupRow
          items={analysis.offense.blindSpots}
          label="盲点"
          tone="blind"
        />
      </div>
    </section>
  );
}
