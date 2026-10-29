import { calculateMatchup } from "./calculate.js";
import { withS5PreviewBattleLevels } from "./battle-level.js";
import { asResultRailModel, buildCombatState, getSpirit } from "./calculator-view-model.js";
import { getEffectiveTraits } from "./effective-traits.js";
import { getNatureMultipliers } from "./natures.js";
import { normalizeMarksState, starfallStacksFromMarkSlot } from "./marks.js";
import { hasCompleteRaceStats } from "./stat.js";
import { getSnapshotIndexes } from "./snapshot-indexes.js";
import { buildDamageComparisonInput, getDamageComparisonSelection } from "./skill-damage-ranking.js";
import { resolveSpiritFormRole } from "../features/team-ability/domain/spirit-form-role.js";

const ZERO_IVS = { hp: 0, physicalAttack: 0, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0, speed: 0 };
export const STARFALL_TEMPLATES = Object.freeze([
  { id: "hp", label: "生命", nature: "neutral", displayIvs: { ...ZERO_IVS, hp: 60 } },
  { id: "defense", label: "生防", nature: "neutral", displayIvs: { ...ZERO_IVS, hp: 60, physicalDefense: 60, magicalDefense: 60 } },
  { id: "tank", label: "纯肉", nature: "grounded", displayIvs: { ...ZERO_IVS, hp: 60, physicalDefense: 60, magicalDefense: 60 } },
].map((template) => Object.freeze({ ...template, displayIvs: Object.freeze(template.displayIvs) })));

export function getStarfallSelection(snapshot, state, direction = "forward", selectedSkillIndex) {
  if (!["forward", "reverse"].includes(direction) || !state?.sides || !state?.directions) return null;
  const selection = getDamageComparisonSelection(snapshot, state, direction, selectedSkillIndex);
  const targetSide = selection.sourceSide === "attacker" ? "defender" : "attacker";
  return { ...selection, direction, targetSide, spirit: getSpirit(snapshot, state.sides[selection.sourceSide]),
    targetSpirit: getSpirit(snapshot, state.sides[targetSide]) };
}

export function getCurrentStarfallStacks(state, direction = "forward") {
  const target = direction === "reverse" ? "attacker" : "defender";
  if (!state?.directions) return 0;
  if (!state.marks?.[target]) return Math.min(99, Math.max(0, Math.floor(Number(state.directions[direction]?.starfallStacks) || 0)));
  return starfallStacksFromMarkSlot(normalizeMarksState(state.marks, state.directions)[target].negative);
}

function validStacks(value) {
  return value !== null && value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99;
}

// An explicit zero mark suppresses old direction.starfallStacks fallbacks as well.
export function withStarfallStacks(state, direction, stacks, selectedSkillIndex) {
  if (!validStacks(stacks)) throw new RangeError("星陨层数须为0至99的整数");
  const targetSide = direction === "reverse" ? "attacker" : "defender";
  return { ...state,
    marks: { ...state.marks, [targetSide]: { ...state.marks?.[targetSide], negative: { id: "starfall", stacks: Number(stacks) } } },
    directions: { ...state.directions, [direction]: { ...state.directions[direction], starfallStacks: Number(stacks),
      ...(selectedSkillIndex == null ? {} : { selectedSkillIndex }), selectedDamageSource: "skill" } },
  };
}

export function getStarfallDefenseLimitations(snapshot, side) {
  const spirit = getSpirit(snapshot, side);
  return [...new Set(getEffectiveTraits(snapshot, { ...side, spirit }).filter((trait) =>
    ["不死鸟", "化茧"].includes(trait.name) || /致命伤害.{0,24}(保留|免疫)/u.test(trait.description ?? ""),
  ).map((trait) => trait.displayName ?? trait.name))];
}

function invalidEvaluation(stacks, reason) {
  return { status: "invalid", stacks, reason, limitations: [], damage: null, directDamage: null, statusDamage: 0,
    percent: null, maxHp: null, targetHp: null, remainingHp: null, lethal: null, freezePercent: 0, freezeThresholdHp: 0, freezeLethal: false };
}

function selectionIssue(selection) {
  if (!selection?.spirit || !selection.targetSpirit) return "请选择双方精灵";
  if (![selection.spirit, selection.targetSpirit].every((spirit) => hasCompleteRaceStats(spirit.raceStats))) return "种族值待确认";
  if (!selection.selected || !Number.isInteger(selection.index)) return "请选择要计算的技能";
  return null;
}

