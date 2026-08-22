import { buildCombatState } from "../shared/build-combat-state.js";
import { calculateMatchup } from "../shared/domain/calculate.js";
import {
  analyzeDefensiveTypes,
  analyzeSkillTypeCoverage,
} from "../shared/domain/type-chart.js";
import { getSnapshotIndexes } from "../shared/domain/snapshot-indexes.js";
import { resolveWingExtensionSkill } from "../shared/domain/wing-extension.js";
import { buildCalculatorViewModel } from "../shared/domain/calculator-view-model.js";
import { createCombatantView } from "./combatant.js";

function createTypeAnalysis(snapshot, side, subjectName) {
  const indexes = getSnapshotIndexes(snapshot);
  const spirit = indexes.spirits[side.spiritId];
  if (!spirit) return null;
  const traits = (spirit.traitIds ?? [])
    .map((traitId) => indexes.traits[traitId])
    .filter(Boolean);
  const skills = (side.skills?.four ?? [])
    .map((entry) => typeof entry === "string" ? entry : entry?.skillId ?? entry?.id)
    .map((skillId) => indexes.skills[skillId])
    .filter(Boolean)
    .map((skill) => resolveWingExtensionSkill({ skill, traits }));
  return {
    subjectName,
    defense: analyzeDefensiveTypes(spirit.types, snapshot.typeChart),
    offense: analyzeSkillTypeCoverage(skills, snapshot.typeChart),
  };
}

const UNRESOLVED_MESSAGE = "当前规则暂未收录";
const RECOVERABLE_CONFIGURATION_MESSAGE =
  "当前配置无法完成计算，请重新选择宠物和技能";
const POWER_RESOLUTION_SOURCES = new Set([
  "reviewed-rule:speed-defense-difference-v1",
  "reviewed-rule:speed-defense-difference-v2",
  "reviewed-rule:mana-burst-v1",
  "reviewed-rule:enemy-total-skill-cost-power-v1",
  "reviewed-rule:enemy-skill-power-multiplier-v1",
]);

function getSpiritName(snapshot, spiritId) {
  return (
    (snapshot?.spirits ?? []).find(
      (spirit) => spirit.id === spiritId,
    )?.fullName ?? "未选择宠物"
  );
}

function getDefenderMaxHp(snapshot, side) {
  return (
    createCombatantView(snapshot, side).stats.find(
      (stat) => stat.key === "hp",
    )?.panel ?? null
  );
}

function unresolvedMessage(result) {
  if (!result?.skillId) return "请选择技能";
  if (result.status === "needs_input") {
    return result.reason || "请补充技能条件";
  }
  return UNRESOLVED_MESSAGE;
}

function formatResolutionStep(step) {
  const before = Number(step.before);
  const after = Number(step.after);
  const source = String(step.source);
  if (
    source.startsWith("reviewed-rule:speed-defense-difference-v") &&
    Number.isFinite(Number(step.input?.attacker)) &&
    Number.isFinite(Number(step.input?.defender))
  ) {
    const metric = String(step.label).includes("物防")
      ? "物防"
      : "速度";
    return `${metric} ${Number(step.input.attacker)} − ${Number(step.input.defender)} = ${before} → 威力 ${after}`;
  }
  if (source === "reviewed-rule:mana-burst-v1") {
    return `${Number(step.input)} 能量 → 威力 ${after}`;
  }
  if (source === "reviewed-rule:enemy-skill-power-multiplier-v1") {
    const input = Number(step.input);
    if (Number.isFinite(input) && input !== 0) {
      const multiplier = after / input;
      return `${input} × ${Number(multiplier.toFixed(2))} = ${after}`;
    }
    return `敌方技能威力 ${input} → 威力 ${after}`;
  }
  const difference = after - before;
  return `${before} ${difference >= 0 ? "+" : "−"} ${Math.abs(difference)} = ${after}`;
}

export function describePowerResolution(result) {
  const steps = result?.formulaSteps ?? [];
  const baseIndex = steps.findIndex(({ label }) =>
    String(label).trim().endsWith("基础威力")
  );
  const candidates = baseIndex >= 0 ? steps.slice(0, baseIndex) : steps;
  const changed = candidates.find(({ before, after, source }) =>
    POWER_RESOLUTION_SOURCES.has(String(source)) &&
    Number.isFinite(Number(before)) &&
    Number.isFinite(Number(after)) &&
    Number(before) !== Number(after)
  );
  return changed ? formatResolutionStep(changed) : null;
}

export function decoratePowerResult(result) {
  return {
    ...result,
    displayedPower:
      result?.resolvedPower ??
      result?.skillPower ??
      result?.effectivePower ??
      null,
    powerSummary: describePowerResolution(result),
  };
}

function isRecoverableConfigurationError(error) {
  return (
    error instanceof Error &&
    /^Unknown spirit: \S+$/u.test(error.message)
  );
}

function toResultRow(result, defenderHp, defenderMaxHp) {
  if (result?.status !== "exact") {
    return {
      ...result,
      hpPercent: null,
      message: unresolvedMessage(result),
      status: "unresolved",
      totalDamage: null,
    };
  }

  const remainingHp =
    Number.isFinite(defenderHp)
      ? Math.max(0, defenderHp - result.totalDamage)
      : null;
  const remainingHpPercent =
    Number.isFinite(defenderMaxHp) && defenderMaxHp > 0
      ? remainingHp / defenderMaxHp * 100
      : null;

  return {
    ...decoratePowerResult(result),
    remainingHp,
    remainingHpPercent,
  };
}

