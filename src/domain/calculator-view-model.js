import { calculateMatchup } from "./calculate.js";
import { getNatureMultipliers } from "./natures.js";
import { getSkillChoices } from "./skill-loadout.js";
import { calculateAllPanelStats } from "./stat.js";
import { getSnapshotIndexes } from "./snapshot-indexes.js";
import {
  analyzeDefensiveTypes,
  analyzeSkillTypeCoverage,
} from "./type-chart.js";
import { resolveWingExtensionSkill } from "./wing-extension.js";
import {
  calculateNegativeStatusSettlement,
  normalizeNegativeStatusSide,
  projectNegativeStatusTurns,
} from "./negative-status.js";
import {
  resolveNegativeStatusApplications,
  resolveNegativeStatusModifiers,
} from "./negative-status-rules.js";
import {
  getInheritedDamageTraits,
  getTraitAutomaticStack,
  getTraitEffectInputs,
  getTraitSkillPowerBonuses,
} from "./trait-effects.js";

const STAT_VIEW = [
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "speed", label: "速度" },
  { key: "hp", label: "HP" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
];

export function clampStage(value) {
  return Math.min(99, Math.max(-99, Math.floor(Number(value) || 0)));
}

export function stageMultiplier(stage) {
  const normalizedStage = clampStage(stage);
  return normalizedStage >= 0
    ? 1 + normalizedStage * 0.1
    : 1 / (1 + Math.abs(normalizedStage) * 0.1);
}

export function getSkill(snapshot, entry) {
  const id = typeof entry === "string" ? entry : entry?.skillId ?? entry?.id;
  return getSnapshotIndexes(snapshot).skills[id] ?? null;
}

export function getSkillSlotView(snapshot, entry) {
  const skill = getSkill(snapshot, entry);
  if (!skill) return null;
  if (!entry || typeof entry !== "object") return skill;
  return {
    ...skill,
    slotContext: entry.context ?? {},
    slotHitCount: entry.hitCount,
    slotPowerOverride: entry.overrides?.powerOverride ?? null,
    slotLegacyBasePowerOverride:
      entry.overrides?.basePower ?? entry.basePowerOverride,
  };
}

const MANAGED_NEGATIVE_STATUS_CONTEXT_KEYS = [
  "enemyFreezeStacks",
  "enemyPoisonStacks",
  "poisonStacks",
  "targetPoisonMarkStacks",
];

function negativeStatusContext(state, targetSideKey, enabled) {
  const statuses = enabled
    ? normalizeNegativeStatusSide(state.negativeStatuses?.[targetSideKey])
    : normalizeNegativeStatusSide();
  const targetNegativeMark = state.marks?.[targetSideKey]?.negative;
  return {
    enemyFreezeStacks: statuses.freeze,
    enemyPoisonStacks: statuses.poison,
    poisonStacks: statuses.poison,
    targetPoisonMarkStacks:
      enabled && targetNegativeMark?.id === "poison"
        ? Math.max(0, Math.floor(Number(targetNegativeMark.stacks) || 0))
        : 0,
  };
}

function withManagedStatusContext(entry, context) {
  if (!entry) return entry;
  if (typeof entry === "string") return { context: { ...context }, skillId: entry };
  return {
    ...entry,
    context: { ...(entry.context ?? {}), ...context },
    ...(entry.overrides
      ? {
          overrides: {
            ...entry.overrides,
            context: { ...(entry.overrides.context ?? {}), ...context },
          },
        }
      : {}),
  };
}

function buildCombatState(state) {
  const enabled = state.calculationOptions?.includeNegativeStatusSettlement === true;
  const contexts = {
    forward: negativeStatusContext(state, "defender", enabled),
    reverse: negativeStatusContext(state, "attacker", enabled),
  };
  const sideContexts = {
    attacker: contexts.forward,
    defender: contexts.reverse,
  };
  return {
    ...state,
    directions: Object.fromEntries(
      Object.entries(state.directions).map(([direction, value]) => [
        direction,
        {
          ...value,
          context: { ...(value.context ?? {}), ...contexts[direction] },
          overrides: {
            ...(value.overrides ?? {}),
            context: {
              ...(value.overrides?.context ?? {}),
              ...contexts[direction],
            },
          },
        },
      ]),
    ),
    sides: Object.fromEntries(
      Object.entries(state.sides).map(([side, value]) => [
        side,
        {
          ...value,
          natureMultipliers: getNatureMultipliers(value.nature),
          skills: {
            ...value.skills,
            four: (value.skills?.four ?? []).map((entry) =>
              withManagedStatusContext(entry, sideContexts[side]),
            ),
            single: withManagedStatusContext(
              value.skills?.single,
              sideContexts[side],
            ),
          },
        },
      ]),
    ),
  };
}

