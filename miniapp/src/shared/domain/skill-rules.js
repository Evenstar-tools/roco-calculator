import { getSkillEffectRule } from "./skill-effects.js";
import { getSkillEffectInputs } from "./skill-effects.js";
import { projectTriggerContext } from "./trigger-controls.js";

const DIFFERENCE_POWER_TABLE = Object.freeze([
  { minimum: Number.NEGATIVE_INFINITY, maximum: 0, power: 60 },
  { minimum: 1, maximum: 30, power: 80 },
  { minimum: 31, maximum: 60, power: 100 },
  { minimum: 61, maximum: 90, power: 120 },
  { minimum: 91, maximum: 120, power: 140 },
  { minimum: 121, maximum: 150, power: 150 },
  { minimum: 151, maximum: 180, power: 160 },
  { minimum: 181, maximum: 210, power: 170 },
  { minimum: 211, maximum: 240, power: 180 },
  { minimum: 241, maximum: 270, power: 190 },
  { minimum: 271, maximum: Number.POSITIVE_INFINITY, power: 200 },
]);

const MANA_BURST_POWER = Object.freeze([
  45,
  70,
  90,
  110,
  135,
  155,
  165,
  180,
  190,
  200,
  210,
]);

function isFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function exact(value, steps = [], metadata = {}) {
  return { status: "exact", value, inputs: [], steps, ...metadata };
}

function needsInput(inputs, reason) {
  return { status: "needs_input", inputs, reason };
}

function numberInput(key, label) {
  return { key, label, type: "number" };
}

function resolveDifference(context, attackerKey, defenderKey, labels) {
  const missing = [];
  if (!isFiniteNumber(context[attackerKey])) {
    missing.push(numberInput(attackerKey, labels.attacker));
  }
  if (!isFiniteNumber(context[defenderKey])) {
    missing.push(numberInput(defenderKey, labels.defender));
  }
  if (missing.length > 0) {
    return needsInput(missing, "需要双方能力值才能确定技能威力");
  }

  const attackerValue = Number(context[attackerKey]);
  const defenderValue = Number(context[defenderKey]);
  const difference = attackerValue - defenderValue;
  const row = DIFFERENCE_POWER_TABLE.find(
    ({ minimum, maximum }) =>
      difference >= minimum && difference <= maximum,
  );

  return exact(row.power, [
    {
      label: labels.step,
      input: { attacker: attackerValue, defender: defenderValue },
      before: difference,
      after: row.power,
      source: "reviewed-rule:speed-defense-difference-v2",
    },
  ]);
}

function resolveSpeedDifference(_skill, context) {
  return resolveDifference(
    context,
    "attackerSpeed",
    "defenderSpeed",
    {
      attacker: "攻击方速度",
      defender: "防御方速度",
      step: "速度差威力",
    },
  );
}

function resolvePhysicalDefenseDifference(_skill, context) {
  return resolveDifference(
    context,
    "attackerPhysicalDefense",
    "defenderPhysicalDefense",
    {
      attacker: "攻击方物防",
      defender: "防御方物防",
      step: "物防差威力",
    },
  );
}

function adjacentDisplayedPower(context, side) {
  const overrideKey = `adjacent${side}DisplayedPowerOverride`;
  const automaticKey = `adjacent${side}DisplayedPower`;
  if (isFiniteNumber(context[overrideKey])) {
    return Number(context[overrideKey]);
  }
  if (isFiniteNumber(context[automaticKey])) {
    return Number(context[automaticKey]);
  }
  return null;
}

function resolveAdjacentDisplayedPower(skill, context, operation) {
  const left = adjacentDisplayedPower(context, "Left");
  const right = adjacentDisplayedPower(context, "Right");
  const missing = [];
  if (left === null) {
    missing.push(numberInput("adjacentLeftDisplayedPowerOverride", "左侧显示威力"));
  }
  if (right === null) {
    missing.push(numberInput("adjacentRightDisplayedPowerOverride", "右侧显示威力"));
  }
  if (missing.length > 0) {
    return needsInput(
      missing,
      "需要两侧相邻技能的当前显示威力",
    );
  }

  const value = operation === "difference"
    ? Number(skill.basePower) + Math.abs(left - right) / 4
    : (left + right) / 3;
  return exact(value, [
    {
      label: "相邻技能显示威力",
      input: {
        left: {
          name: context.adjacentLeftSkillName ?? "左侧技能",
          power: left,
        },
        right: {
          name: context.adjacentRightSkillName ?? "右侧技能",
          power: right,
        },
      },
      before: operation === "difference" ? Math.abs(left - right) : left + right,
      after: value,
      source: "reviewed-rule:adjacent-displayed-power-v1",
    },
  ]);
}

