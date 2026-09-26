import { calculateMatchup } from "./calculate.js";
import { getNature, getNatureMultipliers, STAT_LABELS } from "./natures.js";
import { normalizeMarksState, starfallStacksFromMarkSlot } from "./marks.js";
import { calculateFreezeThreshold, normalizeNegativeStatusSide } from "./negative-status.js";
import { calculateAllPanelStats, hasCompleteRaceStats } from "./stat.js";
import { getSnapshotIndexes } from "./snapshot-indexes.js";
import { resolvePowerOverride } from "./power-override.js";
import { chooseDefaultSkillIds } from "./skill-loadout.js";
import { skillEntriesForMode, resolveSkillEntity } from "./skill-result/loadout.js";
import { createInitialState } from "../state/defaults.js";
import { materializeTraitContext } from "../state/trait-values.js";
import { STANDARD_DURABILITY_TEMPLATES } from "../features/team-ability/domain/durability-ranking.js";
import { resolveSpiritFormRole } from "../features/team-ability/domain/spirit-form-role.js";

export { STANDARD_DURABILITY_TEMPLATES };
const HP_ONLY_DISPLAY_IVS = Object.freeze({ ...STANDARD_DURABILITY_TEMPLATES["standard-hp-v1"].displayIvs, physicalDefense: 0, magicalDefense: 0 });
export const DAMAGE_COMPARISON_TEMPLATES = Object.freeze({
  "standard-hp-v1": Object.freeze({ ...STANDARD_DURABILITY_TEMPLATES["standard-hp-v1"], label: "生命性格满双防个体" }),
  "hp-only-v1": Object.freeze({ id: "hp-only-v1", label: "生命性格无双防个体", level: 60, natureId: "grounded", displayIvs: HP_ONLY_DISPLAY_IVS }),
  "neutral-hp-only-v1": Object.freeze({ id: "neutral-hp-only-v1", label: "中立性格生命个体", level: 60, natureId: "neutral", displayIvs: HP_ONLY_DISPLAY_IVS }),
  "current-defense": Object.freeze({ id: "current-defense", label: "当前防守方配点", level: 60 }),
  "user-presets": Object.freeze({ id: "user-presets", label: "用户预设", level: 60 }),
});
export const DAMAGE_COMPARISON_SCOPE = "统一模板 · 不计防守特性 · 仅本次直接伤害";
export const DAMAGE_COMPARISON_IMPORT_NOTICE = "已启用该精灵特性，结果可能与榜单不同";
export const DAMAGE_COMPARISON_FILTERS = [["all", "全部"], ["half", "低于50%"], ["survive", "未击倒"], ["ko", "可击倒"]];

export function getDamageComparisonTemplates(presetsBySpirit = {}) {
  return Object.values(DAMAGE_COMPARISON_TEMPLATES).filter((template) => template.id !== "user-presets" || Object.keys(presetsBySpirit).length > 0);
}

export function getDamageComparisonTemplate(state, direction, templateId, presetsBySpirit = {}, spiritId) {
  const template = DAMAGE_COMPARISON_TEMPLATES[templateId];
  if (!template) throw new TypeError("未知耐久模板");
  if (templateId === "user-presets") {
    if (!spiritId) return template;
    const preset = presetsBySpirit[spiritId];
    if (!preset) return { ...DAMAGE_COMPARISON_TEMPLATES["neutral-hp-only-v1"], ...template, presetFallback: true };
    return { ...template, natureId: getNature(preset.natureId).id, displayIvs: { ...preset.displayIvs } };
  }
  if (templateId !== "current-defense") return template;
  const target = state.sides[direction === "reverse" ? "attacker" : "defender"];
  return { ...template, natureId: getNature(target.nature).id, displayIvs: { ...target.displayIvs } };
}

export function describeDamageComparisonTemplate(template) {
  if (template.id === "user-presets" && !template.displayIvs) return "各自用户预设，未配置按中立性格、生命60、双防0个体";
  if (template.presetFallback) return "未配置预设，使用默认分配：60级 · 中立性格 · 生命60个体，双防及其余0";
  const ivs = Object.entries(STAT_LABELS).filter(([key]) => Number(template.displayIvs[key]) > 0)
    .map(([key, label]) => `${label}${template.displayIvs[key]}`);
  return `60级 · ${getNature(template.natureId).name} · ${ivs.length ? `${ivs.join("／")}个体${ivs.length < 6 ? "，其余0" : ""}` : "全部0个体"}`;
}

