import { ElementIcon } from "./ElementIcon.jsx";

function MatchupChip({ item, tone }) {
  return (
    <span
      aria-label={`${item.type} ${item.multiplier}倍`}
      className="type-analysis-chip"
      data-tone={tone}
      title={`${item.type} ×${item.multiplier}`}
    >
      <ElementIcon label size={17} type={item.type} />
      <b>×{item.multiplier}</b>
    </span>
  );
}

function MatchupRow({ items, label, tone }) {
  return (
    <div className="type-analysis-row">
      <span className="type-analysis-row__label">{label}</span>
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
  if (!analysis) return null;
  return (
    <section aria-label="属性分析" className="type-analysis-panel">
      <h2>属性分析</h2>
      <div className="type-analysis-group">
        <h3>{analysis.subjectName} · 自身防御面</h3>
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
        <h3>四技能进攻面</h3>
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