function resolveAdjacentPowerDifference(skill, context) {
  return resolveAdjacentDisplayedPower(skill, context, "difference");
}

function resolveAdjacentPowerAverage(skill, context) {
  return resolveAdjacentDisplayedPower(skill, context, "average");
}

function resolveEnemyTotalSkillCostPower(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "enemyTotalSkillCost";
  if (!isFiniteNumber(context[contextKey])) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "敌方四技能总能耗")],
      "需要敌方四技能总能耗",
    );
  }

  const totalCost = Math.max(0, Number(context[contextKey]));
  const value = Math.round(totalCost * Number(params.multiplier ?? 10));
  return exact(value, [
    {
      label: params.label ?? "敌方四技能总能耗",
      input: totalCost,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:enemy-total-skill-cost-power-v1",
    },
  ]);
}

function resolveManaBurst(_skill, context) {
  const energy = Math.min(
    10,
    Math.max(
      0,
      Math.floor(isFiniteNumber(context.energy) ? Number(context.energy) : 10),
    ),
  );
  return exact(MANA_BURST_POWER[energy], [
    {
      label: "能量威力",
      input: energy,
      before: energy,
      after: MANA_BURST_POWER[energy],
      source: "reviewed-rule:mana-burst-v1",
    },
  ]);
}

function resolveTierPower(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "powerTier";
  const selectedTier = context[contextKey] ?? params.defaultValue;
  const tier = (params.tiers ?? []).find(
    (candidate) => candidate.label === selectedTier,
  );
  if (!tier) {
    return needsInput(
      [{
        key: contextKey,
        label: params.label ?? "威力挡位",
        options: (params.tiers ?? []).map(({ label }) => ({
          label,
          value: label,
        })),
        type: "choice",
      }],
      "需要选择威力挡位",
    );
  }
  return exact(Number(tier.power), [
    {
      after: Number(tier.power),
      before: skill.basePower,
      input: selectedTier,
      label: params.label ?? "威力挡位",
      source: "reviewed-rule:tier-power-v1",
    },
  ]);
}

function resolveCounterMultiplier(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "counterTriggered";
  const triggered = context[contextKey] === true;
  const basePower = Number(skill.basePower);
  const multiplier = Number(params.multiplier ?? 1);
  const value = Math.round(
    basePower * (triggered ? multiplier : 1),
  );
  return exact(value, [
    {
      label: "应对倍率",
      input: triggered,
      before: basePower,
      after: value,
      source: "reviewed-rule:counter-multiplier-v1",
    },
  ], {
    ignoreResistance:
      triggered && params.ignoreResistanceWhenTriggered === true,
  });
}

function resolveCounterPowerAndBurn(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "counterTriggered";
  const triggered = context[contextKey] === true;
  const basePower = Number(skill.basePower);
  const baseBurnStacks = Number(params.baseBurnStacks ?? 0);
  const multiplier = triggered ? Number(params.multiplier ?? 1) : 1;
  const value = Math.round(basePower * multiplier);
  const appliedBurnStacks = Math.round(baseBurnStacks * multiplier);

  return exact(value, [
    {
      label: triggered
        ? `应对：威力 ×${multiplier}，灼烧 ${baseBurnStacks}→${appliedBurnStacks}层`
        : `未触发应对：灼烧 ${baseBurnStacks}层`,
      input: triggered,
      before: basePower,
      after: value,
      source: "reviewed-rule:blazing-wave-v1",
    },
  ], {
    appliedBurnStacks,
  });
}

function resolveHpScaled(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "currentHpPercent";
  const rawHpPercent = isFiniteNumber(context[contextKey])
    ? context[contextKey]
    : params.defaultValue;
  if (!isFiniteNumber(rawHpPercent)) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "当前生命百分比")],
      "需要当前生命百分比",
    );
  }

  const hpPercent = Math.min(
    100,
    Math.max(0, Number(rawHpPercent)),
  );
  const interval = Number(params.interval ?? 5);
  const changePerInterval = Number(params.changePerInterval ?? 5);
  const lostIntervals = Math.floor((100 - hpPercent) / interval);
  const direction = params.direction === "decrease" ? -1 : 1;
  const value = Math.max(
    0,
    Math.round(Number(skill.basePower) + direction * lostIntervals * changePerInterval),
  );

  return exact(value, [
    {
      label: "生命比例威力",
      input: hpPercent,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:hp-scaled-v1",
    },
  ]);
}

