import { Text, View } from "@tarojs/components";
import ElementIcon from "./ElementIcon.jsx";

function MatchupChip({ item, tone }) {
  return (
    <View
      aria-label={`${item.type} ${item.multiplier}倍`}
      className={`type-analysis__chip type-analysis__chip--${tone}`}
    >
      <ElementIcon type={item.type} />
      <Text>{item.type}</Text>
      <Text className="type-analysis__multiplier">×{item.multiplier}</Text>
    </View>
  );
}

function MatchupRow({ items, label, tone }) {
  return (
    <View className="type-analysis__row">
      <Text className="type-analysis__label">{label}</Text>
      <View className="type-analysis__chips">
        {items?.length ? items.map((item) => (
          <MatchupChip item={item} key={item.type} tone={tone} />
        )) : <Text className="type-analysis__empty">—</Text>}
      </View>
    </View>
  );
}

export default function TypeAnalysisPanel({ analysis }) {
  if (!analysis) return null;
  return (
    <View aria-label="属性分析" className="type-analysis">
      <Text className="type-analysis__title">属性分析</Text>
      <View className="type-analysis__group">
        <Text className="type-analysis__group-title">
          {analysis.subjectName} · 自身防御面
        </Text>
        <MatchupRow
          items={analysis.defense?.weaknesses}
          label="弱点"
          tone="weakness"
        />
        <MatchupRow
          items={analysis.defense?.resistances}
          label="抗性"
          tone="resistance"
        />
      </View>
      <View className="type-analysis__group">
        <Text className="type-analysis__group-title">四技能进攻面</Text>
        <MatchupRow
          items={analysis.offense?.coverage}
          label="克制"
          tone="coverage"
        />
        <MatchupRow
          items={analysis.offense?.blindSpots}
          label="盲点"
          tone="blind"
        />
      </View>
    </View>
  );
}
