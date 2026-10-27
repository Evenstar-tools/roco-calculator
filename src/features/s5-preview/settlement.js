import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { resolveBattleSpirit } from "../../domain/battle-form.js";
import { linkedNegativeStatusContext } from "../../domain/negative-status-context.js";
import { calculateNegativeStatusSettlement, normalizeNegativeStatusSide } from "../../domain/negative-status.js";
import {
  hasNegativeStatusSkillApplication, resolveNegativeStatusApplications, resolveNegativeStatusModifiers,
  shouldPreviewNegativeStatusApplications,
} from "../../domain/negative-status-rules.js";
import { getS5PreviewTraitEvaluation, getS5PreviewTraitInputs } from "../../domain/s5-preview-traits.js";
import { currentWeather } from "../../state/weather.js";

// Keep the original result outside serialized display data. Re-projecting a view
// must derive the same one-use application, never append the previous preview.
const ORIGINAL_RESULT = Symbol("s5-preview-settlement-original-result");
const opposite = (side) => side === "attacker" ? "defender" : "attacker";
const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
const skillId = (entry) => typeof entry === "string" ? entry : entry?.skillId ?? entry?.id;

/** An explicit turn-end action adds layers only; rendering never replays it. */
export function applyS5PreviewDreamTurnEnd(state, { side, snapshot } = {}) {
  const targetSide = ["attacker", "defender"].includes(side) ? opposite(side) : null;
  const statuses = normalizeNegativeStatusSide(state?.negativeStatuses?.[targetSide]);
  const total = statuses.parasitism;
  const unchanged = (reason) => ({ state, applied: false, added: 0, total, reason });
  if (!targetSide || !snapshot || !state?.sides?.[side]) return unchanged("未选择特性持有方");
  if (currentWeather(state.directions?.forward?.context) !== "dream") return unchanged("当前未处于萌系天气");
  const configured = state.sides[side];
  const spirit = resolveBattleSpirit(snapshot, configured);
  const traits = getEffectiveTraits(snapshot, { ...configured, spirit });
  if (!traits.some((trait) => getS5PreviewTraitEvaluation(trait)?.mechanicKey === "lily-of-valley")) {
    return unchanged("当前特性不能施加回合末寄生");
  }
  const nextTotal = Math.min(99, total + 3);
  const added = nextTotal - total;
  if (!added) return unchanged("目标寄生已达99层");
  return {
    state: { ...state, negativeStatuses: { ...state.negativeStatuses,
      [targetSide]: { ...statuses, parasitism: nextTotal },
    } },
    applied: true, added, total: nextTotal,
  };
}

function hasNativeStatusUse(skill, application) {
  return ["status", "defense"].includes(skill?.category) &&
    (hasNegativeStatusSkillApplication(skill) || application.sources.length > 0 || Boolean(application.special));
}

function nativeStatusSelection(state, side, snapshot, skillIndex) {
  if (!["attacker", "defender"].includes(side) || !snapshot || !state) return null;
  const direction = side === "attacker" ? "forward" : "reverse";
  const directionState = state.directions?.[direction];
  const configuredSide = state.sides?.[side];
  if (!directionState || !configuredSide) return null;
  const index = state.mode === "four" ? whole(skillIndex ?? directionState.selectedSkillIndex) : 0;
  const entry = state.mode === "four" ? configuredSide.skills?.four?.[index] : configuredSide.skills?.single;
  const skills = new Map((snapshot.skills ?? []).map((skill) => [skill.id, skill]));
  const skill = skills.get(skillId(entry));
  if (!["status", "defense"].includes(skill?.category)) return null;
  const spirit = resolveBattleSpirit(snapshot, configuredSide);
  const traits = getEffectiveTraits(snapshot, { ...configuredSide, spirit });
  const context = linkedNegativeStatusContext(state, side, {
    ...directionState.context, ...(entry && typeof entry === "object" ? entry.context : {}),
  });
  const application = resolveNegativeStatusApplications({
    baselineStatuses: state.negativeStatuses?.[opposite(side)], context,
    selectedSkills: (configuredSide.skills?.four ?? []).map((item) => skills.get(skillId(item))).filter(Boolean),
    skill, skillIndex: index, traits,
  });
  if (!hasNativeStatusUse(skill, application)) return null;
  return { direction, directionState, index, skill, traits };
}