function resolvePositionPowerAdd(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "skillPosition";
  if (!isFiniteNumber(context[contextKey])) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "技能位置")],
      "需要技能位置才能确定技能威力",
    );
  }
  const position = Math.floor(Number(context[contextKey]));
  const triggered = (params.positions ?? []).includes(position);
  const value = Math.max(
    0,
    Math.round(Number(skill.basePower) + (triggered ? Number(params.add) : 0)),
  );
  return exact(value, [
    {
      label: "技能位置加成",
      input: position,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:position-power-add-v1",
    },
  ]);
}

function resolveBooleanPowerAdd(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionTriggered";
  const triggered = context[contextKey] === true;
  const sproutFixedPower =
    triggered && params.sproutFixedUnit === true
      ? Math.min(99, Math.max(0, Math.floor(Number(context.sproutStacks) || 0))) * 10
      : 0;
  const value = Math.max(
    0,
    Math.round(
      Number(skill.basePower) +
        (triggered ? Number(params.add) : 0) +
        sproutFixedPower,
    ),
  );
  return exact(value, [
    {
      label: params.label ?? "条件威力加成",
      input: triggered,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:boolean-power-add-v1",
    },
  ], {
    ignoreResistance:
      triggered && params.ignoreResistanceWhenTriggered === true,
  });
}

function resolveBooleanPowerMultiplier(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionTriggered";
  const triggered = context[contextKey] === true;
  const rawValue =
    Number(skill.basePower) * (triggered ? Number(params.multiplier) : 1);
  const value =
    params.rounding === "floor" ? Math.floor(rawValue) : Math.round(rawValue);
  return exact(value, [
    {
      label: params.label ?? "条件威力倍率",
      input: triggered,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:boolean-power-multiplier-v1",
    },
  ]);
}

function resolveBooleanPowerPercentAdd(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionTriggered";
  const triggered = context[contextKey] === true;
  const add = triggered ? Math.max(0, Number(params.add) || 0) : 0;
  const basePower = Number(skill.basePower);
  return exact(
    basePower,
    [
      {
        label: params.label ?? "条件威力加成",
        input: triggered,
        before: basePower,
        after: basePower * (1 + add),
        source: "reviewed-rule:boolean-power-percent-add-v1",
      },
    ],
    { powerPercentAdds: add === 0 ? [] : [add] },
  );
}

function resolveBooleanDamageMultiplier(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionTriggered";
  const triggered = context[contextKey] === true;
  const multiplier = triggered
    ? Math.max(0, Number(params.multiplier) || 1)
    : 1;
  return exact(
    Number(skill.basePower),
    [
      {
        label: params.label ?? "条件伤害倍率",
        input: triggered,
        before: 1,
        after: multiplier,
        source: "reviewed-rule:boolean-damage-multiplier-v1",
      },
    ],
    { finalDamageMultiplier: multiplier },
  );
}

function resolveEnemySkillPowerMultiplier(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "enemySkillPower";
  if (!isFiniteNumber(context[contextKey])) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "敌方技能威力")],
      "需要敌方技能威力",
    );
  }
  const enemyPower = Math.max(0, Number(context[contextKey]));
  const value = Math.round(enemyPower * Number(params.multiplier ?? 1));
  return exact(value, [
    {
      label: "敌方技能威力倍率",
      input: enemyPower,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:enemy-skill-power-multiplier-v1",
    },
  ]);
}

function resolveEnergyPercentageDecrease(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "enemyEnergy";
  if (!isFiniteNumber(context[contextKey])) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "敌方能量")],
      "需要敌方能量",
    );
  }
  const energy = Math.max(0, Number(context[contextKey]));
  const multiplier = Math.max(
    0,
    1 - energy * Number(params.percentPerEnergy ?? 0),
  );
  const value = Math.round(Number(skill.basePower) * multiplier);
  return exact(value, [
    {
      label: "敌方能量威力衰减",
      input: energy,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:energy-percentage-decrease-v1",
    },
  ]);
}