export function getDamageComparisonTargetStatuses(state, direction = "forward") {
  const target = direction === "reverse" ? "attacker" : "defender";
  return {
    starfall: starfallStacksFromMarkSlot(normalizeMarksState(state.marks, state.directions)[target].negative),
    freeze: normalizeNegativeStatusSide(state.negativeStatuses?.[target]).freeze,
  };
}

// 原目标的状态和手动防御/克制覆盖不能成为所有候选的共同属性。
const TARGET_KEYS = new Set([
  "currentHp", "currentHpPercent", "defenseLevelStage", "magicalDefenseLevelStageAdd",
  "typeMultiplier", "typeEffectiveness", "typeEffectivenessMultiplier", "attackDefenseLevelMultiplier",
  "reduction", "activeDefenseStatus", "starfallStacks", "negativeStatusStacks", "negativeStatusUseCountsBySlot",
  "burnStacks", "poisonStacks", "freezeStacks", "parasitismStacks", "electrifiedStacks",
]);

function cleanTargetValues(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cleanTargetValues);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key.split(".").some((part) => part.startsWith("enemyTotalSkillCost")) || !key.split(".").some((part) => TARGET_KEYS.has(part) || /^(defender|target|enemy)/u.test(part)))
    .map(([key, entry]) => [key, cleanTargetValues(entry)]));
}

export function getDamageComparisonLoadout(snapshot, spirit, templateId, presetsBySpirit = {}) {
  const preset = templateId === "user-presets" ? presetsBySpirit[spirit.id] : null;
  const four = chooseDefaultSkillIds(snapshot, spirit.id);
  return JSON.parse(JSON.stringify({
    skills: preset?.skills ?? { four, single: four.find(Boolean) ?? null },
    traitValues: preset?.traitValues ?? {},
  }));
}

export function describeDamageComparisonLoadout(snapshot, spirit, templateId, presetsBySpirit = {}) {
  const { skills } = getDamageComparisonLoadout(snapshot, spirit, templateId, presetsBySpirit);
  const indexes = getSnapshotIndexes(snapshot);
  const names = (skills.four ?? []).map((entry) => resolveSkillEntity(entry, indexes.skills)?.name ?? "空位");
  const preset = templateId === "user-presets" && presetsBySpirit[spirit.id]?.skills;
  return `${preset ? "预设配招" : "默认配招"}：${names.join("／") || "无"}`;
}

export function getDamageComparisonSelection(snapshot, state, direction = "forward", selectedSkillIndex) {
  const sourceSide = direction === "reverse" ? "defender" : "attacker";
  const side = state.sides[sourceSide];
  const indexes = getSnapshotIndexes(snapshot);
  const options = skillEntriesForMode(side, state.mode).map((entry, index) => ({
    entry, index, skill: resolveSkillEntity(entry, indexes.skills),
  })).filter((option) => option.skill);
  const index = state.mode === "four" ? selectedSkillIndex ?? state.directions[direction].selectedSkillIndex ?? 0 : 0;
  return { sourceSide, spirit: indexes.spirits[side.spiritId], options, selected: options.find((option) => option.index === index), index };
}

export function damageComparisonIssue(snapshot, state, direction = "forward", selectedSkillIndex) {
  const { spirit, selected } = getDamageComparisonSelection(snapshot, state, direction, selectedSkillIndex);
  if (!spirit || !hasCompleteRaceStats(spirit.raceStats)) return "请先选择种族值完整的攻击方";
  if (!selected) return "请先选择要比较的技能";
  const { skill, entry } = selected;
  const details = typeof entry === "object" ? entry : {};
  const overrides = state.mode === "single" ? state.directions[direction].overrides ?? {} : {};
  const power = resolvePowerOverride({
    current: details.overrides?.powerOverride ?? details.powerOverride ?? overrides.powerOverride,
    legacyBasePower: details.overrides?.basePower ?? details.basePowerOverride ?? overrides.basePower,
    legacyDisplayedPower: details.overrides?.displayedPower ?? overrides.displayedPower,
    legacyPowerMode: details.overrides?.powerMode ?? overrides.powerMode,
  });
  if (power.mode === "panel") return "显示威力已手动锁定，请先恢复自动计算或改用静态威力";
  if (skill.name === "听桥" || ["enemy_total_skill_cost_power", "enemy_skill_power_multiplier"].includes(skill.ruleId)) {
    return "该技能依赖对手配招或出招，请在主计算器指定对手后复算";
  }
  return null;
}