export function getSpirit(snapshot, side) {
  return getSnapshotIndexes(snapshot).spirits[side.spiritId];
}

function getSpiritCardView(snapshot, spirit) {
  const traitsById = getSnapshotIndexes(snapshot).traits;
  const primaryTrait =
    spirit.traitIds?.map((traitId) => traitsById[traitId]).find(Boolean) ?? null;
  const skillPowerBonuses = getTraitSkillPowerBonuses(primaryTrait);
  const traitDescription = describeTraitWithSkillPowerBonuses(
    primaryTrait?.description ?? spirit.traitDescription,
    skillPowerBonuses,
  );
  return {
    ...spirit,
    traitDescription,
    traitName:
      primaryTrait?.displayName ?? primaryTrait?.name ?? spirit.traitName,
  };
}

function describeTraitWithSkillPowerBonuses(description, bonuses) {
  if (bonuses.length === 0) return description;
  const details = bonuses
    .map(({ fixedPowerAdd, perHit, skillName }) =>
      `${skillName} ${perHit ? "每段" : ""}+${fixedPowerAdd}`,
    )
    .join("；");
  return `${description ?? ""} 固定基础威力：${details}。`.trim();
}

export function getPanelView(spirit, side, stages = {}) {
  const panel = calculateAllPanelStats({
    raceStats: spirit.raceStats,
    displayIvs: side.displayIvs,
    natureMultipliers: getNatureMultipliers(side.nature),
  });
  const attackMultiplier = stageMultiplier(stages.attack ?? 0);
  const defenseMultiplier = stageMultiplier(stages.defense ?? 0);
  return STAT_VIEW.map(({ key, label }) => {
    const multiplier =
      key === "physicalAttack" || key === "magicalAttack"
        ? attackMultiplier
        : key === "physicalDefense" || key === "magicalDefense"
          ? defenseMultiplier
          : 1;
    const basePanel = panel[key];
    const fallbackPanel = Math.round(
      (basePanel + (key === "speed" ? Number(stages.speedFlat ?? 0) : 0)) *
        multiplier,
    );
    const projectedPanel = Number(stages.finalStats?.[key]);
    const finalPanel = Number.isFinite(projectedPanel)
      ? Math.round(projectedPanel)
      : fallbackPanel;
    const delta = finalPanel - basePanel;
    return {
      basePanel,
      change: delta > 0 ? "increase" : delta < 0 ? "decrease" : null,
      delta,
      displayIv: side.displayIvs[key],
      key,
      label,
      panel: finalPanel,
      race: spirit.raceStats[key],
    };
  });
}

function finalPanelStatsForSide(calculation, sideKey) {
  const attackDirection = sideKey === "attacker" ? "forward" : "reverse";
  const defenseDirection = sideKey === "attacker" ? "reverse" : "forward";
  const attackProjection =
    calculation[attackDirection]?.selectedResult?.combatPanel?.attacker;
  const defenseProjection =
    calculation[defenseDirection]?.selectedResult?.combatPanel?.defender;
  if (!attackProjection && !defenseProjection) return null;
  return {
    ...(defenseProjection ?? {}),
    ...(attackProjection ?? {}),
    speed:
      attackProjection?.speed ??
      defenseProjection?.speed,
  };
}