function resolveStackPlusCounterAdd(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "stackCount";
  if (!isFiniteNumber(context[contextKey])) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "层数")],
      "需要层数上下文",
    );
  }
  const stackCount = Math.max(0, Math.floor(Number(context[contextKey])));
  const counterTriggered = context[params.counterKey ?? "counterTriggered"] === true;
  const perStack = Number(
    counterTriggered ? params.counterPerStack : params.perStack,
  );
  const value = Math.max(
    0,
    Math.round(
      Number(skill.basePower) + stackCount * perStack,
    ),
  );
  return exact(value, [
    {
      label: "叠层与应对加成",
      input: { counterTriggered, stackCount },
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:stack-plus-counter-add-v1",
    },
  ]);
}

function resolveCostScaled(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "actualSkillCost";
  const actualCost = isFiniteNumber(context[contextKey])
    ? Math.max(0, Number(context[contextKey]))
    : Math.max(0, Number(skill.cost) || 0);
  const baseCost = Math.max(0, Number(skill.cost) || 0);
  const difference =
    params.direction === "decrease"
      ? baseCost - actualCost
      : actualCost - baseCost;
  const value = Math.max(
    0,
    Math.round(
      Number(skill.basePower) +
        Math.max(0, difference) * Number(params.perCost ?? 0),
    ),
  );
  return exact(value, [
    {
      label: "实际能耗威力",
      input: actualCost,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:cost-scaled-v1",
    },
  ]);
}

function resolveHitCountScaled(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "stackCount";
  const rawStackCount = isFiniteNumber(context[contextKey])
    ? context[contextKey]
    : params.defaultValue;
  if (!isFiniteNumber(rawStackCount)) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "次数")],
      "需要连击变化条件",
    );
  }
  const stackCount = Math.max(0, Math.floor(Number(rawStackCount)));
  const hitCount = Math.max(
    1,
    Math.floor(
      Number(params.baseHitCount ?? 1) +
        stackCount * Number(params.perStack ?? 1),
    ),
  );
  return exact(Number(skill.basePower), [
    {
      label: "条件连击数",
      input: stackCount,
      before: params.baseHitCount ?? 1,
      after: hitCount,
      source: "reviewed-rule:hit-count-scaled-v1",
    },
  ], { hitCount });
}

function resolveSwarmDonations(skill, context) {
  const powerCount = Math.max(
    0,
    Math.floor(Number(context.donationPowerCount) || 0),
  );
  const hitCount = Math.max(
    1,
    1 + Math.floor(Number(context.donationHitBonus) || 0),
  );
  const donationPoisonStacks = Math.max(
    0,
    Math.floor(Number(context.donationPoisonCount) || 0),
  );
  const value = Math.max(0, Number(skill.basePower) + powerCount * 20);
  return exact(value, [
    {
      label: "威力奉献",
      input: powerCount,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:swarm-donations-v1",
    },
  ], {
    donationPoisonStacks,
    hitCount,
  });
}

function resolveEnergyScaled(skill, context) {
  const key = skill.ruleParams?.contextKey ?? "energy";
  if (!isFiniteNumber(context[key])) {
    return needsInput(
      [numberInput(key, skill.ruleParams?.label ?? "能量")],
      "需要能量上下文",
    );
  }

  const energy = Math.max(0, Number(context[key]));
  const perEnergy = Number(skill.ruleParams?.perEnergy ?? 0);
  const multiplierPerEnergy = Number(
    skill.ruleParams?.multiplierPerEnergy ?? 0,
  );
  const value = Math.max(
    0,
    Math.round(
      (Number(skill.basePower) + energy * perEnergy) *
        (1 + energy * multiplierPerEnergy),
    ),
  );
  return exact(value, [
    {
      label: "能量缩放威力",
      input: energy,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:energy-scaled-v1",
    },
  ]);
}

function resolveStackScaled(skill, context) {
  const conditionKey = skill.ruleParams?.conditionKey;
  const triggered = conditionKey ? context[conditionKey] === true : true;
  const key = skill.ruleParams?.contextKey ?? "stackCount";
  const legacyBooleanKey = skill.ruleParams?.legacyBooleanContextKey;
  const currentStackCount = isFiniteNumber(context[key])
    ? Number(context[key])
    : skill.ruleParams?.defaultValue;
  const rawStackCount = legacyBooleanKey && context[legacyBooleanKey] === true
    ? Math.max(1, Number(currentStackCount) || 0)
    : currentStackCount;
  if (!isFiniteNumber(rawStackCount)) {
    return needsInput(
      [numberInput(key, skill.ruleParams?.label ?? "层数")],
      "需要层数上下文",
    );
  }

  const stackCount = triggered
    ? Math.max(0, Math.floor(Number(rawStackCount)))
    : 0;
  const perStack = Number(skill.ruleParams?.perStack ?? 0);
  const flatBonusKey = skill.ruleParams?.flatBonusContextKey;
  const flatBonus = flatBonusKey
    ? Math.max(0, Number(context[flatBonusKey]) || 0)
    : 0;
  const value = Math.max(
    0,
    Math.round(Number(skill.basePower) + stackCount * perStack + flatBonus),
  );
  return exact(value, [
    {
      label: conditionKey ? "迸发种类威力加成" : "层数缩放威力",
      input: conditionKey ? { stackCount, triggered } : stackCount,
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:stack-scaled-v1",
    },
  ]);
}

