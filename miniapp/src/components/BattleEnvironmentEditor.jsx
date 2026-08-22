import { Button, Input, Text, View } from "@tarojs/components";

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
  onCurrentHpChange,
  onRainChange,
  onWeatherChange,
  showThunder = false,
}) {
  const rainTurns = Math.max(
    0,
    Math.floor(Number(direction.context?.weatherRainTurns) || 0),
  );
  const thunder = direction.context?.weatherThunder === true;
  const weather = thunder ? "thunder" : rainTurns > 0 ? "rain" : "none";

  return (
    <View aria-label="常用条件" className="battle-environment">
      <View className="battle-environment__heading">
        <Text className="battle-environment__title">常用条件</Text>
        <Text className="battle-environment__hint">影响当前计算</Text>
      </View>
      <View className="battle-environment__grid">
        <NumericField
          label="目标当前生命"
          max={defenderMaxHp}
          onChange={(currentHp) => onCurrentHpChange(
            Math.min(
              defenderMaxHp ?? currentHp,
              Math.max(0, Math.floor(currentHp)),
            ),
          )}
          suffix={defenderMaxHp ? `/ ${defenderMaxHp}` : "HP"}
          value={direction.currentHp ?? defenderMaxHp ?? ""}
        />
        <View className="battle-environment__weather">
          <Text className="battle-environment__label">天气</Text>
          <View className="battle-environment__weather-choices">
            <Button
              aria-label="无天气"
              aria-pressed={weather === "none"}
              className={weather === "none"
                ? "battle-environment__weather-button battle-environment__weather-button--active"
                : "battle-environment__weather-button"}
              onClick={() => onWeatherChange
                ? onWeatherChange("none")
                : onRainChange(0)}
            >
              无
            </Button>
            <Button
              aria-label="雨天"
              aria-pressed={weather === "rain"}
              className={weather === "rain"
                ? "battle-environment__weather-button battle-environment__weather-button--active"
                : "battle-environment__weather-button"}
              onClick={() => onWeatherChange
                ? onWeatherChange("rain")
                : onRainChange(rainTurns > 0 ? rainTurns : 8)}
            >
              雨天
            </Button>
            {showThunder ? (
              <Button
                aria-label="雷暴"
                aria-pressed={weather === "thunder"}
                className={weather === "thunder"
                  ? "battle-environment__weather-button battle-environment__weather-button--active"
                  : "battle-environment__weather-button"}
                onClick={() => onWeatherChange?.("thunder")}
              >
                雷暴
              </Button>
            ) : null}
          </View>
        </View>
        {weather === "rain" ? (
          <NumericField
            label="雨天回合"
            max={8}
            onChange={(value) => onRainChange(Math.min(
              8,
              Math.max(0, Math.floor(value)),
            ))}
            suffix="回合"
            value={rainTurns}
          />
        ) : null}
      </View>
    </View>
  );
}