export function evaluateStarfallAt({ snapshot, state, direction = "forward", selectedSkillIndex, stacks } = {}) {
  const count = stacks === undefined ? getCurrentStarfallStacks(state, direction) : stacks;
  if (!validStacks(count)) return invalidEvaluation(count, "星陨层数须为0至99的整数");
  try {
    const selection = getStarfallSelection(snapshot, state, direction, selectedSkillIndex);
    const issue = selectionIssue(selection);
    if (issue) return invalidEvaluation(Number(count), issue);
    const input = withS5PreviewBattleLevels(snapshot, withStarfallStacks(state, direction, count, selection.index));
    const calculation = calculateMatchup(snapshot, buildCombatState(input, snapshot.meta?.serverId));
    const displayed = asResultRailModel({ snapshot, state: input, calculation, direction, includeTurnPreview: false });
    const result = displayed.selectedResult;
    const warnings = result?.warnings ?? [];
    const survivalLimitations = getStarfallDefenseLimitations(snapshot, input.sides[selection.targetSide]);
    const limitations = [...new Set([...survivalLimitations, ...warnings])];
    const exact = result?.status === "exact" && Number.isFinite(result.totalDamage);
    const targetHp = displayed.defenderHp;
    if (!(targetHp > 0)) return invalidEvaluation(Number(count), "目标已无生命");
    if (!exact) {
      const reason = result?.reason || "当前条件尚不能精确计算";
      return { ...invalidEvaluation(Number(count), reason), status: reason === "非伤害技能不计算伤害" ? "invalid" : "uncertain",
        maxHp: displayed.defenderMaxHp, targetHp, limitations };
    }
    const settlement = result.negativeStatusSettlement;
    const directDamage = result.totalDamage;
    const statusDamage = 0;
    const remainingAfterDirect = Math.max(0, targetHp - directDamage);
    const freezeThresholdHp = Number(settlement?.freeze?.thresholdHp) || 0;
    // Freeze is a KO predicate; its HP threshold must never be added to damage.
    const freezeLethal = remainingAfterDirect > 0 && freezeThresholdHp > 0 && !settlement?.freeze?.immune && remainingAfterDirect <= freezeThresholdHp;
    const uncertain = limitations.length > 0;
    const lethal = remainingAfterDirect === 0 || freezeLethal;
    const freezePercent = settlement?.freeze?.immune ? 0 : Number(settlement?.freeze?.thresholdPercent) || 0;
    return { status: uncertain ? "uncertain" : "exact", stacks: Number(count),
      damage: directDamage, directDamage, statusDamage, percent: directDamage / displayed.defenderMaxHp * 100 + freezePercent,
      maxHp: displayed.defenderMaxHp, targetHp, remainingHp: uncertain ? null : lethal ? 0 : remainingAfterDirect,
      lethal: uncertain ? null : lethal, freezePercent, freezeThresholdHp, freezeLethal,
      reason: uncertain ? [...(survivalLimitations.length ? [`${survivalLimitations.join("、")}的存活效果尚未完整计入`] : []), ...warnings].join("；") : null,
      limitations, warnings,
    };
  } catch (error) {
    return invalidEvaluation(Number(count), error.message || "当前输入无法计算");
  }
}

function thresholdResult(status, current, threshold = null, reason = null, limitations = []) {
  return { status, minimum: status === "found" ? threshold.stacks : null, current, threshold,
    reason: reason ?? (status === "found" ? null : current?.reason) ?? null, limitations: [...new Set(limitations.length ? limitations : status === "found" ? threshold?.limitations ?? [] : current?.limitations ?? [])] };
}

// The generator lets the batch runner yield/cancel between individual layers.
// Ascending enumeration handles non-monotonic conditions and includes 0.
function* thresholdSteps(options) {
  const current = evaluateStarfallAt(options);
  yield;
  if (current.status === "invalid") return thresholdResult("invalid", current);
  for (let stacks = 0; stacks <= 99; stacks += 1) {
    const entry = stacks === current.stacks ? current : evaluateStarfallAt({ ...options, stacks });
    yield;
    if (entry.status === "invalid") return thresholdResult("invalid", current, null, entry.reason);
    // The first unresolved lower layer already prevents a proven minimum.
    if (entry.status === "uncertain") return thresholdResult("uncertain", current, null, entry.reason, entry.limitations);
    if (entry.lethal) return thresholdResult("found", current, entry);
  }
  return thresholdResult("unreachable", current, null, "0至99层内未达击倒条件");
}

