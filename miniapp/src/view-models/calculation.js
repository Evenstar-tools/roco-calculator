import { buildCombatState } from "../shared/build-combat-state.js";
import { calculateMatchup } from "../shared/domain/calculate.js";
import { createCombatantView } from "./combatant.js";

const UNRESOLVED_MESSAGE = "当前规则暂未收录";
const RECOVERABLE_CONFIGURATION_MESSAGE =
  "当前配置无法完成计算，请重新选择宠物和技能";

function getSpiritName(snapshot, spiritId) {
  return (
    (snapshot?.spirits ?? []).find(
      (spirit) => spirit.id === spiritId,
    )?.fullName ?? "未选择宠物"
  );
}

function getDefenderHp(snapshot, side) {
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

function isRecoverableConfigurationError(error) {
  return (
    error instanceof Error &&
    /^Unknown spirit: \S+$/u.test(error.message)
  );
}

function toResultRow(result, defenderHp) {
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
    Number.isFinite(defenderHp) && defenderHp > 0
      ? remainingHp / defenderHp * 100
      : null;

  return {
    ...result,
    remainingHp,
    remainingHpPercent,
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
  const defenderHp = getDefenderHp(snapshot, defenderSide);

  try {
    const calculation = calculateMatchup(
      snapshot,
      buildCombatState(state),
    );
    const directionResult = calculation[normalizedDirection];
    const rows = directionResult.results.map((result) =>
      toResultRow(result, defenderHp),
    );
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
    const selectedRow = rows[selectedIndex] ?? null;

    if (selectedRow?.status !== "exact") {
      return {
        attackerName,
        defenderHp,
        defenderName,
        message: selectedRow?.message ?? UNRESOLVED_MESSAGE,
        rows,
        selectedResult: null,
        status: "unresolved",
      };
    }

    return {
      attackerName,
      defenderHp,
      defenderName,
      rows,
      selectedResult: selectedRow,
      status: "exact",
    };
  } catch (error) {
    if (!isRecoverableConfigurationError(error)) {
      throw error;
    }
    return {
      attackerName,
      defenderHp,
      defenderName,
      message: RECOVERABLE_CONFIGURATION_MESSAGE,
      rows: [],
      selectedResult: null,
      status: "unresolved",
    };
  }
}
