import { Button, Text, View } from "@tarojs/components";

function clamp(value) {
  return Math.min(50, Math.max(-50, Math.floor(Number(value) || 0)));
}

function StageControl({ label, onChange, value }) {
  return (
    <View className="ability-stage__control">
      <Text className="ability-stage__label">{label}</Text>
      <View className="ability-stage__stepper">
        <Button
          aria-label={`${label}降低一级`}
          className="ability-stage__button"
          disabled={value <= -50}
          hoverClass="ability-stage__button--pressed"
          onClick={() => onChange(clamp(value - 1))}
        >
          −
        </Button>
        <Text className="ability-stage__value">{value}</Text>
        <Button
          aria-label={`${label}提高一级`}
          className="ability-stage__button"
          disabled={value >= 50}
          hoverClass="ability-stage__button--pressed"
          onClick={() => onChange(clamp(value + 1))}
        >
          ＋
        </Button>
      </View>
    </View>
  );
}

export default function AbilityStageEditor({ onChange, state }) {
  const attacker = {
    attack: Number(
      state.directions.forward.overrides?.attackLevelStage ?? 0,
    ),
    defense: Number(
      state.directions.reverse.overrides?.defenseLevelStage ?? 0,
    ),
  };
  const defender = {
    attack: Number(
      state.directions.reverse.overrides?.attackLevelStage ?? 0,
    ),
    defense: Number(
      state.directions.forward.overrides?.defenseLevelStage ?? 0,
    ),
  };

  return (
    <View aria-label="能力等级" className="ability-stage">
      <View className="ability-stage__heading">
        <Text className="ability-stage__title">能力等级</Text>
        <Text className="ability-stage__hint">＋提升 · −降低</Text>
      </View>
      <View className="ability-stage__grid">
        <View className="ability-stage__side ability-stage__side--attacker">
          <Text className="ability-stage__side-title">攻击方</Text>
          <StageControl
            label="攻击方攻击"
            onChange={(value) => onChange("attacker", "attack", value)}
            value={attacker.attack}
          />
          <StageControl
            label="攻击方防御"
            onChange={(value) => onChange("attacker", "defense", value)}
            value={attacker.defense}
          />
        </View>
        <View className="ability-stage__side ability-stage__side--defender">
          <Text className="ability-stage__side-title">防守方</Text>
          <StageControl
            label="防守方攻击"
            onChange={(value) => onChange("defender", "attack", value)}
            value={defender.attack}
          />
          <StageControl
            label="防守方防御"
            onChange={(value) => onChange("defender", "defense", value)}
            value={defender.defense}
          />
        </View>
      </View>
    </View>
  );
}