function resolveThunderstormBurst(skill, context) {
  const params = skill.ruleParams ?? {};
  const triggered = context[params.conditionKey ?? "burstTriggered"] === true;
  const selectedSources = (params.sourceContextKeys ?? []).filter(
    (contextKey) => context[contextKey] === true,
  );
  const manualKinds = isFiniteNumber(context[params.contextKey ?? "activeBurstKinds"])
    ? Math.max(0, Math.floor(Number(context[params.contextKey ?? "activeBurstKinds"])))
    : Number(params.defaultValue ?? 0);
  const burstKinds = triggered
    ? Math.max(manualKinds, selectedSources.length)
    : 0;
  const inheritedCostReduction = triggered
    ? (params.inheritedCostReductions ?? []).reduce(
        (total, { contextKey, reduction }) =>
          context[contextKey] === true
            ? total + Math.max(0, Number(reduction) || 0)
            : total,
        0,
      )
    : 0;
  const inheritedFixedPowerAdd = triggered
    ? (params.inheritedFixedPowerAdds ?? []).reduce(
        (total, { add, contextKey }) =>
          context[contextKey] === true
            ? total + Math.max(0, Number(add) || 0)
            : total,
        0,
      )
    : 0;
  const value = Math.max(
    0,
    Math.round(
      Number(skill.basePower) + burstKinds * Number(params.perStack ?? 10),
    ),
  );
  const baseCost = Math.max(0, Number(skill.cost) || 0);
  const costAfterBurstKinds = baseCost + burstKinds;
  const resolvedCost = Math.max(
    0,
    costAfterBurstKinds - inheritedCostReduction,
  );
  return exact(value, [
    {
      label: "迸发种类威力加成",
      input: {
        burstKinds,
        selectedSources,
        triggered,
      },
      before: skill.basePower,
      after: value,
      source: "reviewed-rule:thunderstorm-burst-v4",
    },
    {
      label: "迸发种类能耗增加",
      input: burstKinds,
      before: baseCost,
      after: costAfterBurstKinds,
      source: "reviewed-rule:thunderstorm-burst-v4",
    },
    ...(inheritedCostReduction > 0
      ? [{
          label: "继承迸发能耗降低",
          input: inheritedCostReduction,
          before: costAfterBurstKinds,
          after: resolvedCost,
          source: "reviewed-rule:thunderstorm-burst-v4",
        }]
      : []),
  ], {
    activeBurstKinds: burstKinds,
    inheritedCostReduction,
    inheritedFixedPowerAdd,
    resolvedCost,
    selectedBurstSources: selectedSources,
  });
}

function resolveBurstCostReduction(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "burstTriggered";
  const triggered = context[contextKey] === true;
  const baseCost = Math.max(0, Number(skill.cost) || 0);
  const resolvedCost = Math.max(
    0,
    baseCost - (triggered ? Math.max(0, Number(params.reduction) || 0) : 0),
  );
  return exact(Number(skill.basePower), [
    {
      label: params.label ?? "条件能耗",
      input: triggered,
      before: baseCost,
      after: resolvedCost,
      source: "reviewed-rule:burst-cost-reduction-v1",
    },
  ], { resolvedCost });
}

function compareThreshold(value, threshold, operator) {
  switch (operator) {
    case "eq":
      return value === threshold;
    case "gte":
      return value >= threshold;
    case "gt":
      return value > threshold;
    case "lt":
      return value < threshold;
    default:
      return value <= threshold;
  }
}