export function buildDamageComparisonInput({ snapshot, state, spirit, direction = "forward", selectedSkillIndex, templateId = "standard-hp-v1", presetsBySpirit = {}, inheritTargetStatuses = false, ignoreTraits = true }) {
  const template = getDamageComparisonTemplate(state, direction, templateId, presetsBySpirit, spirit.id);
  const { sourceSide, index } = getDamageComparisonSelection(snapshot, state, direction, selectedSkillIndex);
  const targetSide = sourceSide === "attacker" ? "defender" : "attacker";
  const other = direction === "forward" ? "reverse" : "forward";
  const initial = createInitialState(snapshot);
  const source = state.sides[sourceSide];
  const attackDirection = state.directions[direction];
  const statuses = inheritTargetStatuses ? getDamageComparisonTargetStatuses(state, direction) : { starfall: 0, freeze: 0 };
  const context = cleanTargetValues({
    ...materializeTraitContext(source.traitValues, snapshot, source.spiritId, "attacker"),
    ...attackDirection.context,
  });
  const weather = Object.fromEntries(Object.entries(context).filter(([key]) => key.startsWith("weather")));
  // 共享核心直接读取技能条件；仅复制状态对象不会让冻结联动生效。
  if (inheritTargetStatuses) {
    context.enemyFreezeStacks = statuses.freeze;
    context.enemyFrozen = statuses.freeze > 0;
  }
  const panelStats = calculateAllPanelStats({ raceStats: spirit.raceStats, displayIvs: template.displayIvs, natureMultipliers: getNatureMultipliers(template.natureId) });
  return {
    ...state,
    level: 60,
    calculationOptions: { ...state.calculationOptions, includeNegativeStatusSettlement: false },
    marks: { ...initial.marks, [sourceSide]: state.marks?.[sourceSide] ?? initial.marks[sourceSide],
      [targetSide]: { ...initial.marks[targetSide], negative: statuses.starfall > 0 ? { id: "starfall", stacks: statuses.starfall } : initial.marks[targetSide].negative } },
    negativeStatuses: { ...initial.negativeStatuses, [sourceSide]: state.negativeStatuses?.[sourceSide] ?? initial.negativeStatuses[sourceSide],
      [targetSide]: { ...initial.negativeStatuses[targetSide], freeze: statuses.freeze } },
    sides: {
      ...state.sides,
      [sourceSide]: { ...source, natureMultipliers: getNatureMultipliers(source.nature), skills: cleanTargetValues(source.skills) },
      [targetSide]: { ...initial.sides[targetSide], spiritId: spirit.id, nature: template.natureId, displayIvs: { ...template.displayIvs }, panelStats, ignoreTraits, ...getDamageComparisonLoadout(snapshot, spirit, templateId, presetsBySpirit) },
    },
    directions: {
      [direction]: { ...cleanTargetValues(attackDirection), context, currentHp: panelStats.hp, reduction: 1, starfallStacks: statuses.starfall, selectedSkillIndex: index, selectedDamageSource: "skill" },
      [other]: { ...initial.directions[other], currentHp: state.directions[other].currentHp, context: { ...weather, currentHpPercent: state.directions[other].context?.currentHpPercent } },
    },
  };
}

function compareIdentity(a, b) {
  return String(a.spirit.dexNo ?? "").localeCompare(String(b.spirit.dexNo ?? ""), "zh-CN", { numeric: true })
    || a.spirit.fullName.localeCompare(b.spirit.fullName, "zh-CN") || a.spirit.id.localeCompare(b.spirit.id);
}

