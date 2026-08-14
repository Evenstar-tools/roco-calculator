function numericValue(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stepByLabel(result, label) {
  return result?.formulaSteps?.find((step) =>
    String(step?.label ?? "").trim().endsWith(label)
  );
}

const ATTACK_STAT_LABELS = {
  magicalAttack: "魔攻",
  physicalAttack: "物攻",
};

export function displayFormulaNumber(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return Number(numeric.toFixed(digits)).toString();
}

export function displayDamageCoefficient(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const numerator = numeric * 41;
  const roundedNumerator = Math.round(numerator);
  const displayedNumerator =
    Math.abs(numerator - roundedNumerator) < 0.00001
      ? roundedNumerator
      : displayFormulaNumber(numerator, 6);
  return `${displayedNumerator}/41`;
}

export function buildResultFormulaAudit(result) {
  if (!result?.formulaSteps?.length) return null;

  const attackPanel = stepByLabel(result, "攻击面板");
  const basePower = stepByLabel(result, "基础威力");
  const displayedBasePower = stepByLabel(result, "游戏内显示威力");
  const fixedPower = stepByLabel(result, "固定威力增加");
  const markFixedPower = stepByLabel(result, "印记固定威力");
  const traitFixedPower = stepByLabel(result, "特性固定威力");
  const percentPower = stepByLabel(result, "技能威力百分比");
  const sameType = stepByLabel(result, "本系");
  const type = stepByLabel(result, "属性克制");
  const weather = stepByLabel(result, "天气");
  const levels = stepByLabel(result, "攻防等级");
  const other = stepByLabel(result, "其他威力乘区");
  const displayPower = stepByLabel(result, "显示威力");
  const damage =
    stepByLabel(result, "等级系数与攻防比") ??
    stepByLabel(result, "每段伤害");
  const settlement =
    stepByLabel(result, "减伤、连击与最终倍率") ??
    stepByLabel(result, "连击总伤害");
  const damageInput = damage?.input ?? {};
  const settlementInput = settlement?.input ?? {};
  const primaryPower = basePower ?? displayedBasePower;

  const powerFactors = [
    { label: "本系", value: sameType?.input },
    {
      label: "克制",
      value:
        Number(type?.before) === 0
          ? 1
          : numericValue(Number(type?.after) / Number(type?.before), 1),
    },
    {
      label: weather?.input?.weather ?? "天气",
      value: weather?.input?.multiplier,
    },
    { label: "能力等级", value: levels?.input },
    { label: "其他", value: other?.input },
  ].filter((item) => Number.isFinite(Number(item.value)));

  const percentAdds = Array.isArray(percentPower?.input)
    ? percentPower.input.reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      )
    : 0;
  const hitCount = Math.max(
    1,
    Math.floor(Number(settlementInput.hitCount ?? result.hitCount) || 1),
  );

  return {
    attackLabel: ATTACK_STAT_LABELS[attackPanel?.input] ?? "攻击",
    defenseLabel:
      attackPanel?.input === "magicalAttack" ? "魔防" : "物防",
    formulaPower: {
      displayed:
        damageInput.displayedPower ??
        displayPower?.after ??
        result.displayedPower ??
        result.effectivePower,
      factors: powerFactors,
      internal:
        damageInput.calculationPower ??
        displayPower?.before ??
        primaryPower?.after,
    },
    numerator: {
      attack: damageInput.attackerStat ?? attackPanel?.after,
      afterRound: damageInput.roundedNumerator,
      coefficient: damageInput.coefficient,
      power:
        damageInput.calculationPower ??
        displayPower?.before ??
        primaryPower?.after,
    },
    oneHit: {
      afterFloor: damage?.after,
      defense: damageInput.defenderDefense,
      reduction: damageInput.damageReductionMultiplier ?? 1,
    },
    power: {
      base: primaryPower?.before ?? primaryPower?.input,
      conditional: primaryPower?.after,
      effective:
        sameType?.before ??
        displayPower?.before ??
        primaryPower?.after,
      fixed: Number(fixedPower?.input) || 0,
      markFixed: Number(markFixedPower?.input) || 0,
      percentAdds,
      traitFixed: Number(traitFixedPower?.input) || 0,
    },
    skillName: result.skillName,
    total: {
      additionalDamage: Number(result.additionalDamage) || 0,
      finalMultiplier: settlementInput.finalDamageMultiplier ?? 1,
      hitCount,
      oneHitAfterFinal:
        settlementInput.oneHitAfterFinal ?? settlement?.before ?? damage?.after,
      value: result.totalDamage,
    },
  };
}
