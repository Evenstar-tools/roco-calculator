import {
  hasNamedTraitEffectRule,
  resolveTraitEffectRule,
} from "./trait-effects.js";

const TRAIT_NAME_TO_RULE = Object.freeze({
  破空: "power_if_acted_before_enemy",
  顺风: "power_if_faster",
  专注力: "physical_power_first_turn",
  偏振: "reduce_matching_skill_type",
  完全偏振: "reduce_matching_skill_type_strong",
  绝对秩序: "reduce_off_type",
  冰钻: "power_by_enemy_total_cost",
});

const ATTACKER_ONLY_RULES = new Set([
  "power_if_acted_before_enemy",
  "power_if_faster",
  "physical_power_first_turn",
  "power_multiplier",
  "power_by_enemy_marks",
  "power_by_enemy_total_cost",
]);

const DEFENDER_ONLY_RULES = new Set([
  "reduce_matching_skill_type",
  "reduce_matching_skill_type_strong",
  "reduce_off_type",
  "damage_reduction_multiplier",
]);

function normalizeTrait(trait) {
  if (typeof trait === "string") return { id: trait, name: trait };
  return trait;
}

function traitRuleId(trait) {
  return trait.ruleId ?? TRAIT_NAME_TO_RULE[trait.name] ?? null;
}