function resolveThresholdPowerMultiplier(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionValue";
  const rawValue = isFiniteNumber(context[contextKey])
    ? context[contextKey]
    : params.defaultValue;
  if (!isFiniteNumber(rawValue)) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "条件数值")],
      "需要条件数值才能确定技能威力",
    );
  }
  const conditionValue = Number(rawValue);
  const triggered = compareThreshold(
    conditionValue,
    Number(params.threshold ?? 0),
    params.operator,
  );
  const basePower = Number(skill.basePower);
  const value = Math.round(
    basePower * (triggered ? Number(params.multiplier ?? 1) : 1),
  );
  return exact(value, [
    {
      label: params.label ?? "阈值威力倍率",
      input: conditionValue,
      before: basePower,
      after: value,
      source: "reviewed-rule:threshold-power-multiplier-v1",
    },
  ]);
}

function resolveExponentialScaled(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "growthCount";
  const rawCount = isFiniteNumber(context[contextKey])
    ? context[contextKey]
    : params.defaultValue;
  if (!isFiniteNumber(rawCount)) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "累计次数")],
      "需要累计次数才能确定技能威力",
    );
  }
  const count = Math.max(0, Math.floor(Number(rawCount)));
  const basePower = Number(skill.basePower);
  const value = Math.round(
    basePower * Number(params.multiplier ?? 2) ** count,
  );
  return exact(value, [
    {
      label: params.label ?? "累计倍率",
      input: count,
      before: basePower,
      after: value,
      source: "reviewed-rule:exponential-scaled-v1",
    },
  ]);
}

function resolveBooleanHitCount(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionTriggered";
  const triggered = context[contextKey] === true;
  const baseHitCount = Math.max(1, Number(params.baseHitCount ?? 1));
  const hitCount = Math.max(
    1,
    Math.floor(
      triggered
        ? Number(
            params.triggeredHitCount ??
              baseHitCount * Number(params.multiplier ?? 1) +
                Number(params.add ?? 0),
          )
        : baseHitCount,
    ),
  );
  return exact(Number(skill.basePower), [
    {
      label: params.label ?? "条件连击数",
      input: triggered,
      before: baseHitCount,
      after: hitCount,
      source: "reviewed-rule:boolean-hit-count-v1",
    },
  ], { hitCount });
}

function resolveThresholdHitCount(skill, context) {
  const params = skill.ruleParams ?? {};
  const contextKey = params.contextKey ?? "conditionValue";
  const rawValue = isFiniteNumber(context[contextKey])
    ? context[contextKey]
    : params.defaultValue;
  if (!isFiniteNumber(rawValue)) {
    return needsInput(
      [numberInput(contextKey, params.label ?? "条件数值")],
      "需要条件数值才能确定连击数",
    );
  }
  const conditionValue = Number(rawValue);
  const triggered = compareThreshold(
    conditionValue,
    Number(params.threshold ?? 0),
    params.operator,
  );
  const baseHitCount = Math.max(1, Number(params.baseHitCount ?? 1));
  const hitCount = Math.max(
    1,
    Math.floor(triggered ? Number(params.triggeredHitCount) : baseHitCount),
  );
  return exact(Number(skill.basePower), [
    {
      label: params.label ?? "阈值连击数",
      input: conditionValue,
      before: baseHitCount,
      after: hitCount,
      source: "reviewed-rule:threshold-hit-count-v1",
    },
  ], { hitCount });
}

function selectedChoice(skill, context) {
  const params = skill.ruleParams ?? {};
  return context[params.choiceKey] ?? params.defaultChoice;
}

function reviewedStep(label, input, before, after, source) {
  return {
    after,
    before,
    input,
    label,
    source: `reviewed-rule:${source}`,
  };
}

function resolveFriendshipChoice(skill, context) {
  const originalPower = Number(skill.basePower);
  const useCount = Math.max(
    0,
    Math.floor(Number(context.skillUseCount ?? 0)),
  );
  const basePower = originalPower + useCount * 20;
  const choice = selectedChoice(skill, context);
  if (choice === "counter") {
    const triggered = context.counterTriggered === true;
    const value = triggered ? basePower * 2 : basePower;
    return exact(value, [
      reviewedStep(
        "应对威力翻倍",
        triggered,
        basePower,
        value,
        "friendship-choice-v1",
      ),
    ]);
  }

  return exact(basePower, [
    reviewedStep(
      "永久威力成长",
      useCount,
      originalPower,
      basePower,
      "friendship-choice-v1",
    ),
  ]);
}

