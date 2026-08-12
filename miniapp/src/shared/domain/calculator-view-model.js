import { calculateMatchup } from "./calculate.js";
import { getNatureMultipliers } from "./natures.js";
import { getSkillChoices } from "./skill-loadout.js";
import { calculateAllPanelStats } from "./stat.js";
import { getSnapshotIndexes } from "./snapshot-indexes.js";
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
  return Math.min(50, Math.max(-50, Math.floor(Number(value) || 0)));
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
    slotPowerOverride:
      entry.overrides?.basePower ?? entry.basePowerOverride,
  };
}

function buildCombatState(state) {
  return {
    ...state,
    sides: Object.fromEntries(
      Object.entries(state.sides).map(([side, value]) => [
        side,
        {
          ...value,
          natureMultipliers: getNatureMultipliers(value.nature),
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
  const defenderHp = Math.min(
    defenderPanels.hp,
    Math.max(0, state.directions[direction].currentHp ?? defenderPanels.hp),
  );
  const rows = [...directionResult.results];
  while (rows.length < 4) rows.push(null);

  return {
    attackerName: attacker.fullName,
    defenderHp,
    defenderHpPercent:
      state.directions[direction].context?.currentHpPercent ??
      Number(((defenderHp / defenderPanels.hp) * 100).toFixed(1)),
    defenderMaxHp: defenderPanels.hp,
    defenderName: defender.fullName,
    mode: state.mode,
    selectedResult: selected,
    selectedSkillName: selected.skillName ?? "未选择技能",
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
    skillResults: rows.map((result, index) => ({
      damage: result?.totalDamage ?? null,
      hpPercent: result?.hpPercent ?? null,
      id: result?.skillId ?? `empty-${index}`,
      name: result?.skillName ?? `技能${index + 1}`,
      selected:
        state.directions[direction].selectedDamageSource !== "trait" &&
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
