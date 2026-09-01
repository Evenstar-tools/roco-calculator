import { Button, Text, View } from "@tarojs/components";

function clamp(value) {
  return Math.min(99, Math.max(-99, Math.floor(Number(value) || 0)));
}

function formatStage(value) {
  const percent = value * 10;
  const stageText = value > 0 ? `+${value}` : String(value);
  const percentText = percent > 0 ? `+${percent}%` : `${percent}%`;
  return {
    percent: percentText,
    stage: `${stageText}层`,
  };
}

function CompactStageControl({ ariaLabel, label, onChange, side, value }) {
  const sideLabel = side === "attacker" ? "攻击方" : "防守方";
  const formattedValue = formatStage(value);

  return (
    <View
      aria-label={`${sideLabel}${label}能力等级`}
      className="active-ability-stage__control"
    >
      <View className="active-ability-stage__label-group">
        <Text className="active-ability-stage__label">{label}</Text>
        <Text
          className={`active-ability-stage__side active-ability-stage__side--${side}`}
        >
          {sideLabel}
        </Text>
      </View>
      <View className="active-ability-stage__stepper">
        <Button
          aria-label={`${ariaLabel}降低一级`}
          className="active-ability-stage__button"
          disabled={value <= -99}
          hoverClass="active-ability-stage__button--pressed"
          onClick={() => onChange(clamp(value - 1))}
        >
          −
        </Button>
        <Text
          aria-label={`${formattedValue.stage}，${formattedValue.percent}`}
          className="active-ability-stage__value"
        >
          <Text className="active-ability-stage__value-line active-ability-stage__value-line--stage">
            {formattedValue.stage}
          </Text>
          <Text className="active-ability-stage__value-line active-ability-stage__value-line--percent">
            {formattedValue.percent}
          </Text>
        </Text>
        <Button
          aria-label={`${ariaLabel}提高一级`}
          className="active-ability-stage__button"
          disabled={value >= 99}
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
  const attackingSide = direction === "forward" ? "attacker" : "defender";
  const defendingSide = direction === "forward" ? "defender" : "attacker";

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
          side={attackingSide}
          value={attack}
        />
        <CompactStageControl
          ariaLabel="当前防御等级"
          label="防御"
          onChange={(value) => onChange("defense", value)}
          side={defendingSide}
          value={defense}
        />
      </View>
    </View>
  );
}
