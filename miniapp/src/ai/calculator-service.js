import { createInitialState } from "../shared/state/defaults.js";
import { selectSingleSkill, rememberSingleSkill } from "../shared/state/calculator-session.js";
import { getTraitView } from "../shared/domain/calculator-view-model.js";
import { NATURES } from "../shared/domain/natures.js";
import { supportsS5PreviewBattleLevel, resolveS5PreviewBattleLevel } from "../shared/domain/battle-level.js";
import { canonicalTraitControlKey } from "../shared/state/trait-values.js";
import { normalizeTriggerControls } from "../shared/domain/trigger-controls.js";
import { withMiniappBattleLevelDefaults } from "../state/battle-level-defaults.js";
import { buildCombatState } from "../shared/build-combat-state.js";
import { createCalculationView } from "../view-models/calculation.js";
import { createCombatantView } from "../view-models/combatant.js";
import { getSkillInputs } from "../view-models/skills.js";

const DAMAGE_CATEGORIES = new Set(["physical", "magical", "dual"]);
const SEARCH_FIELDS = new Set(["kind", "query", "spiritId", "limit"]);
const CALCULATION_FIELDS = new Set([
  "attacker", "defender", "skill", "attackerNature", "defenderNature",
  "attackerLevel", "defenderLevel", "attackerHpPercent", "defenderHpPercent",
  "attackStage", "defenseStage", "skillValues",
]);

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.aiDetails = { code, message, ...details };
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_parameters", `${label}必须是对象`);
  }
  // WeChat passes JSON objects from another realm, with a distinct Object.prototype.
  const prototype = Object.getPrototypeOf(value);
  const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (prototype !== null && (Object.getPrototypeOf(prototype) !== null ||
      typeof constructor !== "function" || constructor.name !== "Object")) {
    fail("invalid_parameters", `${label}必须是对象`);
  }
  return value;
}

function parameters(value, allowed) {
  record(value, "参数");
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) fail("unknown_parameter", `不支持的参数：${unknown.join("、")}`);
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    fail("invalid_parameters", `${label}须为非空字符串，最多120字`);
  }
  return value.trim();
}

function numeric(value, label, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max ||
      (integer && !Number.isInteger(value))) {
    fail("invalid_parameters", `${label}须为${min}至${max}的${integer ? "整数" : "数字"}`);
  }
  return value;
}

const nameOf = entry => entry.fullName ?? entry.name ?? entry.id;
const identity = entry => ({ id: entry.id, name: nameOf(entry) });
const namesOf = entry => [entry.fullName, entry.name].filter(Boolean);
const defaulted = (value, fallback) => value === undefined ? fallback : value;

function resolveEntity(entries, value, label) {
  const query = text(value, label);
  const byId = entries.find(entry => entry.id === query);
  if (byId) return byId;
  const matches = entries.filter(entry => namesOf(entry).includes(query));
  const namedForms = entries.filter(entry => namesOf(entry).some(name =>
    name.startsWith(`${query}（`) || name.startsWith(`${query}(`)));
  if (matches.length === 1 && namedForms.length === 0) return matches[0];
  const candidates = matches.length ? [...new Set([...matches, ...namedForms])] : entries.filter(entry =>
    namesOf(entry).some(name => name.includes(query))).slice(0, 12);
  fail(matches.length > 1 || candidates.length ? "ambiguous_entity" : "not_found",
    candidates.length ? `${label}需提供唯一完整名称或ID，请确认具体形态` : `未收录${label}：${query}`,
    { candidates: candidates.map(identity) });
}

function nature(value) {
  if (value === undefined) return NATURES[0];
  const query = text(value, "性格");
  const found = NATURES.find(entry => entry.id === query || entry.name === query);
  if (!found) fail("invalid_nature", `未收录性格：${query}`, { natures: NATURES.map(identity) });
  return found;
}

