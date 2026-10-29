import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { getS5PreviewTraitEvaluation } from "../../domain/s5-preview-traits.js";

const RESULT_IDENTITY_FIELDS = ["id", "name", "skillId", "skillName", "selected"];

function isDamageResult(value) {
  return ["totalDamage", "damage", "hpPercent"].some((key) => Object.hasOwn(value, key));
}

/** Only unresolved active mechanisms block preview calculations; supported traits use the core result. */
export function withS5PreviewCalculationGuard(view, snapshot, state) {
  const pendingReasons = [];
  for (const [sideKey, sideView] of Object.entries(view?.sides ?? {})) {
    const spirit = sideView?.spirit;
    const side = state?.sides?.[sideKey];
    const direction = sideKey === "attacker" ? "forward" : "reverse";
    const traits = snapshot && getEffectiveTraits(snapshot, { ...side, spirit });
    const evaluations = (traits || []).map((trait) => getS5PreviewTraitEvaluation(
      trait, "attacker", state?.directions?.[direction]?.context ?? {},
    )).filter(Boolean);
    for (const evaluation of evaluations) {
      if (evaluation.blockingReason) pendingReasons.push(`${spirit?.fullName ?? "S5特性"}：${evaluation.blockingReason}`);
    }
    if (spirit?.calculationStatus === "pending-s5-mechanics" && !evaluations.length && side?.ignoreTraits !== true) {
      pendingReasons.push(`${spirit.fullName ?? spirit.name ?? spirit.id}的 S5 特性尚未接入，暂不支持伤害计算`);
    }
  }
  const globalReason = [...new Set(pendingReasons)].join("；") || null;
  const skillReasons = new Map((snapshot?.skills ?? []).filter(skill => skill.s5StatusEffectPending)
    .map(skill => [skill.id, skill.s5StatusEffectPending]));
  const traitReasons = {};
  for (const [direction, side] of [["forward", "attacker"], ["reverse", "defender"]]) {
    traitReasons[direction] = new Map();
    if (!snapshot) continue;
    for (const trait of getEffectiveTraits(snapshot, { ...state?.sides?.[side], spirit: view?.sides?.[side]?.spirit })) {
      for (const name of trait.s5PendingSkillNames ?? []) {
        const skill = snapshot.skills.find(skill => skill.name === name);
        if (skill) traitReasons[direction].set(skill.id, trait.s5PendingReason);
      }
    }
  }
  if (!globalReason && !skillReasons.size && !Object.values(traitReasons).some(reasons => reasons.size)) return view;
  const seenByDirection = { forward: new WeakMap(), reverse: new WeakMap() };
  function protect(value, direction) {
    if (!value || typeof value !== "object") return value;
    const seen = seenByDirection[direction];
    if (seen.has(value)) return seen.get(value);
    if (isDamageResult(value)) {
      const reason = globalReason ?? skillReasons.get(value.skillId) ?? traitReasons[direction].get(value.skillId);
      if (!reason) return value;
      // Copy identity only: computed power, damage, settlements and gain sources
      // must not survive underneath an unsupported status.
      const result = Object.fromEntries(RESULT_IDENTITY_FIELDS.filter((key) => Object.hasOwn(value, key))
        .map((key) => [key, value[key]]));
      Object.assign(result, {
        status: "unsupported", reason,
        totalDamage: null, damage: null, hpPercent: null, remainingHp: null, lethal: false,
        formulaSteps: [], hitDamages: [], sources: [], warnings: [],
        gainSources: {}, traitContributions: [], gainSummary: null,
        negativeStatusApplications: null, negativeStatusSettlement: null,
        markSettlements: [], traitSettlements: [],
      });
      seen.set(value, result);
      return result;
    }
    const result = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    let changed = false;
    for (const [key, child] of Object.entries(value)) {
      result[key] = protect(child, direction);
      changed ||= result[key] !== child;
    }
    return changed ? result : value;
  }
  const activeDirection = view?.active?.direction ?? "forward";
  const directions = value => value && Object.fromEntries(Object.entries(value)
    .map(([direction, result]) => [direction, protect(result, seenByDirection[direction] ? direction : activeDirection)]));
  return {
    ...view,
    calculation: directions(view.calculation),
    result: protect(view.result, view.active?.direction ?? "forward"),
    skillResultsByDirection: directions(view.skillResultsByDirection),
    traitResultsByDirection: directions(view.traitResultsByDirection),
  };
}
