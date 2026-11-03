import { Button, Text, View } from "@tarojs/components";
import { clampAbilityStage, finiteNumber } from "../shared/domain/skill-result/numeric.js";

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

export default function ActiveAbilityStageBar({ direction, onChange, skillOverrides = {}, state }) {
  const attack = Number(state.overrides?.attackLevelStage ?? 0);
  const defense = Number(state.overrides?.defenseLevelStage ?? 0);
  const physicalAttackAdd = finiteNumber(skillOverrides.physicalAttackLevelStageAdd, state.overrides?.physicalAttackLevelStageAdd) ?? 0;
  const magicalAttackAdd = finiteNumber(skillOverrides.magicalAttackLevelStageAdd, state.overrides?.magicalAttackLevelStageAdd) ?? 0;
  const magicalDefenseAdd = finiteNumber(state.overrides?.magicalDefenseLevelStageAdd) ?? 0;
  const selectedAttack = finiteNumber(skillOverrides.attackLevelStage, attack) ?? 0;
  const selectedDefense = finiteNumber(skillOverrides.defenseLevelStage, defense) ?? 0;
  const percent = value => formatStage(clampAbilityStage(value)).percent;
  const summaries = [
    ...(physicalAttackAdd !== 0 || magicalAttackAdd !== 0
      ? [`攻击合计：物攻 ${percent(selectedAttack + physicalAttackAdd)} · 魔攻 ${percent(selectedAttack + magicalAttackAdd)}`] : []),
    ...(magicalDefenseAdd !== 0
      ? [`防御合计：物防 ${percent(selectedDefense)} · 魔防 ${percent(selectedDefense + magicalDefenseAdd)}`] : []),
  ];
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
      {summaries.length > 0 ? (
        <View aria-label="分类能力等级合计" className="active-ability-stage__specific">
          {summaries.map(summary => <Text className="active-ability-stage__specific-summary" key={summary}>{summary}</Text>)}
        </View>
      ) : null}
    </View>
  );
}
