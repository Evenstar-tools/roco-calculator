import { supportsChoiceTrait } from "../choice-skill-sequence.js";

export function formulaStep(label, input, before, after, source) {
  return {
    label,
    input,
    before,
    after,
    value: String(after),
    source,
  };
}

export function unresolvedResult(skill, resolution, partial = {}) {
  return {
    skillId: skill?.id ?? null,
    skillName: skill?.name ?? null,
    totalDamage: null,
    hpPercent: null,
    lethal: false,
    status: resolution.status,
    inputs: resolution.inputs ?? [],
    reason: resolution.reason,
    formulaSteps: resolution.steps ?? [],
    sources: [resolution.source].filter(Boolean),
    ...partial,
  };
}

export function emptySlotResult() {
  return unresolvedResult(null, {
    status: "unsupported",
    reason: "未选择技能",
  });
}

export function entryWithContext(entry, context) {
  if (typeof entry === "string") {
    return { context, skillId: entry };
  }
  return { ...(entry ?? {}), context };
}

export function choiceTraitName(attacker) {
  return attacker.traits
    .map((trait) => trait?.displayName ?? trait?.name)
    .find(supportsChoiceTrait) ?? null;
}

export function mergeChoiceTraitResults(
  results,
  traitName,
  defender,
  currentHp,
  executionPlan = [],
) {
  if (results.length < 2 || results.some((result) => result.status !== "exact")) {
    return results[0];
  }
  const [first, second] = results;
  const totalDamage = results.reduce(
    (total, result) => total + result.totalDamage,
    0,
  );
  const resultExecutions = results.map((result, index) => ({
    damage: result.totalDamage,
    label: index === 0 ? "第一段" : "第二段",
    power: result.skillPower,
  }));
  const firstUsesResponse = executionPlan[0]?.responseTriggered === true;
  return {
    ...first,
    additionalDamage: results.reduce(
      (total, result) => total + result.additionalDamage,
      0,
    ),
    reassemblyDamage: results.reduce(
      (total, result) => total + (Number(result.reassemblyDamage) || 0),
      0,
    ),
    traitDamage: results.reduce(
      (total, result) => total + (Number(result.traitDamage) || 0),
      0,
    ),
    choiceTraitSequence: {
      executions: resultExecutions,
      text: `${traitName}：第一段 ${first.totalDamage} + 第二段 ${second.totalDamage} = ${totalDamage}${firstUsesResponse ? "（仅第一段触发应对）" : ""}`,
      traitName,
    },
    formulaSteps: results.flatMap((result, index) =>
      result.formulaSteps.map((step) => ({
        ...step,
        label: `${index === 0 ? "第一段" : "第二段"} · ${step.label}`,
      })),
    ),
    hpPercent: (totalDamage / Math.max(1, defender.panelStats.hp)) * 100,
    lethal: currentHp <= totalDamage,
    mainDamage: results.reduce(
      (total, result) => total + result.mainDamage,
      0,
    ),
    markSettlements: results.flatMap(
      (result) => result.markSettlements ?? [],
    ),
    traitSettlements: results.flatMap(
      (result) => result.traitSettlements ?? [],
    ),
    totalDamage,
    warnings: [...new Set(results.flatMap((result) => result.warnings ?? []))],
  };
}

export function mergeGaleTurbineResults({
  companionResult,
  currentHp,
  defender,
  turbineResult,
}) {
  if (
    companionResult?.status !== "exact" ||
    turbineResult?.status !== "exact"
  ) {
    return turbineResult;
  }
  const totalDamage = companionResult.totalDamage + turbineResult.totalDamage;
  const executions = [companionResult, turbineResult].map((result) => ({
    damage: result.totalDamage,
    label: result.skillName,
    power: result.skillPower,
    skillName: result.skillName,
  }));
  return {
    ...turbineResult,
    additionalDamage:
      companionResult.additionalDamage + turbineResult.additionalDamage,
    reassemblyDamage:
      (Number(companionResult.reassemblyDamage) || 0) +
      (Number(turbineResult.reassemblyDamage) || 0),
    traitDamage:
      (Number(companionResult.traitDamage) || 0) +
      (Number(turbineResult.traitDamage) || 0),
    choiceTraitSequence: {
      executions,
      text: `${companionResult.skillName} ${companionResult.totalDamage} + 疾风涡轮 ${turbineResult.totalDamage} = ${totalDamage}`,
      traitName: "展翅",
    },
    formulaSteps: [companionResult, turbineResult].flatMap((result) =>
      result.formulaSteps.map((step) => ({
        ...step,
        label: `${result.skillName} · ${step.label}`,
      })),
    ),
    hpPercent: (totalDamage / Math.max(1, defender.panelStats.hp)) * 100,
    lethal: currentHp <= totalDamage,
    mainDamage: companionResult.mainDamage + turbineResult.mainDamage,
    traitSettlements: [
      ...(companionResult.traitSettlements ?? []),
      ...(turbineResult.traitSettlements ?? []),
    ],
    sources: [...new Set([
      ...(companionResult.sources ?? []),
      ...(turbineResult.sources ?? []),
      "reviewed-trait:wing-extension-v1",
    ])],
    totalDamage,
  };
}