export function findStarfallThreshold(options) {
  const scan = thresholdSteps(options);
  let step = scan.next();
  while (!step.done) step = scan.next();
  return step.value;
}

export function buildStarfallTemplateState({ snapshot, state, spiritId, templateId, direction = "forward", selectedSkillIndex, ignoreTraits = true }) {
  const template = STARFALL_TEMPLATES.find((entry) => entry.id === templateId);
  const spirit = getSnapshotIndexes(snapshot).spirits[spiritId];
  if (!template || !spirit || !hasCompleteRaceStats(spirit.raceStats)) throw new TypeError("目标或培养模板无效");
  const targetSide = direction === "reverse" ? "attacker" : "defender";
  const templateState = { ...state, sides: { ...state.sides, [targetSide]: { ...state.sides[targetSide], nature: template.nature, displayIvs: { ...template.displayIvs } } } };
  const input = buildDamageComparisonInput({ snapshot, state: templateState, spirit, direction, selectedSkillIndex, templateId: "current-defense", ignoreTraits });
  // Clear existing target statuses, while applying the user's selected settlement
  // option to statuses caused by this attack, exactly as the main calculator does.
  input.calculationOptions = { ...state.calculationOptions };
  input.sides[targetSide].natureMultipliers = getNatureMultipliers(template.nature);
  return withStarfallStacks(input, direction, 0, input.directions[direction].selectedSkillIndex);
}

export async function createStarfallThresholdRanking({ snapshot, state, direction = "forward", selectedSkillIndex, scope = "final", signal, onProgress } = {}) {
  const rows = [], excluded = [];
  let selection;
  try { selection = getStarfallSelection(snapshot, state, direction, selectedSkillIndex); }
  catch (error) { return { rows, excluded, issue: error.message }; }
  const issue = selectionIssue(selection);
  if (issue) return { rows, excluded, issue };
  const currentStacks = getCurrentStarfallStacks(state, direction);
  const catalog = snapshot.spirits ?? [];
  const first = catalog.find((spirit) => spirit.id === selection.targetSpirit.id);
  const spirits = first ? [first, ...catalog.filter((spirit) => spirit.id !== first.id)] : catalog;
  let sliceStart = performance.now();
  let lastProgress = sliceStart;
  async function checkpoint() {
    if (signal?.aborted) return false;
    if (performance.now() - sliceStart >= 12) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
    return !signal?.aborted;
  }
  for (let index = 0; index < spirits.length; index += 1) {
    if (!await checkpoint()) return null;
    const spirit = spirits[index];
    const role = resolveSpiritFormRole(spirit, { spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter });
    const reason = !hasCompleteRaceStats(spirit.raceStats) ? "种族值不完整"
      : scope !== "all" && !["final", "boss"].includes(role.formRole) ? "不在当前形态范围" : null;
    if (reason) excluded.push({ spirit, reason });
    else {
      const templates = [];
      for (const template of STARFALL_TEMPLATES) {
        let prepared;
        try { prepared = buildStarfallTemplateState({ snapshot, state, spiritId: spirit.id, templateId: template.id, direction, selectedSkillIndex }); }
        catch (error) { templates.push({ templateId: template.id, ...thresholdResult("invalid", null, null, error.message) }); continue; }
        const scan = thresholdSteps({ snapshot, state: prepared, direction, selectedSkillIndex, stacks: currentStacks });
        let step = scan.next();
        while (!step.done) {
          if (!await checkpoint()) return null;
          step = scan.next();
        }
        templates.push({ templateId: template.id, ...step.value });
      }
      rows.push({ spirit, formRole: role.formRole, templates });
    }
    const now = performance.now();
    if (index === 0 || index === spirits.length - 1 || now - lastProgress >= 100) {
      onProgress?.({ completed: index + 1, total: spirits.length, rows: [...rows] });
      lastProgress = now;
    }
  }
  return signal?.aborted ? null : { rows, excluded, issue: null };
}
