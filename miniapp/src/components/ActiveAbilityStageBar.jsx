import { Button, Text, View } from "@tarojs/components";

function clamp(value) {
  return Math.min(50, Math.max(-50, Math.floor(Number(value) || 0)));
}

function formatStage(value) {
  const percent = value * 10;
  const stageText = value > 0 ? `+${value}` : String(value);
  const percentText = percent > 0 ? `+${percent}%` : `${percent}%`;
  return `${stageText}层 · ${percentText}`;
}

function CompactStageControl({ ariaLabel, label, onChange, value }) {
  return (
    <View className="active-ability-stage__control">
      <Text className="active-ability-stage__label">{label}</Text>
      <View className="active-ability-stage__stepper">
        <Button
          aria-label={`${ariaLabel}降低一级`}
          className="active-ability-stage__button"
          disabled={value <= -50}
          hoverClass="active-ability-stage__button--pressed"
          onClick={() => onChange(clamp(value - 1))}
        >
          −
        </Button>
        <Text className="active-ability-stage__value">
          {formatStage(value)}
        </Text>
        <Button
          aria-label={`${ariaLabel}提高一级`}
          className="active-ability-stage__button"
          disabled={value >= 50}
          hoverClass="active-ability-stage__button--pressed"
          onClick={() => onChange(clamp(value + 1))}
        >
          ＋
        </Button>
      </View>
    </View>
  );
}

export default function ActiveAbilityStageBar({ direction, onChange, state }) {
  const attack = Number(state.overrides?.attackLevelStage ?? 0);
  const defense = Number(state.overrides?.defenseLevelStage ?? 0);
  const directionLabel = direction === "forward" ? "攻击方进攻" : "防守方进攻";

  return (
    <View aria-label="当前计算能力等级" className="active-ability-stage">
      <View className="active-ability-stage__heading">
        <Text className="active-ability-stage__title">能力等级</Text>
        <Text className="active-ability-stage__direction">{directionLabel}</Text>
      </View>
      <View className="active-ability-stage__grid">
        <CompactStageControl
          ariaLabel="当前攻击等级"
          label="攻击"
          onChange={(value) => onChange("attack", value)}
          value={attack}
        />
        <CompactStageControl
          ariaLabel="当前防御等级"
          label="防御"
          onChange={(value) => onChange("defense", value)}
          value={defense}
        />
      </View>
    </View>
  );
}
