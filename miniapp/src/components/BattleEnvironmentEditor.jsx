import { Input, Text, View } from "@tarojs/components";

function readNumber(event, fallback = 0) {
  const raw = event?.detail?.value ?? event?.target?.value ?? "";
  if (String(raw).trim() === "") return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function NumericField({ label, max, min = 0, onChange, suffix, value }) {
  return (
    <View className="battle-environment__field">
      <Text className="battle-environment__label">{label}</Text>
      <View className="battle-environment__input-wrap">
        <Input
          aria-label={label}
          className="battle-environment__input"
          inputMode="decimal"
          max={max}
          min={min}
          onInput={(event) => {
            const next = readNumber(event, min);
            if (next !== null) onChange(next);
          }}
          type="number"
          value={value}
        />
        {suffix ? <Text className="battle-environment__suffix">{suffix}</Text> : null}
      </View>
    </View>
  );
}

export default function BattleEnvironmentEditor({
  defenderMaxHp,
  direction,
  onChange,
  onRainChange,
}) {
  const rainTurns = Math.max(
    0,
    Math.floor(Number(direction.context?.weatherRainTurns) || 0),
  );

  return (
    <View aria-label="环境与生命" className="battle-environment">
      <View className="battle-environment__heading">
        <Text className="battle-environment__title">环境与生命</Text>
        <Text className="battle-environment__hint">影响当前计算</Text>
      </View>
      <View className="battle-environment__grid">
        <NumericField
          label="目标当前生命"
          max={defenderMaxHp}
          onChange={(currentHp) => onChange({
            currentHp: Math.min(defenderMaxHp ?? currentHp, Math.max(0, Math.floor(currentHp))),
          })}
          suffix={defenderMaxHp ? `/ ${defenderMaxHp}` : "HP"}
          value={direction.currentHp ?? defenderMaxHp ?? ""}
        />
        <NumericField
          label="雨天回合"
          max={8}
          onChange={(value) => {
            const weatherRainTurns = Math.min(
              8,
              Math.max(0, Math.floor(value)),
            );
            if (onRainChange) onRainChange(weatherRainTurns);
            else onChange({ context: { weatherRainTurns } });
          }}
          suffix="回合"
          value={rainTurns}
        />
        <NumericField
          label="减伤比例"
          max={100}
          onChange={(value) => onChange({
            reduction: 1 - Math.min(100, Math.max(0, value)) / 100,
          })}
          suffix="%"
          value={Math.round((1 - Number(direction.reduction ?? 1)) * 100)}
        />
        <NumericField
          label="最终伤害倍率"
          max={100}
          min={0}
          onChange={(finalDamageMultiplier) => onChange({ finalDamageMultiplier })}
          suffix="×"
          value={Number(direction.finalDamageMultiplier ?? 1)}
        />
      </View>
    </View>
  );
}