/** Share the existing native status-use counter with an S5 current-use confirmation. */
export function synchronizeS5PreviewSkillUse(state, { side, control, value, snapshot } = {}) {
  const suffix = /^(?:attacker|defender)TraitS5(SkillUsed|UsedSkillType)$/u.exec(control?.contextKey ?? "")?.[1];
  if (!suffix) return state;
  const selection = nativeStatusSelection(state, side, snapshot);
  if (!selection) return state;
  const { direction, directionState, index, skill } = selection;
  const requestedType = ({ grass: "草", bug: "虫" })[value];
  const confirmed = suffix === "SkillUsed" ? value === true :
    Boolean(requestedType && requestedType === skill.type);
  const key = state.mode === "four" ? String(index + 1) : "single";
  const counts = directionState.context?.negativeStatusUseCountsBySlot ?? {};
  const count = confirmed ? 1 : 0;
  if (counts[key] === count) return state;
  return { ...state, directions: { ...state.directions, [direction]: { ...directionState,
    context: { ...directionState.context, negativeStatusUseCountsBySlot: { ...counts, [key]: count } },
  } } };
}

/** Reflect a native use/cancel back into the owner's two mirrored S5 controls. */
export function synchronizeS5PreviewConfirmationFromUse(state, { side, snapshot, used, skillIndex } = {}) {
  const selection = nativeStatusSelection(state, side, snapshot, skillIndex);
  if (!selection) return state;
  const { direction, skill, traits } = selection;
  let directions = state.directions;
  for (const [targetDirection, role] of [[direction, "attacker"], [direction === "forward" ? "reverse" : "forward", "defender"]]) {
    const current = directions[targetDirection];
    if (!current) continue;
    let context = current.context;
    for (const trait of traits.filter(item => !item.acquired)) {
      for (const control of getS5PreviewTraitInputs(trait, role) ?? []) {
        let value;
        if (control.contextKey === `${role}TraitS5SkillUsed`) value = used === true;
        else if (control.contextKey === `${role}TraitS5UsedSkillType`) value = used === true ? ({ 草: "grass", 虫: "bug" })[skill.type] ?? "none" : "none";
        else continue;
        if (context?.[control.id] !== value) context = { ...context, [control.id]: value };
      }
    }
    if (context !== current.context) directions = { ...directions, [targetDirection]: { ...current, context } };
  }
  return directions === state.directions ? state : { ...state, directions };
}

function statusModifiers(sourceTraits, targetTraits) {
  const all = resolveNegativeStatusModifiers([...sourceTraits, ...targetTraits]);
  const own = resolveNegativeStatusModifiers(sourceTraits);
  return { ...all, healFromBurn: own.healFromBurn, healFromPoison: own.healFromPoison };
}

function combatSide(view, state, side) {
  const displayed = view.sides?.[side];
  const hpDirection = side === "attacker" ? "reverse" : "forward";
  const maxHp = displayed?.health?.maxHp ?? displayed?.panelStats?.hp;
  return {
    currentHp: displayed?.health?.currentHp ?? state.directions?.[hpDirection]?.currentHp ?? maxHp,
    maxHp,
    types: displayed?.spirit?.types ?? [],
  };
}

