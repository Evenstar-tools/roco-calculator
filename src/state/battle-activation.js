import {
  clampStage,
  getSkill,
  getSpirit,
  getTraitView,
} from "../domain/calculator-view-model.js";
import {
  buildChoiceSkillSequence,
  hasPersistentSkillProgression,
  isChoiceSkill,
  supportsChoiceTrait,
} from "../domain/choice-skill-sequence.js";
import {
  copyPositiveAbilityStages,
  hasFairPigeonBalance,
} from "../domain/fair-pigeon.js";
import { getNatureMultipliers } from "../domain/natures.js";
import { resolveSkillStatusActivation } from "../domain/skill-status-effects.js";
import { calculateAllPanelStats } from "../domain/stat.js";

function clone(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function sideDirection(side) {
  return side === "attacker" ? "forward" : "reverse";
}

function oppositeDirection(direction) {
  return direction === "forward" ? "reverse" : "forward";
}

function oppositeSide(side) {
  return side === "attacker" ? "defender" : "attacker";
}

function skillContext(entry) {
  return entry && typeof entry === "object" ? entry.context ?? {} : {};
}

function carriedSkills(state, snapshot, side) {
  return state.sides[side].skills.four
    .map((entry) => getSkill(snapshot, entry))
    .filter(Boolean);
}

function updateDirection(state, direction, value) {
  const current = state.directions[direction];
  state.directions[direction] = {
    ...current,
    ...value,
    context: value.context
      ? { ...(current.context ?? {}), ...value.context }
      : current.context,
    overrides: value.overrides
      ? { ...(current.overrides ?? {}), ...value.overrides }
      : current.overrides,
  };
}

function updateSkillContext(state, side, index, context) {
  const current = state.sides[side].skills.four[index];
  state.sides[side].skills.four[index] = {
    ...(current && typeof current === "object" ? current : { skillId: current }),
    context,
  };
}

function addBySlot(state, snapshot, side, current, predicate, amount) {
  const next = { ...(current ?? {}) };
  for (const [index, entry] of state.sides[side].skills.four.entries()) {
    const skill = getSkill(snapshot, entry);
    if (!skill || skill.category === "status" || skill.category === "defense") {
      continue;
    }
    if (!predicate(skill, index)) continue;
    const slot = String(index + 1);
    next[slot] = Number(next[slot] ?? 0) + amount;
  }
  return next;
}

function addFixedPowerToFirstAttackOfEachType(
  state,
  snapshot,
  side,
  current,
  amount,
) {
  const seen = new Set();
  return addBySlot(
    state,
    snapshot,
    side,
    current,
    (skill) => {
      if (seen.has(skill.type)) return false;
      seen.add(skill.type);
      return true;
    },
    amount,
  );
}

function abilityStagesForSide(state, side) {
  return side === "attacker"
    ? {
        attack: state.directions.forward.overrides?.attackLevelStage ?? 0,
        defense: state.directions.reverse.overrides?.defenseLevelStage ?? 0,
      }
    : {
        attack: state.directions.reverse.overrides?.attackLevelStage ?? 0,
        defense: state.directions.forward.overrides?.defenseLevelStage ?? 0,
      };
}

function setAbilityStagesForSide(state, side, stages) {
  const attackDirection = sideDirection(side);
  const defenseDirection = oppositeDirection(attackDirection);
  updateDirection(state, attackDirection, {
    overrides: { attackLevelStage: clampStage(stages.attack) },
  });
  updateDirection(state, defenseDirection, {
    overrides: { defenseLevelStage: clampStage(stages.defense) },
  });
}

function balanceIsTriggered(state, snapshot, side) {
  const spirit = getSpirit(snapshot, state.sides[side]);
  const inputId = getTraitView(snapshot, spirit, "attacker")?.inputs?.find(
    (input) => input.contextKey === "balanceTriggered",
  )?.id;
  if (!inputId) return false;
  return state.directions[sideDirection(side)].context?.[inputId] === true;
}

function panelStatsForSide(state, snapshot, side) {
  const configuration = state.sides[side];
  const spirit = getSpirit(snapshot, configuration);
  return calculateAllPanelStats({
    raceStats: spirit.raceStats,
    displayIvs: configuration.displayIvs,
    natureMultipliers: getNatureMultipliers(configuration.nature),
  });
}

function positiveMarkStacks(state, side) {
  const mark = state.marks?.[side]?.positive;
  return mark?.id === "sprout"
    ? Math.min(99, Math.max(0, Math.floor(Number(mark.stacks) || 0)))
    : 0;
}

function applyMark(state, side, application) {
  const current = state.marks?.[side]?.[application.polarity];
  state.marks = state.marks ?? {};
  state.marks[side] = state.marks[side] ?? {};
  state.marks[side][application.polarity] = {
    id: application.id,
    stacks: Math.min(
      99,
      (current?.id === application.id ? Number(current.stacks) || 0 : 0) +
        Number(application.stacks || 0),
    ),
  };
}

export function canApplyBattleActivation(skill, context = {}) {
  return Boolean(
    resolveSkillStatusActivation(skill, context) ||
      isChoiceSkill(skill) ||
      hasPersistentSkillProgression(skill),
  );
}

export function applyBalanceTraitTrigger({ side, state }) {
  const next = clone(state);
  const copied = copyPositiveAbilityStages(
    abilityStagesForSide(next, oppositeSide(side)),
    abilityStagesForSide(next, side),
  );
  setAbilityStagesForSide(next, side, copied);
  return next;
}

export function applyBattleActivation({
  calculation,
  side,
  skillIndex,
  snapshot,
  state,
}) {
  const next = clone(state);
  const selfDirection = sideDirection(side);
  const targetDirection = oppositeDirection(selfDirection);
  const targetSide = oppositeSide(side);
  const entry = next.sides[side].skills.four[skillIndex];
  const skill = getSkill(snapshot, entry);
  if (!skill) {
    return { applied: false, reason: "请先选择技能", state };
  }
  const previousReduction = Number(
    next.directions[targetDirection]?.reduction ?? 1,
  );
  const stateChanged = previousReduction !== 1;
  updateDirection(next, targetDirection, { reduction: 1 });

  const context = skillContext(entry);
  const spirit = getSpirit(snapshot, next.sides[side]);
  const traitName = getTraitView(snapshot, spirit, "attacker")?.name;
  const choiceTrait = context.choiceTraitTriggered === true &&
      supportsChoiceTrait(traitName)
    ? traitName
    : null;
  const panelStats = panelStatsForSide(next, snapshot, side);
  const healthDirection = next.directions[targetDirection];
  const storedHpPercent = Number(healthDirection.context?.currentHpPercent);
  const attackerHpPercent = Number.isFinite(storedHpPercent)
    ? storedHpPercent
    : ((healthDirection.currentHp ?? panelStats.hp) / Math.max(1, panelStats.hp)) *
      100;
  const sproutStacks = positiveMarkStacks(next, side);
  const resolution = resolveSkillStatusActivation(skill, {
    ...context,
    attackerHpPercent,
    carriedSkills: carriedSkills(next, snapshot, side),
    choiceTrait,
    effectiveHitCount:
      calculation?.[selfDirection]?.results?.[skillIndex]?.hitCount,
    sproutStacks,
  });

  const sequence = buildChoiceSkillSequence({
    context,
    skill,
    sproutStacks,
    traitName,
  });

  if (!resolution) {
    if (!isChoiceSkill(skill) && !hasPersistentSkillProgression(skill)) {
      return {
        applied: false,
        reason: "该技能没有可应用的状态",
        state: next,
        stateChanged,
      };
    }
    updateSkillContext(next, side, skillIndex, sequence.nextContext);
    return { applied: true, reason: null, state: next };
  }
  if (!resolution.applied) {
    return {
      applied: false,
      reason: resolution.reason,
      state: next,
      stateChanged,
    };
  }

  const selfOverrides = next.directions[selfDirection].overrides ?? {};
  const targetOverrides = next.directions[targetDirection].overrides ?? {};
  const { deltas, operations = {} } = resolution;
  const doublePositive = (value) =>
    operations.doublePositiveOwnBuffs && value > 0 ? value * 2 : value;
  const ownAttackStage = clampStage(doublePositive(
    Number(selfOverrides.attackLevelStage ?? 0) + deltas.ownAttack,
  ));
  const ownDefenseStage = clampStage(doublePositive(
    Number(targetOverrides.defenseLevelStage ?? 0) + deltas.ownDefense,
  ));
  const ownFixedPower = doublePositive(
    Number(selfOverrides.fixedPowerAdd ?? 0) + deltas.ownFixedPower,
  );
  let fixedPowerAddsBySlot = selfOverrides.fixedPowerAddsBySlot;
  if (operations.fixedPowerOncePerType) {
    fixedPowerAddsBySlot = addFixedPowerToFirstAttackOfEachType(
      next,
      snapshot,
      side,
      fixedPowerAddsBySlot,
      Number(operations.fixedPowerOncePerType),
    );
  }
  let skillPowerPercentAddsBySlot = selfOverrides.skillPowerPercentAddsBySlot;
  if (operations.powerPercentForAllAttacks) {
    skillPowerPercentAddsBySlot = addBySlot(
      next,
      snapshot,
      side,
      skillPowerPercentAddsBySlot,
      () => true,
      Number(operations.powerPercentForAllAttacks),
    );
  }
  if (operations.powerPercentForType) {
    skillPowerPercentAddsBySlot = addBySlot(
      next,
      snapshot,
      side,
      skillPowerPercentAddsBySlot,
      (candidate) => candidate.type === operations.powerPercentType,
      Number(operations.powerPercentForType),
    );
  }
  const ownSpeedFlat = doublePositive(
    Number(selfOverrides.attackerSpeedFlat ?? 0) + deltas.ownSpeedFlat,
  );

  updateDirection(next, selfDirection, {
    overrides: {
      attackLevelStage: ownAttackStage,
      attackerSpeedFlat: ownSpeedFlat,
      defenderSpeedFlat:
        Number(selfOverrides.defenderSpeedFlat ?? 0) +
        Number(deltas.targetSpeedFlat ?? 0),
      defenseLevelStage: clampStage(
        Number(selfOverrides.defenseLevelStage ?? 0) + deltas.targetDefense,
      ),
      fixedPowerAdd: ownFixedPower,
      fixedPowerAddsBySlot,
      hitCountAdd: Math.floor(
        Number(selfOverrides.hitCountAdd ?? 0) + deltas.ownHitCountAdd,
      ),
      hitCountPercentAdd:
        Number(selfOverrides.hitCountPercentAdd ?? 0) +
        Number(operations.hitCountPercentForAllAttacks ?? 0),
      refractionStatuses: [
        ...(selfOverrides.refractionStatuses ?? []),
        ...(operations.refractionStatuses ?? []),
      ],
      skillPowerPercentAddsBySlot,
    },
  });
  updateDirection(next, targetDirection, {
    overrides: {
      attackLevelStage: clampStage(
        Number(targetOverrides.attackLevelStage ?? 0) + deltas.targetAttack,
      ),
      attackerSpeedFlat:
        Number(targetOverrides.attackerSpeedFlat ?? 0) +
        Number(deltas.targetSpeedFlat ?? 0),
      defenderSpeedFlat: ownSpeedFlat,
      defenseLevelStage: ownDefenseStage,
      fixedPowerAdd:
        Number(targetOverrides.fixedPowerAdd ?? 0) + deltas.targetFixedPower,
      hitCountAdd: Math.floor(
        Number(targetOverrides.hitCountAdd ?? 0) +
        Number(deltas.targetHitCountAdd ?? 0),
      ),
    },
  });

  const targetSpirit = getSpirit(snapshot, next.sides[targetSide]);
  if (
    hasFairPigeonBalance(targetSpirit) &&
    balanceIsTriggered(next, snapshot, targetSide)
  ) {
    const gained = {
      attack: Math.max(
        0,
        ownAttackStage - Number(selfOverrides.attackLevelStage ?? 0),
      ),
      defense: Math.max(
        0,
        ownDefenseStage - Number(targetOverrides.defenseLevelStage ?? 0),
      ),
    };
    if (gained.attack > 0 || gained.defense > 0) {
      const copied = copyPositiveAbilityStages(
        gained,
        abilityStagesForSide(next, targetSide),
      );
      setAbilityStagesForSide(next, targetSide, copied);
    }
  }

  const healPercent = Number(operations.healPercent ?? 0);
  if (healPercent > 0) {
    const currentHp = Math.min(
      panelStats.hp,
      Math.max(
        0,
        Math.round(
          Number(healthDirection.currentHp ?? panelStats.hp) +
            panelStats.hp * healPercent / 100,
        ),
      ),
    );
    updateDirection(next, targetDirection, {
      currentHp,
      context: { currentHpPercent: currentHp / panelStats.hp * 100 },
    });
  }

  const starfallStacks = Number(operations.targetStarfallStacks ?? 0);
  if (starfallStacks > 0) {
    applyMark(next, targetSide, {
      id: "starfall",
      polarity: "negative",
      stacks: starfallStacks,
    });
  }
  for (const application of operations.markApplications ?? []) {
    applyMark(
      next,
      application.target === "self" ? side : targetSide,
      application,
    );
  }
  const defenseReductionPercent = Number(operations.defenseReductionPercent);
  if (Number.isFinite(defenseReductionPercent)) {
    next.directions[targetDirection].reduction = Math.max(
      0,
      1 - defenseReductionPercent / 100,
    );
  }

  updateSkillContext(next, side, skillIndex, sequence.nextContext);
  return { applied: true, reason: null, state: next, stateChanged: true };
}