function controlsFor(snapshot, skill, spirit) {
  const needsPosition = spirit?.traitIds?.some(id => snapshot.traits?.some(trait =>
    trait.id === id && trait.name === "向心力"));
  const extra = needsPosition && DAMAGE_CATEGORIES.has(skill.category)
    ? [{ contextKey: "skillPosition", label: "技能位置", type: "number", min: 1, max: 4 }]
    : [];
  return normalizeTriggerControls(getSkillInputs(skill, extra), { source: "skill" });
}

function controlMetadata(control) {
  return { parameter: ["attackerHpPercent", "defenderHpPercent"].includes(control.contextKey)
    ? control.contextKey : `skillValues.${control.contextKey}`, ...Object.fromEntries([
    "id", "contextKey", "label", "type", "min", "max", "step", "defaultValue", "options", "visibleWhen",
  ].filter(key => control[key] !== undefined).map(key => [key, control[key]])) };
}

function readSkillValues(values, controls) {
  if (values === undefined) return {};
  record(values, "skillValues");
  const context = {};
  const supplied = new Set();
  for (const [key, value] of Object.entries(values)) {
    const control = controls.find(input => [input.id, input.contextKey, `skill.${input.contextKey}`].includes(key));
    if (!control) fail("unknown_skill_value", `当前技能不支持参数：${key}`, {
      controls: controls.map(controlMetadata),
    });
    if (supplied.has(control.id)) fail("duplicate_skill_value", `技能参数重复：${control.contextKey}`);
    supplied.add(control.id);
    if (control.type === "number") numeric(value, control.label ?? key,
      control.min ?? -Number.MAX_SAFE_INTEGER, control.max ?? Number.MAX_SAFE_INTEGER, true);
    if (control.type === "boolean" && typeof value !== "boolean") {
      fail("invalid_skill_value", `${control.label ?? key}须为布尔值`);
    }
    if (control.type === "choice" && !control.options.some(option =>
      Object.is(option && typeof option === "object" ? option.value : option, value))) {
      fail("invalid_skill_value", `${control.label ?? key}须使用已列出的选项值`, { control: controlMetadata(control) });
    }
    context[control.id] = value;
    context[control.contextKey] = value;
  }
  return context;
}

function setLevel(snapshot, state, sideKey, requested) {
  const side = state.sides[sideKey];
  if (!supportsS5PreviewBattleLevel(snapshot, side)) {
    if (requested !== undefined && requested !== 60) fail("unsupported_level", "普通精灵当前固定60级，只有已适配的等级特性可调整等级");
    return;
  }
  if (requested === undefined) return;
  const spirit = snapshot.spirits.find(entry => entry.id === side.spiritId);
  const control = getTraitView(snapshot, spirit, "attacker")?.inputs.find(input => input.contextKey.endsWith("S5BattleLevel"));
  side.traitValues[canonicalTraitControlKey(control)] = requested;
}

function ownerHealth(snapshot, state, sideKey, percent) {
  const side = state.sides[sideKey];
  const level = resolveS5PreviewBattleLevel(snapshot, buildCombatState(state, snapshot), sideKey);
  const maximum = createCombatantView(snapshot, { ...side, level }).stats.find(stat => stat.key === "hp")?.panel;
  if (!Number.isFinite(maximum) || maximum <= 0) fail("unsupported", "该精灵种族值待确认，暂不能计算生命或伤害");
  const current = Math.round(maximum * percent / 100);
  const direction = state.directions[sideKey === "attacker" ? "reverse" : "forward"];
  direction.currentHp = current;
  direction.context.currentHpPercent = percent;
  return { current, maximum, requestedPercent: percent, actualPercent: current / maximum * 100 };
}