function withNegativeStatusResult(result, sharedResult) {
  if (!result || !sharedResult) return result;
  return {
    ...result,
    negativeStatusApplications: sharedResult.negativeStatusApplications,
    negativeStatusCanApply: sharedResult.negativeStatusCanApply,
    negativeStatusSettlement: sharedResult.negativeStatusSettlement,
    negativeStatusUseCount: sharedResult.negativeStatusUseCount,
    statusOnly: sharedResult.statusOnly === true,
  };
}

export function selectDamageResult({
  bloodlineResult,
  rows,
  selectedDamageSource,
  selectedIndex,
  traitResult,
}) {
  return selectedDamageSource === "bloodline" && bloodlineResult
    ? { selectedDamageSource: "bloodline", selectedResult: bloodlineResult }
    : selectedDamageSource === "trait" && traitResult
    ? { selectedDamageSource: "trait", selectedResult: traitResult }
    : {
        selectedDamageSource: "skill",
        selectedResult: rows[selectedIndex] ?? null,
      };
}

export function createCalculationView(snapshot, state, direction) {
  const normalizedDirection =
    direction === "reverse" ? "reverse" : "forward";
  const attackerSide =
    normalizedDirection === "forward"
      ? state.sides.attacker
      : state.sides.defender;
  const defenderSide =
    normalizedDirection === "forward"
      ? state.sides.defender
      : state.sides.attacker;
  const attackerName = getSpiritName(
    snapshot,
    attackerSide.spiritId,
  );
  const defenderName = getSpiritName(
    snapshot,
    defenderSide.spiritId,
  );
  const defenderMaxHp = getDefenderMaxHp(snapshot, defenderSide);
  const rawConfiguredHp =
    state.directions[normalizedDirection]?.currentHp;
  const configuredHp =
    rawConfiguredHp === null || rawConfiguredHp === undefined
      ? Number.NaN
      : Number(rawConfiguredHp);
  const defenderHp = Number.isFinite(configuredHp)
    ? Math.min(defenderMaxHp, Math.max(0, configuredHp))
    : defenderMaxHp;
  const defenderHpPercent =
    Number.isFinite(defenderMaxHp) && defenderMaxHp > 0
      ? defenderHp / defenderMaxHp * 100
      : null;
  const typeAnalysis = createTypeAnalysis(snapshot, attackerSide, attackerName);

  try {
    const combatState = buildCombatState(state, snapshot);
    const sharedResult = buildCalculatorViewModel({
      activeDirection: normalizedDirection,
      snapshot,
      state: combatState,
    }).result;
    const calculation = calculateMatchup(snapshot, combatState);
    const directionResult = calculation[normalizedDirection];
    const rows = directionResult.results.map((result, index) =>
      toResultRow(
        withNegativeStatusResult(
          result,
          sharedResult?.skillResults?.[index],
        ),
        defenderHp,
        defenderMaxHp,
      ),
    );
    const traitResult = directionResult.traitResult
      ? toResultRow(directionResult.traitResult, defenderHp, defenderMaxHp)
      : null;
    const bloodlineResult = directionResult.bloodlineResult
      ? toResultRow(directionResult.bloodlineResult, defenderHp, defenderMaxHp)
      : null;
    const selectedIndex =
      state.mode === "four"
        ? Math.min(
            rows.length - 1,
            Math.max(
              0,
              Math.floor(
                Number(
                  state.directions[normalizedDirection]
                    ?.selectedSkillIndex,
                ) || 0,
              ),
            ),
          )
        : 0;
    const {
      selectedDamageSource,
      selectedResult,
    } = selectDamageResult({
      bloodlineResult,
      rows,
      selectedDamageSource:
        state.directions[normalizedDirection]?.selectedDamageSource,
      selectedIndex,
      traitResult,
    });
    const selectedRow = withNegativeStatusResult(
      selectedResult,
      sharedResult?.selectedResult,
    );

    if (selectedRow?.status !== "exact") {
      return {
        attackerName,
        bloodlineResult,
        defenderHp,
        defenderHpPercent,
        defenderMaxHp,
        defenderName,
        message: selectedRow?.message ?? UNRESOLVED_MESSAGE,
        rows,
        selectedResult: null,
        selectedDamageSource,
        status: "unresolved",
        traitResult,
        typeAnalysis,
      };
    }

    return {
      attackerName,
      bloodlineResult,
      defenderHp,
      defenderHpPercent,
      defenderMaxHp,
      defenderName,
      rows,
      selectedResult: selectedRow,
      selectedDamageSource,
      status: "exact",
      traitResult,
      typeAnalysis,
    };
  } catch (error) {
    if (!isRecoverableConfigurationError(error)) {
      throw error;
    }
    return {
      attackerName,
      bloodlineResult: null,
      defenderHp,
      defenderHpPercent,
      defenderMaxHp,
      defenderName,
      message: RECOVERABLE_CONFIGURATION_MESSAGE,
      rows: [],
      selectedResult: null,
      status: "unresolved",
      traitResult: null,
      typeAnalysis,
    };
  }
}