export function filterSkillDamageRanking(rows, { query = "", filter = "all", descending = false } = {}) {
  const normalized = String(query).normalize("NFKC").toLowerCase().trim();
  const coveredHp100 = (row) => row.damage * 100 + (row.freezePercent ?? 0) * row.panelStats.hp;
  return [...rows].sort((a, b) => (descending ? b.percent - a.percent : a.percent - b.percent) || compareIdentity(a, b))
    .map((row, index) => ({ ...row, rank: index + 1 }))
    .filter((row) => ((Array.isArray(filter) && coveredHp100(row) >= filter[0] * row.panelStats.hp && (filter[1] === null || coveredHp100(row) < filter[1] * row.panelStats.hp)) || filter === "all" || (filter === "half" && coveredHp100(row) < 50 * row.panelStats.hp)
      || (filter === "survive" && !row.lethal) || (filter === "ko" && row.lethal))
      && (!normalized || [row.spirit.fullName, row.spirit.baseName, row.spirit.dexNo, row.spirit.searchText, ...(row.spirit.aliases ?? [])]
        .some((value) => String(value ?? "").normalize("NFKC").toLowerCase().includes(normalized))));
}

export async function createSkillDamageRanking({ snapshot, state, direction = "forward", selectedSkillIndex, templateId = "standard-hp-v1", presetsBySpirit = {}, inheritTargetStatuses = false, scope = "final", signal, onProgress } = {}) {
  const issue = damageComparisonIssue(snapshot, state, direction, selectedSkillIndex);
  const selection = getDamageComparisonSelection(snapshot, state, direction, selectedSkillIndex);
  const template = getDamageComparisonTemplate(state, direction, templateId);
  const rows = [], excluded = [];
  if (issue) return { rows, excluded, template, issue };
  const spirits = snapshot.spirits ?? [];
  for (let index = 0; index < spirits.length; index += 1) {
    if (signal?.aborted) return null;
    const spirit = spirits[index];
    const form = resolveSpiritFormRole(spirit, { spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter });
    let reason = !hasCompleteRaceStats(spirit.raceStats) ? "种族值不完整"
      : scope !== "all" && !["final", "boss"].includes(form.formRole) ? "不在当前形态范围" : null;
    if (!reason) {
      try {
        const input = buildDamageComparisonInput({ snapshot, state, spirit, direction, selectedSkillIndex, templateId, presetsBySpirit, inheritTargetStatuses });
        const targetSide = direction === "reverse" ? "attacker" : "defender";
        const result = calculateMatchup(snapshot, input)[direction].selectedResult;
        if (result?.status !== "exact" || !Number.isFinite(result.totalDamage)) reason = result?.reason || "无直接伤害或缺少计算条件";
        else if (["status", "defense"].includes(selection.selected.skill.category) && result.totalDamage === 0) reason = "该技能无直接伤害";
        else {
          const panelStats = input.sides[targetSide].panelStats;
          const freeze = calculateFreezeThreshold({ maxHp: panelStats.hp, stacks: input.negativeStatuses[targetSide].freeze, types: spirit.types });
          const damagePercent = result.totalDamage / panelStats.hp * 100;
          const remainingAfterDirect = Math.max(0, panelStats.hp - result.totalDamage);
          const freezeLethal = remainingAfterDirect > 0 && freeze.thresholdHp > 0 && remainingAfterDirect <= freeze.thresholdHp;
          const lethal = remainingAfterDirect === 0 || freezeLethal;
          rows.push({ spirit, panelStats, template: getDamageComparisonTemplate(state, direction, templateId, presetsBySpirit, spirit.id), damage: result.totalDamage, damagePercent, percent: damagePercent + freeze.thresholdPercent,
            freezePercent: freeze.thresholdPercent, freezeThresholdHp: freeze.thresholdHp, freezeImmune: freeze.immune, freezeLethal,
            remainingAfterDirect, remainingHp: lethal ? 0 : remainingAfterDirect, lethal,
            formRole: form.formRole, result });
        }
      } catch (error) { reason = error.message || "当前条件无法计算"; }
    }
    if (reason) excluded.push({ spirit, reason });
    if ((index + 1) % 12 === 0) {
      onProgress?.({ completed: index + 1, total: spirits.length });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (signal?.aborted) return null;
  return { rows: filterSkillDamageRanking(rows), excluded, template, issue: null };
}