export function getTraitView(snapshot, spirit, role = "attacker", skills = []) {
  const traitsById = getSnapshotIndexes(snapshot).traits;
  const primaryTrait =
    spirit.traitIds?.map((traitId) => traitsById[traitId]).find(Boolean) ?? null;
  const fallbackTrait = primaryTrait ?? {
    description: spirit.traitDescription,
    name: spirit.traitName,
  };
  const candidates = [fallbackTrait, ...getInheritedDamageTraits(spirit)].filter(
    (candidate) => candidate?.name,
  );
  const traitEntity =
    candidates.find(
      (candidate) => getTraitEffectInputs(candidate, role).length > 0,
    ) ?? candidates[0];
  if (!traitEntity) return null;
  const inputs = getTraitEffectInputs(traitEntity, role);
  const skillPowerBonuses = getTraitSkillPowerBonuses(traitEntity);
  const condition = inputs.find((input) => input.type === "boolean");
  return {
    automaticStack: getTraitAutomaticStack(traitEntity, role, skills),
    conditionKey: condition?.id ?? null,
    conditionLabel: condition?.label ?? null,
    description: describeTraitWithSkillPowerBonuses(
      traitEntity.description ?? "按当前战斗条件自动判定。",
      skillPowerBonuses,
    ),
    inputs,
    name: traitEntity.displayName ?? traitEntity.name,
    skillPowerBonuses,
  };
}