function numberOrUndefined(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function exactContribution(overrides = {}, step = undefined) {
  return {
    status: "exact",
    attackLevelBonus: 0,
    attackerDefenseLevelBonus: 0,
    attackMultiplier: 1,
    defenseLevelBonus: 0,
    defenderDefenseLevelBonus: 0,
    fixedPowerAdd: 0,
    powerPercentAdd: 0,
    powerMultiplier: 1,
    damageReductionMultiplier: 1,
    finalDamageMultiplier: 1,
    steps: step ? [step] : [],
    sources: [],
    warnings: [],
    ...overrides,
  };
}

function needsInput(input, trait) {
  return {
    status: "needs_input",
    inputs: [input],
    reason: `特性 ${trait.name ?? trait.id} 需要额外输入`,
  };
}

function unappliedTraitContribution(trait) {
  return exactContribution({
    warnings: [`未计入特性：${trait.name ?? trait.id}`],
  });
}

function resolvePowerIfFaster(trait, input) {
  const attackerSpeed = numberOrUndefined(
    input.context.attackerSpeed ?? input.attacker.panelStats?.speed,
  );
  const defenderSpeed = numberOrUndefined(
    input.context.defenderSpeed ?? input.defender.panelStats?.speed,
  );

  if (attackerSpeed === undefined || defenderSpeed === undefined) {
    return needsInput(
      { key: "speeds", label: "双方速度", type: "stat_pair" },
      trait,
    );
  }

  const multiplier =
    attackerSpeed > defenderSpeed
      ? numberOrUndefined(trait.multiplier ?? trait.ruleParams?.multiplier) ?? 1.5
      : 1;
  return exactContribution(
    { powerMultiplier: multiplier, powerPercentAdd: multiplier - 1 },
    {
      label: trait.name ?? trait.id,
      input: { attackerSpeed, defenderSpeed },
      before: 1,
      after: multiplier,
      source: "reviewed-trait:power-if-faster-v1",
    },
  );
}

function resolvePowerIfActedBeforeEnemy(trait, input) {
  const key = trait.ruleParams?.contextKey ?? "actedBeforeEnemy";
  const triggered = input.context[key] === true;
  const multiplier = triggered
    ? numberOrUndefined(trait.multiplier ?? trait.ruleParams?.multiplier) ?? 1.75
    : 1;
  return exactContribution(
    { powerMultiplier: multiplier, powerPercentAdd: multiplier - 1 },
    {
      label: trait.name ?? trait.id,
      input: triggered,
      before: 1,
      after: multiplier,
      source: "reviewed-trait:acted-before-enemy-v1",
    },
  );
}

function resolvePhysicalFirstTurn(trait, input) {
  if (input.skill.category !== "physical") return exactContribution();

  const key = trait.ruleParams?.contextKey ?? "traitActivated";
  if (typeof input.context[key] !== "boolean") {
    return needsInput(
      {
        key,
        label: trait.ruleParams?.label ?? "是否处于入场首回合",
        type: "boolean",
      },
      trait,
    );
  }

  const multiplier = input.context[key]
    ? numberOrUndefined(trait.multiplier ?? trait.ruleParams?.multiplier) ?? 2
    : 1;
  return exactContribution(
    { powerMultiplier: multiplier, powerPercentAdd: multiplier - 1 },
    {
      label: trait.name ?? trait.id,
      input: input.context[key],
      before: 1,
      after: multiplier,
      source: "reviewed-trait:physical-first-turn-v1",
    },
  );
}

function resolveMatchingSkillType(trait, input, strong = false) {
  const explicit = input.context.defenderCarriesSameType;
  const skillTypes = input.defender.skillTypes;
  let matches;

  if (typeof explicit === "boolean") {
    matches = explicit;
  } else if (Array.isArray(skillTypes)) {
    matches = skillTypes.includes(input.skill.type);
  } else {
    return needsInput(
      {
        key: "defenderCarriesSameType",
        label: `防御方是否携带${input.skill.type}系技能`,
        type: "boolean",
      },
      trait,
    );
  }

  const defaultReduction = strong ? 50 : 40;
  const reduction = Math.min(
    100,
    Math.max(
      0,
      numberOrUndefined(input.context.defenderTraitEffect) ??
        defaultReduction,
    ),
  );
  const multiplier = matches ? 1 - reduction / 100 : 1;
  return exactContribution(
    { damageReductionMultiplier: multiplier },
    {
      label: trait.name ?? trait.id,
      input: matches,
      before: 1,
      after: multiplier,
      source: strong
        ? "reviewed-trait:strong-polarization-v1"
        : "reviewed-trait:polarization-v1",
    },
  );
}

function resolveOffTypeReduction(trait, input) {
  const attackerTypes = input.attacker.types ?? [];
  const isOffType = !attackerTypes.includes(input.skill.type);
  const reduction = Math.min(
    100,
    Math.max(
      0,
      numberOrUndefined(input.context.defenderTraitEffect) ?? 50,
    ),
  );
  const multiplier = isOffType ? 1 - reduction / 100 : 1;
  return exactContribution(
    { damageReductionMultiplier: multiplier },
    {
      label: trait.name ?? trait.id,
      input: input.skill.type,
      before: 1,
      after: multiplier,
      source: "reviewed-trait:off-type-reduction-v1",
    },
  );
}

function resolveStaticMultiplier(trait, field) {
  const value = numberOrUndefined(
    trait.multiplier ?? trait.ruleParams?.multiplier,
  );
  if (value === undefined || value < 0) {
    return unappliedTraitContribution(trait);
  }
  return exactContribution(
    { [field]: value },
    {
      label: trait.name ?? trait.id,
      input: value,
      before: 1,
      after: value,
      source: trait.provenance ?? "reviewed-trait:static-multiplier-v1",
    },
  );
}

function resolveStackPower(trait, input) {
  const key = trait.ruleParams?.contextKey ?? "enemyStarfallStacks";
  const stacks = numberOrUndefined(input.context[key]);
  if (stacks === undefined) {
    return needsInput(
      { key, label: trait.ruleParams?.label ?? "敌方星陨层数", type: "number" },
      trait,
    );
  }
  const perStack = numberOrUndefined(trait.ruleParams?.perStack) ?? 0.15;
  const multiplier = 1 + Math.max(0, Math.floor(stacks)) * perStack;
  return exactContribution(
    { powerMultiplier: multiplier, powerPercentAdd: multiplier - 1 },
    {
      label: trait.name ?? trait.id,
      input: stacks,
      before: 1,
      after: multiplier,
      source: trait.provenance ?? "reviewed-trait:stack-power-v1",
    },
  );
}

function resolveEnemyTotalCostPower(trait, input) {
  const key = trait.ruleParams?.contextKey ?? "enemyTotalSkillCost";
  const totalCost = numberOrUndefined(
    input.context[key] ?? input.defender.totalSkillCost,
  );
  if (totalCost === undefined) {
    return needsInput(
      {
        key,
        label: trait.ruleParams?.label ?? "敌方四技能总能耗",
        type: "number",
      },
      trait,
    );
  }

  const perCost = numberOrUndefined(trait.ruleParams?.perCost) ?? 0.1;
  const multiplier = 1 + Math.max(0, totalCost) * perCost;
  return exactContribution(
    { powerMultiplier: multiplier, powerPercentAdd: multiplier - 1 },
    {
      label: trait.name ?? trait.id,
      input: totalCost,
      before: 1,
      after: multiplier,
      source: trait.provenance ?? "reviewed-trait:ice-drill-v1",
    },
  );
}

function resolveOneTrait(traitValue, role, input) {
  const trait = normalizeTrait(traitValue);
  const ruleId = traitRuleId(trait);
  const interactiveRule =
    !ruleId || hasNamedTraitEffectRule(trait, role)
      ? resolveTraitEffectRule(trait, role, input)
      : null;

  if (interactiveRule) {
    return exactContribution(
      {
        attackLevelBonus: interactiveRule.attackLevelBonus,
        attackerDefenseLevelBonus:
          interactiveRule.attackerDefenseLevelBonus,
        attackMultiplier: interactiveRule.attackMultiplier,
        defenseLevelBonus: interactiveRule.defenseLevelBonus,
        defenderDefenseLevelBonus:
          interactiveRule.defenderDefenseLevelBonus,
        damageReductionMultiplier:
          interactiveRule.damageReductionMultiplier,
        finalDamageMultiplier: interactiveRule.finalDamageMultiplier,
        fixedPowerAdd: interactiveRule.fixedPowerAdd,
        powerPercentAdd: interactiveRule.powerPercentAdd,
        powerMultiplier: interactiveRule.powerMultiplier,
      },
      interactiveRule.step,
    );
  }

  if (!ruleId) {
    if (trait.affectsDamage !== true) return exactContribution();
    return unappliedTraitContribution(trait);
  }

  if (
    (role === "defender" && ATTACKER_ONLY_RULES.has(ruleId)) ||
    (role === "attacker" && DEFENDER_ONLY_RULES.has(ruleId))
  ) {
    return exactContribution();
  }

  if (ruleId === "power_if_faster" && role === "attacker") {
    return resolvePowerIfFaster(trait, input);
  }
  if (
    ruleId === "power_if_acted_before_enemy" &&
    role === "attacker"
  ) {
    return resolvePowerIfActedBeforeEnemy(trait, input);
  }
  if (ruleId === "physical_power_first_turn" && role === "attacker") {
    return resolvePhysicalFirstTurn(trait, input);
  }
  if (ruleId === "reduce_matching_skill_type" && role === "defender") {
    return resolveMatchingSkillType(trait, input);
  }
  if (
    ruleId === "reduce_matching_skill_type_strong" &&
    role === "defender"
  ) {
    return resolveMatchingSkillType(trait, input, true);
  }
  if (ruleId === "reduce_off_type" && role === "defender") {
    return resolveOffTypeReduction(trait, input);
  }
  if (ruleId === "power_multiplier" && role === "attacker") {
    const resolution = resolveStaticMultiplier(trait, "powerMultiplier");
    return {
      ...resolution,
      powerPercentAdd: resolution.powerMultiplier - 1,
    };
  }
  if (ruleId === "damage_reduction_multiplier" && role === "defender") {
    return resolveStaticMultiplier(trait, "damageReductionMultiplier");
  }
  if (ruleId === "final_damage_multiplier") {
    return resolveStaticMultiplier(trait, "finalDamageMultiplier");
  }
  if (ruleId === "power_by_enemy_marks" && role === "attacker") {
    return resolveStackPower(trait, input);
  }
  if (ruleId === "power_by_enemy_total_cost" && role === "attacker") {
    return resolveEnemyTotalCostPower(trait, input);
  }

  return unappliedTraitContribution(trait);
}

export function resolveTraitMultipliers({
  attackerTraits = [],
  defenderTraits = [],
  skill,
  attacker = {},
  defender = {},
  context = {},
}) {
  if (!skill || skill.category === "status" || skill.category === "defense") {
    return {
      status: "unsupported",
      reason: "非伤害技能不解析伤害特性倍率",
    };
  }

  const input = { skill, attacker, defender, context };
  const resolutions = [
    ...attackerTraits.map((trait) =>
      resolveOneTrait(trait, "attacker", input),
    ),
    ...defenderTraits.map((trait) =>
      resolveOneTrait(trait, "defender", input),
    ),
  ];
  const unsupported = resolutions.find(
    (resolution) => resolution.status === "unsupported",
  );
  if (unsupported) return unsupported;

  const missing = resolutions.filter(
    (resolution) => resolution.status === "needs_input",
  );
  if (missing.length > 0) {
    return {
      status: "needs_input",
      inputs: missing.flatMap((resolution) => resolution.inputs),
      reason: missing.map((resolution) => resolution.reason).join("；"),
    };
  }

  return resolutions.reduce(
    (combined, resolution) => ({
      ...combined,
      attackLevelBonus:
        combined.attackLevelBonus + resolution.attackLevelBonus,
      attackerDefenseLevelBonus:
        combined.attackerDefenseLevelBonus +
        resolution.attackerDefenseLevelBonus,
      attackMultiplier:
        combined.attackMultiplier * resolution.attackMultiplier,
      defenseLevelBonus:
        combined.defenseLevelBonus + resolution.defenseLevelBonus,
      defenderDefenseLevelBonus:
        combined.defenderDefenseLevelBonus +
        resolution.defenderDefenseLevelBonus,
      fixedPowerAdd:
        combined.fixedPowerAdd + resolution.fixedPowerAdd,
      powerPercentAdd:
        combined.powerPercentAdd + resolution.powerPercentAdd,
      powerMultiplier:
        combined.powerMultiplier * resolution.powerMultiplier,
      damageReductionMultiplier:
        combined.damageReductionMultiplier *
        resolution.damageReductionMultiplier,
      finalDamageMultiplier:
        combined.finalDamageMultiplier * resolution.finalDamageMultiplier,
      steps: [...combined.steps, ...resolution.steps],
      sources: [...combined.sources, ...resolution.sources],
      warnings: [...combined.warnings, ...resolution.warnings],
    }),
    exactContribution(),
  );
}