function resolveFlowerChoice(skill, context) {
  const basePower = Number(skill.basePower);
  const choice = selectedChoice(skill, context);
  if (choice === "heal") {
    return exact(basePower, [
      reviewedStep(
        "应对回血分支（伤害不变）",
        context.counterTriggered === true,
        basePower,
        basePower,
        "flower-choice-v1",
      ),
    ]);
  }

  const hpPercent = Number(context.attackerHpPercent ?? 100);
  const value = hpPercent > 80 ? basePower + 50 : basePower;
  return exact(value, [
    reviewedStep(
      "生命高于 80%",
      hpPercent,
      basePower,
      value,
      "flower-choice-v1",
    ),
  ]);
}

function resolveShiftChoice(skill, context) {
  const basePower = Number(skill.basePower);
  const choice = selectedChoice(skill, context);
  if (choice === "drive") {
    return exact(basePower, [
      reviewedStep(
        "额外传动分支（伤害不变）",
        choice,
        basePower,
        basePower,
        "shift-choice-v1",
      ),
    ]);
  }
  if (!isFiniteNumber(context.skillPosition)) {
    return needsInput(
      [numberInput("skillPosition", "技能位置")],
      "需要技能位置才能确定技能威力",
    );
  }
  const position = Number(context.skillPosition);
  const value = position === 1 ? basePower + 65 : basePower;
  return exact(value, [
    reviewedStep(
      "1号位威力加成",
      position,
      basePower,
      value,
      "shift-choice-v1",
    ),
  ]);
}

function resolveDriveOutChoice(skill, context) {
  const basePower = Number(skill.basePower);
  const choice = selectedChoice(skill, context);
  const triggered = context.counterTriggered === true;
  const add = choice === "steady" ? 20 : triggered ? 140 : 0;
  const value = basePower + add;
  return exact(value, [
    reviewedStep(
      choice === "steady" ? "稳定威力加成" : "应对威力加成",
      choice === "steady" ? choice : triggered,
      basePower,
      value,
      "drive-out-choice-v1",
    ),
  ]);
}

function resolveTestFlightChoice(skill, context) {
  const basePower = Number(skill.basePower);
  const choice = selectedChoice(skill, context);
  const useCount = Math.max(
    0,
    Math.floor(Number(context.skillUseCount ?? 0)),
  );
  const hitCount = choice === "hits" ? 2 + useCount : 2;
  const value = choice === "power" ? basePower + useCount * 10 : basePower;
  return exact(
    value,
    [
      reviewedStep(
        choice === "power" ? "永久威力成长" : "永久连击成长",
        useCount,
        choice === "power" ? basePower : 2,
        choice === "power" ? value : hitCount,
        choice === "power"
          ? "test-flight-power-v1"
          : "test-flight-hit-count-v1",
      ),
    ],
    { hitCount },
  );
}

function resolveCalamityTarget(skill, context) {
  if (context.counterTriggered !== true) {
    return needsInput(
      [{ key: "counterTriggered", label: "触发应对", type: "boolean" }],
      "默认对自身造成伤害，开启应对后计算对敌伤害",
    );
  }
  const basePower = Number(skill.basePower);
  const value = basePower + 120;
  return exact(
    value,
    [
      reviewedStep(
        "应对后改为攻击敌方",
        true,
        basePower,
        value,
        "calamity-target-v1",
      ),
    ],
    { target: "enemy" },
  );
}

function resolveBetChoice(skill, context) {
  const basePower = Number(skill.basePower);
  const choice = selectedChoice(skill, context);
  if (choice === "fixed") {
    const value = basePower + 40;
    return exact(value, [
      reviewedStep(
        "固定威力加成",
        choice,
        basePower,
        value,
        "bet-choice-v1",
      ),
    ]);
  }

  const hpPercent = Number(context.attackerHpPercent ?? 100);
  const value = hpPercent < 50 ? basePower + 100 : basePower;
  return exact(value, [
    reviewedStep(
      "生命低于 50%",
      hpPercent,
      basePower,
      value,
      "bet-choice-v1",
    ),
  ]);
}

