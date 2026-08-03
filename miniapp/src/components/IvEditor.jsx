import { useEffect, useState } from "react";
import { Input, Text, View } from "@tarojs/components";
import { clampDisplayIv } from "../view-models/combatant.js";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

function getInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function StatEditor({ onChange, sideLabel, stat }) {
  const [draft, setDraft] = useState(String(stat.displayIv));

  useEffect(() => {
    setDraft(String(stat.displayIv));
  }, [stat.displayIv]);

  function handleBlur(event) {
    const value = clampDisplayIv(getInputValue(event) || draft);
    setDraft(String(value));
    onChange(value);
  }

  return (
    <View
      aria-label={`${sideLabel}${stat.label}能力`}
      className="iv-editor__stat"
    >
      <View className="iv-editor__stat-heading">
        <Text className="iv-editor__stat-name">{stat.label}</Text>
        <Text className="iv-editor__panel">面板 {stat.panel}</Text>
      </View>
      <Text className="iv-editor__race">种族 {stat.race}</Text>
      <View className="iv-editor__input-row">
        <Text className="iv-editor__input-label">个体</Text>
        <Input
          aria-label={`${sideLabel}${stat.label}个体值`}
          className="iv-editor__input"
          inputMode="numeric"
          max={60}
          min={0}
          onBlur={handleBlur}
          onInput={(event) => setDraft(String(getInputValue(event)))}
          type="number"
          value={draft}
        />
      </View>
    </View>
  );
}

export default function IvEditor({ onChange, side, stats }) {
  const sideLabel = SIDE_LABELS[side] ?? "当前";

  return (
    <View aria-label={`${sideLabel}六项能力`} className="iv-editor">
      {stats.map((stat) => (
        <StatEditor
          key={stat.key}
          onChange={(value) => onChange(stat.key, value)}
          sideLabel={sideLabel}
          stat={stat}
        />
      ))}
    </View>
  );
}