function asResultRailModel({ calculation, direction, snapshot, state }) {
  const isForward = direction === "forward";
  const attackSide = isForward ? state.sides.attacker : state.sides.defender;
  const defenseSide = isForward ? state.sides.defender : state.sides.attacker;
  const attacker = getSpirit(snapshot, attackSide);
  const defender = getSpirit(snapshot, defenseSide);
  const directionResult = calculation[direction];
  const selected = directionResult.selectedResult;
  const defenderPanels = calculateAllPanelStats({
    raceStats: defender.raceStats,
    displayIvs: defenseSide.displayIvs,
    natureMultipliers: getNatureMultipliers(defenseSide.nature),
  });
  const attackerPanels = calculateAllPanelStats({
    raceStats: attacker.raceStats,
    displayIvs: attackSide.displayIvs,
    natureMultipliers: getNatureMultipliers(attackSide.nature),
  });
  const defenderHp = Math.min(
    defenderPanels.hp,
    Math.max(0, state.directions[direction].currentHp ?? defenderPanels.hp),
  );
  const skillEntries = attackSide.skills.four;
  const traitsById = getSnapshotIndexes(snapshot).traits;
  const traits = (attacker.traitIds ?? [])
    .map((traitId) => traitsById[traitId])
    .filter(Boolean);
  const defenderTraits = (defender.traitIds ?? [])
    .map((traitId) => traitsById[traitId])
    .filter(Boolean);
  const statusEnabled =
    state.calculationOptions?.includeNegativeStatusSettlement === true;
  const statusSideKey = isForward ? "defender" : "attacker";
  const baselineStatuses = state.negativeStatuses?.[statusSideKey];
  const targetNegativeMark = state.marks?.[statusSideKey]?.negative;
  const targetPoisonMarkStacks =
    targetNegativeMark?.id === "poison"
      ? Math.max(0, Math.floor(Number(targetNegativeMark.stacks) || 0))
      : 0;
  const directionState = state.directions[direction];
  const attackerCurrentHp = Math.min(
    attackerPanels.hp,
    Math.max(
      0,
      state.directions[isForward ? "reverse" : "forward"].currentHp ??
        attackerPanels.hp,
    ),
  );
  const globalStatusModifiers = resolveNegativeStatusModifiers([
    ...traits,
    ...defenderTraits,
  ]);
  const attackerStatusModifiers = resolveNegativeStatusModifiers(traits);
  const statusModifiers = {
    ...globalStatusModifiers,
    healFromBurn: attackerStatusModifiers.healFromBurn,
    healFromPoison: attackerStatusModifiers.healFromPoison,
  };
  const selectedStatusSkills = skillEntries
    .map((entry) => getSkill(snapshot, entry))
    .filter(Boolean);
  const settleResult = (
    rawResult,
    index,
    entry,
    allowApplications = true,
    includeTurnPreview = false,
  ) => {
    if (!rawResult) return rawResult;
    const selectedSkill = getSkill(snapshot, entry);
    const context = {
      targetPoisonMarkStacks,
      ...(directionState.context ?? {}),
      ...(entry && typeof entry === "object" ? entry.context ?? {} : {}),
    };
    const potentialApplication = allowApplications
      ? resolveNegativeStatusApplications({
          baselineStatuses,
          context,
          selectedSkills: selectedStatusSkills,
          skill: selectedSkill,
          skillIndex: index,
          traits,
        })
      : { sources: [], special: null, stacks: {} };
    const statusUseCount = Math.min(
      2,
      Math.max(
        0,
        Math.floor(
          Number(
            directionState.context?.negativeStatusUseCountsBySlot?.[index + 1],
          ) || 0,
        ),
      ),
    );
    const application = statusUseCount > 0
      ? potentialApplication
      : { sources: [], special: null, stacks: {} };
    const hasStatusApplication =
      Object.values(application.stacks ?? {}).some(
        (stacks) => Number(stacks) > 0,
      ) || Boolean(application.special);
    const statusOnly =
      statusEnabled &&
      rawResult.status !== "exact" &&
      ["defense", "status"].includes(selectedSkill?.category) &&
      hasStatusApplication;
    const resultForSettlement = statusOnly
      ? {
          ...rawResult,
          hpPercent: 0,
          lethal: false,
          reason: null,
          status: "exact",
          statusOnly: true,
          totalDamage: 0,
        }
      : rawResult;
    const settlementInput = {
      applications: application.stacks,
      attacker: {
        currentHp: attackerCurrentHp,
        maxHp: attackerPanels.hp,
        types: attacker.types,
      },
      defender: {
        currentHp: defenderHp,
        maxHp: defenderPanels.hp,
        types: defender.types,
      },
      directDamage: resultForSettlement.totalDamage,
      enabled: statusEnabled && resultForSettlement.status === "exact",
      modifiers: {
        ...statusModifiers,
        burnImmediateTriggers:
          application.special === "double-burn-and-trigger" ? 1 : 0,
      },
      statuses: baselineStatuses,
      thunderWeather: context.weatherThunder === true,
      typeChart: snapshot.typeChart,
    };
    const negativeStatusSettlement = calculateNegativeStatusSettlement(
      settlementInput,
    );
    let turnProjection = null;
    if (
      includeTurnPreview &&
      negativeStatusSettlement &&
      negativeStatusSettlement.skipped !== "direct-ko"
    ) {
      let repeatDirectDamage = resultForSettlement.totalDamage;
      try {
        const projectedState = structuredClone(state);
        projectedState.negativeStatuses = {
          ...(projectedState.negativeStatuses ?? {}),
          [statusSideKey]: negativeStatusSettlement.nextStacks,
        };
        projectedState.directions = {
          ...projectedState.directions,
          [direction]: {
            ...projectedState.directions[direction],
            currentHp: negativeStatusSettlement.remainingHp,
          },
        };
        const projectedDirection = calculateMatchup(
          snapshot,
          buildCombatState(projectedState),
        )[direction];
        const projectedResult = directionState.selectedDamageSource === "bloodline"
          ? projectedDirection.bloodlineResult
          : directionState.selectedDamageSource === "trait"
            ? projectedDirection.traitResult
            : projectedDirection.selectedResult;
        if (Number.isFinite(Number(projectedResult?.totalDamage))) {
          repeatDirectDamage = Number(projectedResult.totalDamage);
        }
      } catch {
        repeatDirectDamage = resultForSettlement.totalDamage;
      }
      const repeatApplication = allowApplications && statusUseCount > 1
        ? resolveNegativeStatusApplications({
            baselineStatuses: negativeStatusSettlement.nextStacks,
            context,
            selectedSkills: selectedStatusSkills,
            skill: selectedSkill,
            skillIndex: index,
            traits,
          })
        : { stacks: {} };
      turnProjection = projectNegativeStatusTurns({
        ...settlementInput,
        repeatApplications: repeatApplication.stacks,
        repeatDirectDamage,
      });
    }
    if (negativeStatusSettlement && turnProjection) {
      negativeStatusSettlement.turnPreview = {
        focusStatusIds: Object.keys(negativeStatusSettlement.stacks ?? {}).filter(
          (id) =>
            Number(negativeStatusSettlement.stacks?.[id]) > 0 ||
            Number(negativeStatusSettlement.added?.[id]) > 0,
        ),
        next: statusUseCount > 1
          ? turnProjection.nextWithRepeat
          : turnProjection.nextWithoutRepeat,
        repeated: statusUseCount > 1,
      };
    }
    return {
      ...resultForSettlement,
      negativeStatusApplications: application,
      negativeStatusCanApply:
        potentialApplication.sources.length > 0 ||
        Boolean(potentialApplication.special),
      negativeStatusSettlement,
      negativeStatusUseCount: statusUseCount,
    };
  };
  const rawRows = [...directionResult.results];
  const enrichedRows = rawRows.map((row, index) =>
    settleResult(row, index, skillEntries[index]),
  );
  while (enrichedRows.length < 4) enrichedRows.push(null);
  const selectedSkillIndex = state.mode === "four"
    ? directionState.selectedSkillIndex
    : 0;
  const selectedEntry = state.mode === "four"
    ? skillEntries[selectedSkillIndex]
    : attackSide.skills.single;
  const enrichedSelected = settleResult(
    selected,
    selectedSkillIndex,
    selectedEntry,
    !["bloodline", "trait"].includes(directionState.selectedDamageSource),
    true,
  );
  const effectiveSkills = skillEntries
    .map((entry) => getSkill(snapshot, entry))
    .filter(Boolean)
    .map((skill) => resolveWingExtensionSkill({ skill, traits }));

  return {
    attackerName: attacker.fullName,
    defenderHp,
    defenderHpPercent:
      state.directions[direction].context?.currentHpPercent ??
      Number(((defenderHp / defenderPanels.hp) * 100).toFixed(1)),
    defenderMaxHp: defenderPanels.hp,
    defenderName: defender.fullName,
    mode: state.mode,
    selectedResult: enrichedSelected,
    selectedSkillName: selected.skillName ?? "未选择技能",
    bloodlineResult: directionResult.bloodlineResult
      ? {
          damage: directionResult.bloodlineResult.totalDamage,
          hpPercent: directionResult.bloodlineResult.hpPercent,
          id: directionResult.bloodlineResult.skillId,
          name: directionResult.bloodlineResult.skillName,
          selected:
            state.directions[direction].selectedDamageSource === "bloodline",
        }
      : null,
    traitResult: directionResult.traitResult
      ? {
          damage: directionResult.traitResult.totalDamage,
          hpPercent: directionResult.traitResult.hpPercent,
          id: directionResult.traitResult.skillId,
          name: directionResult.traitResult.skillName,
          selected:
            state.directions[direction].selectedDamageSource === "trait",
        }
      : null,
    typeAnalysis: {
      subjectName: attacker.fullName,
      defense: analyzeDefensiveTypes(attacker.types, snapshot.typeChart),
      offense: analyzeSkillTypeCoverage(effectiveSkills, snapshot.typeChart),
    },
    skillResults: enrichedRows.map((result, index) => ({
      damage: result?.totalDamage ?? null,
      hpPercent: result?.hpPercent ?? null,
      id: result?.skillId ?? `empty-${index}`,
      name: result?.skillName ?? `技能${index + 1}`,
      negativeStatusSettlement: result?.negativeStatusSettlement ?? null,
      statusOnly: result?.statusOnly === true,
      selected:
        state.directions[direction].selectedDamageSource === "skill" &&
        index ===
        (state.mode === "four"
          ? state.directions[direction].selectedSkillIndex
          : 0),
    })),
  };
}