/** Web-only current-use status preview. It never writes a turn, weather or mark to session state. */
export function withS5PreviewSettlements(view, snapshot, state) {
  if (!view || !snapshot || state?.calculationOptions?.includeNegativeStatusSettlement !== true) return view;
  const skills = new Map((snapshot.skills ?? []).map((skill) => [skill.id, skill]));
  const activeDirection = view.active?.direction ?? "forward";
  const caches = { forward: new WeakMap(), reverse: new WeakMap() };
  let changed = false;

  function project(raw, direction, index) {
    if (!raw || typeof raw !== "object") return raw;
    const cache = caches[direction];
    if (cache.has(raw)) return cache.get(raw);
    const base = raw[ORIGINAL_RESULT] ?? raw;
    const sourceSide = direction === "forward" ? "attacker" : "defender";
    const targetSide = opposite(sourceSide);
    const configuredSide = state.sides?.[sourceSide];
    const entry = state.mode === "four" ? configuredSide?.skills?.four?.[index] : configuredSide?.skills?.single;
    const skill = skills.get(skillId(entry));
    if (!skill || base.skillId !== skill.id) { cache.set(raw, raw); return raw; }
    const sourceTraits = getEffectiveTraits(snapshot, { ...configuredSide, spirit: view.sides?.[sourceSide]?.spirit });
    const targetTraits = getEffectiveTraits(snapshot, { ...state.sides?.[targetSide], spirit: view.sides?.[targetSide]?.spirit });
    const directionState = state.directions?.[direction] ?? {};
    const targetMark = state.marks?.[targetSide]?.negative;
    const context = linkedNegativeStatusContext(state, sourceSide, {
      targetPoisonMarkStacks: targetMark?.id === "poison" ? whole(targetMark.stacks) : 0,
      ...directionState.context,
      ...(entry && typeof entry === "object" ? entry.context : {}),
    });
    const evaluations = sourceTraits.map((trait) => ({ trait,
      evaluation: getS5PreviewTraitEvaluation(trait, "attacker", context, { skill }),
    })).filter(({ evaluation }) => evaluation?.calcStatus === "ready" && evaluation.effects.length);
    if (!evaluations.length) { cache.set(raw, raw); return raw; }

    const useCount = whole(directionState.context?.negativeStatusUseCountsBySlot?.[state.mode === "four" ? index + 1 : "single"]);
    const canApplyNative = shouldPreviewNegativeStatusApplications({ enabled: true, result: base, skill, useCount });
    const currentCost = base.skillCost == null || base.skillCost === "" ? Number.NaN : Number(base.skillCost);
    const potential = resolveNegativeStatusApplications({
      baselineStatuses: state.negativeStatuses?.[targetSide], context, effectiveHitCount: base.hitCount,
      selectedSkills: (configuredSide?.skills?.four ?? []).map((value) => skills.get(skillId(value))).filter(Boolean),
      skill: Number.isFinite(currentCost) ? { ...skill, cost: currentCost } : skill,
      skillIndex: index, traits: sourceTraits,
    });
    const nativeStatusUse = hasNativeStatusUse(skill, potential) ||
      (["status", "defense"].includes(skill.category) && base.negativeStatusCanApply === true);
    const application = canApplyNative ? {
      ...potential, stacks: { ...potential.stacks }, sources: potential.sources.map((source) => ({ ...source, stacks: { ...source.stacks } })),
    } : { sources: [], special: null, stacks: normalizeNegativeStatusSide({}) };
    const notes = [];
    const effects = [];
    let applicationsChanged = false;
    for (const { trait, evaluation } of evaluations) {
      const note = (effect, text) => {
        effects.push({ ...effect, traitId: trait.id });
        notes.push({ traitId: trait.id, status: "applied", timing: effect.timing, text });
      };
      for (const effect of evaluation.effects) {
        if (effect.target && effect.target !== "opponent") continue;
        if (effect.kind === "status-add" && effect.timing === "after-skill") {
          if (effect.requiredSkillType && effect.requiredSkillType !== skill.type) continue;
          // Native state skills share the existing use/cancel counter. A stale
          // manual confirmation must never revive a cancelled application.
          if (nativeStatusUse && useCount === 0) continue;
          // A manual-only S5 effect can confirm a non-attack without inventing
          // a native activation button for the underlying skill.
          const statusUse = ["status", "defense"].includes(skill.category) &&
            (useCount > 0 || Boolean(effect.confirmedSource));
          if (base.status !== "exact" && !(statusUse && base.reason === "非伤害技能不计算伤害")) continue;
          if (!Object.hasOwn(application.stacks, effect.status) || whole(effect.stacks) === 0) continue;
          application.stacks[effect.status] = Math.min(99, whole(application.stacks[effect.status]) + whole(effect.stacks));
          application.sources.push({ kind: "trait", name: trait.displayName ?? trait.name, traitId: trait.id,
            timing: "after-skill", stacks: { [effect.status]: whole(effect.stacks) } });
          applicationsChanged = true;
          effects.push({ ...effect, traitId: trait.id });
        } else if (effect.kind === "weather-state") {
          note(effect, `雪天已确认触发，剩余${whole(effect.remainingTurns)}回合（已同步全场暴风雪）`);
        } else if (effect.kind === "next-grass-cost-discount") {
          note(effect, skill.type === "草" ? "本次草系技能能耗-3（已计入实际能耗）" : "下次行动草系技能能耗-3待生效；非草行动也消耗机会");
        } else if (effect.kind === "random-donation-pending" && (!effect.requiredSkillType || effect.requiredSkillType === skill.type)) {
          note(effect, "草系随机奉献1层：实际结果待确认，未计入增益");
        }
      }
    }
    if (!applicationsChanged && !notes.length) { cache.set(raw, raw); return raw; }
    const promoted = applicationsChanged && base.status !== "exact";
    const result = { ...base,
      ...(promoted ? { status: "exact", reason: null, statusOnly: true, totalDamage: 0, hpPercent: 0, lethal: false } : {}),
      traitSettlements: [...(base.traitSettlements ?? []), ...notes], s5Effects: effects,
    };
    if (applicationsChanged) {
      result.negativeStatusApplications = application;
      result.negativeStatusSettlement = calculateNegativeStatusSettlement({
        applications: application.stacks, attacker: combatSide(view, state, sourceSide),
        defender: combatSide(view, state, targetSide), directDamage: result.totalDamage,
        enabled: result.status === "exact", statuses: state.negativeStatuses?.[targetSide],
        modifiers: { ...statusModifiers(sourceTraits, targetTraits),
          burnImmediateTriggers: application.special === "double-burn-and-trigger" ? 1 : 0 },
        thunderWeather: context.weatherThunder === true, typeChart: snapshot.typeChart,
      });
      // These confirmations cover this use only. Retaining the old second-turn
      // projection would replay a different application without confirmation.
      result.negativeStatusCanRepeatNextTurn = false;
      result.negativeStatusRepeatNextTurn = false;
    }
    Object.defineProperty(result, ORIGINAL_RESULT, { value: base });
    changed = true;
    cache.set(raw, result);
    return result;
  }

  function directionResults(value, direction) {
    if (!value) return value;
    const rows = value.results?.map((result, index) => project(result, direction, index));
    const selectedIndex = state.mode === "four" ? whole(state.directions?.[direction]?.selectedSkillIndex) : 0;
    const selected = !["trait", "bloodline"].includes(state.directions?.[direction]?.selectedDamageSource)
      ? project(value.selectedResult, direction, selectedIndex) : value.selectedResult;
    return { ...value, ...(rows ? { results: rows } : {}), selectedResult: selected };
  }
  const calculation = Object.fromEntries(Object.entries(view.calculation ?? {}).map(([key, value]) =>
    [key, caches[key] ? directionResults(value, key) : value]));
  const skillResultsByDirection = Object.fromEntries(Object.entries(view.skillResultsByDirection ?? {}).map(([key, rows]) =>
    [key, caches[key] ? rows.map((row, index) => project(row, key, index)) : rows]));
  const result = directionResults(view.result, activeDirection);
  if (result?.skillResults && result.results) result.skillResults = result.skillResults.map((summary, index) => {
    const row = result.results[index];
    if (!row) return summary;
    return { ...summary, damage: row.totalDamage, hpPercent: row.hpPercent,
      negativeStatusSettlement: row.negativeStatusSettlement, statusOnly: row.statusOnly === true };
  });
  return changed ? { ...view, calculation, skillResultsByDirection, result } : view;
}