const RULES = new Map([
  ["adjacent_power_difference", resolveAdjacentPowerDifference],
  ["adjacent_power_average", resolveAdjacentPowerAverage],
  ["speed_difference", resolveSpeedDifference],
  ["physical_defense_difference", resolvePhysicalDefenseDifference],
  ["enemy_total_skill_cost_power", resolveEnemyTotalSkillCostPower],
  ["mana_burst", resolveManaBurst],
  ["tier_power", resolveTierPower],
  ["counter_multiplier", resolveCounterMultiplier],
  ["counter_power_and_burn", resolveCounterPowerAndBurn],
  ["hp_scaled", resolveHpScaled],
  ["energy_scaled", resolveEnergyScaled],
  ["stack_scaled", resolveStackScaled],
  ["thunderstorm_burst", resolveThunderstormBurst],
  ["burst_cost_reduction", resolveBurstCostReduction],
  ["position_power_add", resolvePositionPowerAdd],
  ["boolean_power_add", resolveBooleanPowerAdd],
  ["boolean_power_multiplier", resolveBooleanPowerMultiplier],
  ["boolean_power_percent_add", resolveBooleanPowerPercentAdd],
  ["boolean_damage_multiplier", resolveBooleanDamageMultiplier],
  ["enemy_skill_power_multiplier", resolveEnemySkillPowerMultiplier],
  ["energy_percentage_decrease", resolveEnergyPercentageDecrease],
  ["stack_plus_counter_add", resolveStackPlusCounterAdd],
  ["cost_scaled", resolveCostScaled],
  ["hit_count_scaled", resolveHitCountScaled],
  ["swarm_donations", resolveSwarmDonations],
  ["threshold_power_multiplier", resolveThresholdPowerMultiplier],
  ["exponential_scaled", resolveExponentialScaled],
  ["boolean_hit_count", resolveBooleanHitCount],
  ["threshold_hit_count", resolveThresholdHitCount],
  ["friendship_choice", resolveFriendshipChoice],
  ["flower_choice", resolveFlowerChoice],
  ["shift_choice", resolveShiftChoice],
  ["drive_out_choice", resolveDriveOutChoice],
  ["test_flight_choice", resolveTestFlightChoice],
  ["calamity_target", resolveCalamityTarget],
  ["bet_choice", resolveBetChoice],
]);

const ABSOLUTE_POWER_RULES = new Set([
  "adjacent_power_difference",
  "adjacent_power_average",
  "speed_difference",
  "physical_defense_difference",
  "enemy_total_skill_cost_power",
  "mana_burst",
  "tier_power",
  "enemy_skill_power_multiplier",
]);

export function usesAbsolutePowerRule(skill) {
  const effectRule = getSkillEffectRule(skill);
  return ABSOLUTE_POWER_RULES.has(effectRule?.ruleId);
}

export function resolveSkillPower(skill, context = {}) {
  context = projectTriggerContext(context, getSkillEffectInputs(skill));
  if (!skill || skill.category === "status" || skill.category === "defense") {
    return {
      status: "unsupported",
      reason: "该技能不造成直接伤害",
      source: skill?.provenance,
    };
  }

  const effectRule = getSkillEffectRule(skill);
  const hasManualPower = isFiniteNumber(context.basePowerOverride);
  const manualPower = hasManualPower
    ? Math.max(0, Number(context.basePowerOverride))
    : null;
  const composesWithManualPower =
    effectRule &&
    RULES.has(effectRule.ruleId) &&
    !ABSOLUTE_POWER_RULES.has(effectRule.ruleId);
  if (
    hasManualPower &&
    !composesWithManualPower
  ) {
    return exact(manualPower, [
      {
        label: "手动覆盖基础威力",
        input: context.basePowerOverride,
        before: skill.basePower,
        after: manualPower,
        source: "manual-override",
      },
    ]);
  }

  if (!effectRule) {
    if (!isFiniteNumber(skill.basePower)) {
      return needsInput(
        [numberInput("basePowerOverride", "静态威力")],
        "技能缺少已验证的基础威力",
      );
    }
    return exact(Number(skill.basePower));
  }

  const resolver = RULES.get(effectRule.ruleId);
  if (!resolver) {
    return {
      status: "unsupported",
      reason: `规则 ${effectRule.ruleId} 尚未验证`,
      source: skill.provenance,
    };
  }

  const resolution = resolver(
    {
      ...skill,
      ...(hasManualPower ? { basePower: manualPower } : {}),
      ruleId: effectRule.ruleId,
      ruleParams: effectRule.ruleParams,
    },
    context,
  );
  const sourcedResolution = {
    ...resolution,
    ruleSource: effectRule.source,
  };
  if (!hasManualPower || sourcedResolution.status !== "exact") {
    return sourcedResolution;
  }
  return {
    ...sourcedResolution,
    steps: [
      {
        label: "手动覆盖基础威力",
        input: context.basePowerOverride,
        before: skill.basePower,
        after: manualPower,
        source: "manual-override",
      },
      ...sourcedResolution.steps,
    ],
  };
}