function unresolvedCalculation(error) {
  const result = {
    formulaSteps: [],
    hpPercent: null,
    lethal: false,
    reason: error instanceof Error ? error.message : "计算条件无效",
    skillId: null,
    skillName: null,
    status: "unsupported",
    totalDamage: null,
  };
  return {
    forward: { results: [result], selectedResult: result },
    reverse: { results: [result], selectedResult: result },
  };
}

function healthView(direction, panelStats) {
  return {
    currentHp: direction.currentHp ?? panelStats.hp,
    maxHp: panelStats.hp,
    percent:
      direction.context?.currentHpPercent ??
      Number(
        (((direction.currentHp ?? panelStats.hp) / panelStats.hp) * 100).toFixed(
          1,
        ),
      ),
  };
}

export function buildCalculatorViewModel({
  activeDirection,
  completeSpiritIds = new Set(),
  favoriteSpiritIds = new Set(),
  snapshot,
  spiritIndex,
  state,
}) {
  const spirits = spiritIndex?.values?.() ?? snapshot.spirits;
  const selectableSpirits = spirits.map((spirit) => ({
    ...getSpiritCardView(snapshot, spirit),
    favoriteState: favoriteSpiritIds.has(spirit.id)
      ? "manual"
      : completeSpiritIds.has(spirit.id)
        ? "complete"
        : null,
  }));
  const attacker = selectableSpirits.find(
    (spirit) => spirit.id === state.sides.attacker.spiritId,
  );
  const defender = selectableSpirits.find(
    (spirit) => spirit.id === state.sides.defender.spiritId,
  );
  const configurationReady = Boolean(attacker && defender);
  const attackerPanelStats = configurationReady
    ? calculateAllPanelStats({
        raceStats: attacker.raceStats,
        displayIvs: state.sides.attacker.displayIvs,
        natureMultipliers: getNatureMultipliers(state.sides.attacker.nature),
      })
    : null;
  const defenderPanelStats = configurationReady
    ? calculateAllPanelStats({
        raceStats: defender.raceStats,
        displayIvs: state.sides.defender.displayIvs,
        natureMultipliers: getNatureMultipliers(state.sides.defender.nature),
      })
    : null;
  const attackerHealth = configurationReady
    ? healthView(state.directions.reverse, attackerPanelStats)
    : null;
  const defenderHealth = configurationReady
    ? healthView(state.directions.forward, defenderPanelStats)
    : null;
  const attackSideKey = activeDirection === "forward" ? "attacker" : "defender";
  const defenseSideKey = activeDirection === "forward" ? "defender" : "attacker";
  const attackSide = state.sides[attackSideKey];
  const attackSpirit = attackSideKey === "attacker" ? attacker : defender;
  const defenseSpirit = defenseSideKey === "defender" ? defender : attacker;
  const attackerChoices = state.sides.attacker.spiritId
    ? getSkillChoices(snapshot, state.sides.attacker.spiritId)
    : [];
  const defenderChoices = state.sides.defender.spiritId
    ? getSkillChoices(snapshot, state.sides.defender.spiritId)
    : [];
  const activeChoices =
    attackSideKey === "attacker" ? attackerChoices : defenderChoices;
  const selectedSingle =
    getSkill(snapshot, attackSide.skills.single) ?? activeChoices[0] ?? snapshot.skills[0];
  let calculation;
  if (!configurationReady) {
    calculation = unresolvedCalculation(new Error("请选择双方精灵"));
  } else {
    try {
      calculation = calculateMatchup(snapshot, buildCombatState(state));
    } catch (error) {
      calculation = unresolvedCalculation(error);
    }
  }
  const result = configurationReady
    ? asResultRailModel({ calculation, direction: activeDirection, snapshot, state })
    : null;
  const attackerFinalPanelStats = configurationReady
    ? finalPanelStatsForSide(calculation, "attacker")
    : null;
  const defenderFinalPanelStats = configurationReady
    ? finalPanelStatsForSide(calculation, "defender")
    : null;
  const currentDirection = state.directions[activeDirection];
  const weatherRainTurns = Math.min(
    8,
    Math.max(
      0,
      Math.floor(
        Number(
          state.directions.forward.context?.weatherRainTurns ??
            state.directions.reverse.context?.weatherRainTurns ??
            0,
        ) || 0,
      ),
    ),
  );

  return {
    active: {
      attackSide,
      attackSideKey,
      attackSpirit,
      defenseSideKey,
      defenseSpirit,
      direction: activeDirection,
    },
    calculation,
    configurationReady,
    currentDirection,
    environment: {
      attackLevelStage: currentDirection.overrides.attackLevelStage ?? 0,
      defenseLevelStage: currentDirection.overrides.defenseLevelStage ?? 0,
      weatherRainTurns,
    },
    result,
    selectableSpirits,
    sides: {
      attacker: {
        finalPanelStats: attackerFinalPanelStats,
        health: attackerHealth,
        panelStats: attackerPanelStats,
        spirit: attacker,
      },
      defender: {
        finalPanelStats: defenderFinalPanelStats,
        health: defenderHealth,
        panelStats: defenderPanelStats,
        spirit: defender,
      },
    },
    skills: {
      activeChoices,
      attackerChoices,
      defenderChoices,
      selectedSingle,
    },
  };
}