function response(structuredContent, isError = false) {
  // Copy the complete public result: callers cannot mutate snapshot data through
  // references returned by search (race stats, controls or option objects).
  const result = JSON.parse(JSON.stringify(structuredContent));
  return { isError, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
}

/** Read-only, per-call sessions. No storage, UI state, network or platform APIs. */
export function createAiCalculatorService(snapshot) {
  function execute(action) {
    try {
      if (!Array.isArray(snapshot?.spirits) || !Array.isArray(snapshot?.skills)) {
        fail("snapshot_unavailable", "计算器资料尚未加载，请稍后重试");
      }
      return response(action());
    } catch (error) {
      return response({ status: "error", ...(error.aiDetails ?? {
        code: "calculation_failed", message: "当前输入无法完成计算，请重新确认精灵、技能与条件",
      }) }, true);
    }
  }

  function searchRocoData(params) {
    return execute(() => {
      const { kind = "spirit", query, spiritId, limit = 8 } = parameters(params, SEARCH_FIELDS);
      if (!["spirit", "skill", "trait"].includes(kind)) fail("invalid_parameters", "kind仅支持spirit、skill、trait");
      const search = text(query, "query").toLowerCase();
      numeric(limit, "limit", 1, 12, true);
      const spirit = spiritId === undefined ? null : resolveEntity(snapshot.spirits, spiritId, "精灵");
      if (spirit && kind !== "skill") fail("invalid_parameters", "spiritId仅用于限定可学技能查询");
      const learnset = spirit && snapshot.learnsets?.find(entry => entry.spiritId === spirit.id);
      const entries = kind === "spirit" ? snapshot.spirits : kind === "skill" ? snapshot.skills : snapshot.traits ?? [];
      const matches = entries.filter(entry => (!spirit || learnset?.skillIds?.includes(entry.id)) &&
        [entry.id, ...namesOf(entry)].some(name => String(name).toLowerCase().includes(search)));
      return {
        status: "ok", kind, query, total: matches.length, truncated: matches.length > limit,
        results: matches.slice(0, limit).map(entry => kind === "spirit" ? {
          ...identity(entry), types: entry.types, raceStats: entry.raceStats,
          calculationStatus: entry.calculationStatus,
          traits: (entry.traitIds ?? []).map(id => snapshot.traits?.find(trait => trait.id === id))
            .filter(Boolean).map(trait => ({ ...identity(trait), description: trait.description })),
          defaultLevel: supportsS5PreviewBattleLevel(snapshot, { spiritId: entry.id }) ? 99 : 60,
        } : kind === "skill" ? {
          ...identity(entry), type: entry.type, category: entry.category,
          basePower: entry.basePower, cost: entry.cost, description: entry.description,
          controls: controlsFor(snapshot, entry, spirit).map(controlMetadata),
        } : { ...identity(entry), description: entry.description }),
      };
    });
  }

  function calculateRocoDamage(params) {
    return execute(() => {
      parameters(params, CALCULATION_FIELDS);
      const attacker = resolveEntity(snapshot.spirits, params.attacker, "攻击方");
      const defender = resolveEntity(snapshot.spirits, params.defender, "防守方");
      const skill = resolveEntity(snapshot.skills, params.skill, "技能");
      if (!DAMAGE_CATEGORIES.has(skill.category)) fail("non_damage_skill", "该技能是状态或防御技能，不作为直接伤害计算", { skill: identity(skill) });
      const legal = snapshot.learnsets?.find(entry => entry.spiritId === attacker.id)?.skillIds;
      if (!legal?.includes(skill.id)) fail("unlearnable_skill", "攻击方的当前学习面未收录此技能", { attacker: identity(attacker), skill: identity(skill) });
      const attackerNature = nature(params.attackerNature);
      const defenderNature = nature(params.defenderNature);
      for (const key of ["attackerLevel", "defenderLevel"]) {
        if (params[key] !== undefined) numeric(params[key], key, 1, 99, true);
      }
      const attackStage = numeric(defaulted(params.attackStage, 0), "attackStage", -99, 99, true);
      const defenseStage = numeric(defaulted(params.defenseStage, 0), "defenseStage", -99, 99, true);
      let attackerHpPercent = numeric(defaulted(params.attackerHpPercent, 100), "attackerHpPercent", 0, 100);
      const defenderHpPercent = numeric(defaulted(params.defenderHpPercent, 100), "defenderHpPercent", 0, 100);
      const controls = controlsFor(snapshot, skill, attacker);
      const context = readSkillValues(params.skillValues, controls);
      for (const key of ["attackerHpPercent", "defenderHpPercent"]) {
        if (Object.hasOwn(context, key)) fail("invalid_skill_value", `生命条件请使用顶层${key}，不要放在skillValues中`);
      }
      const darkBet = skill.name === "下注" && context.betMode === "lowHp";
      if (darkBet && attackerHpPercent >= 50) attackerHpPercent = 49;
      let state = createInitialState(snapshot);
      for (const [sideKey, spirit, chosenNature] of [["attacker", attacker, attackerNature], ["defender", defender, defenderNature]]) {
        state.sides[sideKey] = { ...state.sides[sideKey], spiritId: spirit.id, nature: chosenNature.id,
          skills: { single: null, four: [null, null, null, null] } };
      }
      state = withMiniappBattleLevelDefaults(snapshot, state);
      setLevel(snapshot, state, "attacker", params.attackerLevel);
      setLevel(snapshot, state, "defender", params.defenderLevel);
      state = selectSingleSkill(state, { side: "attacker", direction: "forward", skillId: skill.id, snapshot }).state;
      Object.assign(state.directions.forward.context, context);
      Object.assign(state.directions.forward.overrides, { attackLevelStage: attackStage, defenseLevelStage: defenseStage });
      const attackerHealth = ownerHealth(snapshot, state, "attacker", attackerHpPercent);
      const defenderHealth = ownerHealth(snapshot, state, "defender", defenderHpPercent);
      state = rememberSingleSkill(state, { side: "attacker", direction: "forward", skillId: skill.id, snapshot }).state;
      const view = createCalculationView(snapshot, state, "forward");
      const result = view.selectedResult ?? view.rows[0];
      if (view.status !== "exact" || !Number.isFinite(result?.totalDamage) || result?.statusOnly) {
        const inputs = result?.inputs ?? [];
        fail(inputs.length ? "needs_input" : "unsupported", view.message ?? result?.reason ?? "该规则暂不支持精确伤害计算", {
          inputs, controls: controls.map(controlMetadata),
        });
      }
      const combat = buildCombatState(state, snapshot);
      return {
        status: "exact", attacker: identity(attacker), defender: identity(defender), skill: identity(skill),
        damage: result.totalDamage, hpPercent: result.hpPercent, hitCount: result.hitCount,
        hitDamages: result.hitDamages, remainingHp: result.remainingHp,
        resolvedPower: result.displayedPower, formulaSteps: result.formulaSteps,
        attackerHealth, defenderHealth,
        assumptions: {
          attackerNature: identity(attackerNature), defenderNature: identity(defenderNature),
          attackerLevel: resolveS5PreviewBattleLevel(snapshot, combat, "attacker"),
          defenderLevel: resolveS5PreviewBattleLevel(snapshot, combat, "defender"),
          displayIvs: { ...state.sides.attacker.displayIvs }, attackStage, defenseStage,
          skillValues: Object.fromEntries(controls.filter(control => Object.hasOwn(context, control.contextKey))
            .map(control => [control.contextKey, context[control.contextKey]])),
          darkBetHpApplied: darkBet && (params.attackerHpPercent ?? 100) >= 50,
          conditions: "双方六项个体60；未指定条件沿用计算器默认；不执行攻击、不扣除持久化生命、不模拟完整回合或队伍。",
        },
        meta: { dataVersion: state.versions.data, rulesVersion: state.versions.rules, seasonId: snapshot.meta?.seasonId },
      };
    });
  }

  return { searchRocoData, calculateRocoDamage };
}
