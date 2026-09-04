import { normalizeMarksState } from "../shared/domain/marks.js";
import { MOON_MEMORY_TRAIT_LIMIT } from "../shared/domain/moon-memory.js";
import { normalizeNegativeStatusState } from "../shared/domain/negative-status.js";
import { createInitialState } from "../shared/state/defaults.js";
import { extractTraitValues } from "../shared/state/trait-values.js";
import { sanitizePublicContext } from "../share/context-schema.js";

export const MINIAPP_STATE_KEY = "rock-calculator.miniapp.state.v1";
export const MINIAPP_MEMORY_ENABLED_KEY =
  "rock-calculator.miniapp.memory-enabled.v1";
export const MINIAPP_TYPE_ANALYSIS_ENABLED_KEY =
  "rock-calculator.miniapp.type-analysis-enabled.v1";
export const MINIAPP_NEGATIVE_STATUS_ENABLED_KEY =
  "rock-calculator.miniapp.negative-status-enabled.v1";
export const MINIAPP_QUICK_UNDO_ENABLED_KEY =
  "rock-calculator.miniapp.quick-undo-enabled.v1";
export const MINIAPP_QUICK_UNDO_POSITION_KEY =
  "rock-calculator.miniapp.quick-undo-position.v1";
export const MINIAPP_TEAM_ANALYSIS_ENABLED_KEY =
  "rock-calculator.miniapp.team-analysis-enabled.v1";
export const MINIAPP_TEAM_ANALYSIS_MEMBERS_KEY =
  "rock-calculator.miniapp.team-analysis-members.v1";
export const MINIAPP_PERSISTENCE_SCHEMA_VERSION = 2;

const SKILL_NUMBER_KEYS = ["basePowerOverride", "fixedPowerAdd"];
const SKILL_NUMBER_LIST_KEYS = [
  "skillPowerPercentAdds",
  "otherPowerMultipliers",
];
const OVERRIDE_NUMBER_KEYS = [
  "attackDefenseLevelMultiplier",
  "attackerSpeedFlat",
  "attackerStat",
  "attackLevelStage",
  "basePower",
  "basePowerOverride",
  "costOverride",
  "damageReductionMultiplier",
  "defenderDefense",
  "defenderSpeedFlat",
  "defenseLevelStage",
  "displayedPower",
  "finalDamageMultiplier",
  "fixedPowerAdd",
  "hitCount",
  "hitCountAdd",
  "hitCountPercentAdd",
  "stab",
  "stabMultiplier",
  "typeEffectiveness",
  "typeEffectivenessMultiplier",
  "typeMultiplier",
];
const OVERRIDE_NUMBER_LIST_KEYS = [
  "otherPowerMultipliers",
  "skillPowerPercentAdds",
];
const ACQUIRED_TRAIT_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TRAIT_VALUE_KEY_PATTERN =
  /^trait\.[A-Za-z][A-Za-z0-9]*\.[a-f0-9]{8}$/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStoredValue(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
}

function sanitizeTeamAnalysisMembers(value, snapshot) {
  const spiritIds = new Set(
    (snapshot?.spirits ?? []).map((spirit) => spirit.id),
  );
  return Array.from({ length: 6 }, (_, index) => {
    const spiritId = Array.isArray(value) ? value[index] : null;
    return typeof spiritId === "string" && spiritIds.has(spiritId)
      ? spiritId
      : null;
  });
}

function getSkillId(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (isRecord(entry)) {
    return entry.skillId ?? entry.id ?? null;
  }
  return null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function finiteNumberList(value) {
  if (finiteNumber(value) !== undefined) return value;
  return Array.isArray(value) &&
    value.every((item) => finiteNumber(item) !== undefined)
    ? [...value]
    : undefined;
}

function sanitizeContext(value) {
  return sanitizePublicContext(value) ?? {};
}

function sanitizeTraitValues(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, candidate]) =>
        TRAIT_VALUE_KEY_PATTERN.test(key) &&
        (
          typeof candidate === "boolean" ||
          typeof candidate === "string" ||
          finiteNumber(candidate) !== undefined
        ),
    ),
  );
}

function sanitizeAcquiredTraitIds(value, allowedTraitIds) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (traitId) =>
      typeof traitId === "string" &&
      ACQUIRED_TRAIT_ID_PATTERN.test(traitId) &&
      (!allowedTraitIds || allowedTraitIds.has(traitId)),
  ))].slice(0, MOON_MEMORY_TRAIT_LIMIT);
}

function sanitizeAcquiredTraitValues(value, traitIds) {
  if (!isRecord(value)) return {};
  const allowedTraitIds = new Set(traitIds);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([traitId, values]) =>
        allowedTraitIds.has(traitId) && isRecord(values)
      )
      .map(([traitId, values]) => [
        traitId,
        Object.fromEntries(
          Object.entries(values).filter(
            ([key, candidate]) =>
              TRAIT_VALUE_KEY_PATTERN.test(key) &&
              (
                typeof candidate === "boolean" ||
                typeof candidate === "string" ||
                finiteNumber(candidate) !== undefined
              ),
          ),
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0),
  );
}

function createPersistenceDefaults(snapshot) {
  const defaults = createInitialState(snapshot);
  return {
    ...defaults,
    sides: Object.fromEntries(
      Object.entries(defaults.sides).map(([side, value]) => [
        side,
        {
          ...value,
          acquiredTraitIds: [],
          acquiredTraitValues: {},
        },
      ]),
    ),
  };
}

function sanitizeSlotValues(value, allowLists) {
  if (!Array.isArray(value) && !isRecord(value)) return undefined;
  const sanitized = Array.isArray(value) ? [] : {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!/^[0-4]$/u.test(key)) continue;
    const selected = allowLists
      ? finiteNumberList(candidate)
      : finiteNumber(candidate);
    if (selected !== undefined) sanitized[key] = selected;
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function sanitizePowerOverride(value) {
  if (!isRecord(value)) return undefined;
  const mode = value.mode === "static" || value.mode === "panel"
    ? value.mode
    : undefined;
  const power = finiteNumber(value.value);
  if (
    !mode ||
    !Number.isInteger(power) ||
    power < 0 ||
    power > 9999
  ) {
    return undefined;
  }
  return { mode, value: power };
}

function sanitizeOverrides(value) {
  if (!isRecord(value)) return {};
  const sanitized = {};
  for (const key of OVERRIDE_NUMBER_KEYS) {
    const selected = finiteNumber(value[key]);
    if (selected !== undefined) sanitized[key] = selected;
  }
  for (const key of OVERRIDE_NUMBER_LIST_KEYS) {
    const selected = finiteNumberList(value[key]);
    if (selected !== undefined) sanitized[key] = selected;
  }
  const fixedPowerAddsBySlot = sanitizeSlotValues(
    value.fixedPowerAddsBySlot,
    false,
  );
  if (fixedPowerAddsBySlot) {
    sanitized.fixedPowerAddsBySlot = fixedPowerAddsBySlot;
  }
  const skillPowerPercentAddsBySlot = sanitizeSlotValues(
    value.skillPowerPercentAddsBySlot,
    true,
  );
  if (skillPowerPercentAddsBySlot) {
    sanitized.skillPowerPercentAddsBySlot = skillPowerPercentAddsBySlot;
  }
  if (value.powerMode === "base" || value.powerMode === "displayed") {
    sanitized.powerMode = value.powerMode;
  }
  const powerOverride = sanitizePowerOverride(value.powerOverride);
  if (powerOverride) sanitized.powerOverride = powerOverride;
  if (isRecord(value.context)) {
    const context = sanitizeContext(value.context);
    if (Object.keys(context).length) sanitized.context = context;
  }
  return sanitized;
}

function sanitizeStatusActionDirection(value) {
  if (!isRecord(value)) return null;
  const currentHp = finiteNumber(value.currentHp);
  const finalDamageMultiplier = finiteNumber(value.finalDamageMultiplier);
  const hitCount = Number.isInteger(value.hitCount) &&
    value.hitCount >= 1 && value.hitCount <= 100
    ? value.hitCount
    : 1;
  const reduction = finiteNumber(value.reduction);
  const starfallStacks = Number.isInteger(value.starfallStacks) &&
    value.starfallStacks >= 0 && value.starfallStacks <= 100
    ? value.starfallStacks
    : 0;
  const direction = {
    context: sanitizeContext(value.context),
    currentHp: currentHp ?? null,
    finalDamageMultiplier: finalDamageMultiplier ?? 1,
    hitCount,
    overrides: sanitizeOverrides(value.overrides),
    reduction: reduction ?? 1,
    starfallStacks,
  };
  if (
    Number.isInteger(value.statusTriggerCount) &&
    value.statusTriggerCount >= 1 &&
    value.statusTriggerCount <= 99
  ) {
    direction.statusTriggerCount = value.statusTriggerCount;
  }
  return direction;
}

function sanitizeStatusActionSnapshot(value) {
  if (!isRecord(value)) return undefined;
  const forward = sanitizeStatusActionDirection(value.directions?.forward);
  const reverse = sanitizeStatusActionDirection(value.directions?.reverse);
  if (!forward || !reverse) return undefined;
  return {
    directions: { forward, reverse },
    marks: normalizeMarksState(value.marks, value.directions),
  };
}

function sanitizeStatusAction(value) {
  if (!isRecord(value)) return undefined;
  const actionKey = typeof value.actionKey === "string" &&
    /^skill:(attacker|defender):(single|four):[0-6]$/u.test(value.actionKey)
    ? value.actionKey
    : null;
  const before = sanitizeStatusActionSnapshot(value.before);
  const after = sanitizeStatusActionSnapshot(value.after);
  return actionKey && before && after ? { actionKey, after, before } : undefined;
}

function sanitizeSkillMemory(value, skillIds) {
  if (!isRecord(value)) return undefined;
  const sanitized = {};
  for (const [skillId, memory] of Object.entries(value)) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(skillId) ||
      skillIds && !skillIds.has(skillId) ||
      !isRecord(memory)
    ) {
      continue;
    }
    const selected = {};
    if (
      Number.isInteger(memory.hitCount) &&
      memory.hitCount >= 1 &&
      memory.hitCount <= 100
    ) {
      selected.hitCount = memory.hitCount;
    }
    if (
      Number.isInteger(memory.statusTriggerCount) &&
      memory.statusTriggerCount >= 1 &&
      memory.statusTriggerCount <= 99
    ) {
      selected.statusTriggerCount = memory.statusTriggerCount;
    }
    if (isRecord(memory.context)) {
      const context = sanitizeContext(memory.context);
      if (Object.keys(context).length) selected.context = context;
    }
    if (isRecord(memory.overrides)) {
      const overrides = sanitizeOverrides(memory.overrides);
      if (Object.keys(overrides).length) selected.overrides = overrides;
    }
    if (Object.keys(selected).length) sanitized[skillId] = selected;
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function sanitizeSkillEntry(entry, skillIds) {
  if (entry === null) return null;
  if (typeof entry === "string") return entry || null;
  if (!isRecord(entry)) {
    return null;
  }

  const skillId = getSkillId(entry);
  if (typeof skillId !== "string" || !skillId) return null;
  const selected = { skillId };
  if (
    Number.isInteger(entry.hitCount) &&
    entry.hitCount >= 1 &&
    entry.hitCount <= 100
  ) {
    selected.hitCount = entry.hitCount;
  }
  if (
    Number.isInteger(entry.statusTriggerCount) &&
    entry.statusTriggerCount >= 1 &&
    entry.statusTriggerCount <= 99
  ) {
    selected.statusTriggerCount = entry.statusTriggerCount;
  }
  if (isRecord(entry.context)) {
    const context = sanitizeContext(entry.context);
    if (Object.keys(context).length) selected.context = context;
  }
  if (isRecord(entry.overrides)) {
    const overrides = sanitizeOverrides(entry.overrides);
    if (Object.keys(overrides).length) selected.overrides = overrides;
  }
  for (const key of SKILL_NUMBER_KEYS) {
    const value = finiteNumber(entry[key]);
    if (value !== undefined) selected[key] = value;
  }
  for (const key of SKILL_NUMBER_LIST_KEYS) {
    const value = finiteNumberList(entry[key]);
    if (value !== undefined) selected[key] = value;
  }
  const memoryBySkill = sanitizeSkillMemory(entry.memoryBySkill, skillIds);
  if (memoryBySkill) selected.memoryBySkill = memoryBySkill;
  const statusAction = sanitizeStatusAction(entry.statusAction);
  if (statusAction) selected.statusAction = statusAction;
  return selected;
}

function repairSkillEntry(entry, fallback, skillIds) {
  if (entry === null) {
    return null;
  }

  const skillId = getSkillId(entry);
  if (typeof skillId === "string" && skillIds.has(skillId)) {
    return sanitizeSkillEntry(entry, skillIds);
  }
  return sanitizeSkillEntry(fallback, skillIds);
}

function repairDisplayIvs(displayIvs, defaults) {
  if (!isRecord(displayIvs)) {
    return { ...defaults };
  }

  return Object.fromEntries(
    Object.entries(defaults).map(([stat, fallback]) => [
      stat,
      Number.isFinite(displayIvs[stat]) ? displayIvs[stat] : fallback,
    ]),
  );
}

function repairSide(
  side,
  defaults,
  snapshot,
  spiritIds,
  skillIds,
  traitIds,
) {
  if (
    !isRecord(side) ||
    !isRecord(side.skills) ||
    !Array.isArray(side.skills.four)
  ) {
    return null;
  }

  const four = defaults.skills.four.map((fallback, index) =>
    repairSkillEntry(side.skills.four[index], fallback, skillIds),
  );

  const repaired = {
    spiritId: spiritIds.has(side.spiritId)
      ? side.spiritId
      : defaults.spiritId,
    nature:
      typeof side.nature === "string" && side.nature
        ? side.nature
        : defaults.nature,
    displayIvs: repairDisplayIvs(side.displayIvs, defaults.displayIvs),
    skills: {
      single: repairSkillEntry(
        side.skills.single,
        defaults.skills.single,
        skillIds,
      ),
      four,
    },
  };
  const acquiredTraitIds = sanitizeAcquiredTraitIds(
    side.acquiredTraitIds,
    traitIds,
  );
  return {
    ...repaired,
    acquiredTraitIds,
    acquiredTraitValues: sanitizeAcquiredTraitValues(
      side.acquiredTraitValues,
      acquiredTraitIds,
    ),
    traitValues: extractTraitValues(
      {
        ...repaired,
        skills: side.skills,
        traitValues: isRecord(side.traitValues)
          ? side.traitValues
          : {},
      },
      snapshot,
    ),
  };
}

function repairDirection(direction, defaults) {
  if (!isRecord(direction)) {
    return { ...defaults, context: {}, overrides: {} };
  }

  const repaired = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (key === "context" || key === "overrides") {
      repaired[key] = isRecord(direction[key])
        ? key === "context"
          ? sanitizeContext(direction[key])
          : sanitizeOverrides(direction[key])
        : { ...fallback };
    } else if (key === "selectedSkillIndex") {
      repaired[key] =
        Number.isInteger(direction[key]) &&
        direction[key] >= 0 &&
        direction[key] <= 6
          ? direction[key]
          : fallback;
    } else {
      repaired[key] = direction[key] ?? fallback;
    }
  }
  if (
    Number.isInteger(direction.statusTriggerCount) &&
    direction.statusTriggerCount >= 1 &&
    direction.statusTriggerCount <= 99
  ) {
    repaired.statusTriggerCount = direction.statusTriggerCount;
  }
  return repaired;
}

function repairPersistedState(snapshot, persistedState) {
  const defaults = createPersistenceDefaults(snapshot);
  if (
    !isRecord(persistedState) ||
    !isRecord(persistedState.sides) ||
    !isRecord(persistedState.directions)
  ) {
    return defaults;
  }

  const spiritIds = new Set(
    (snapshot?.spirits ?? []).map((spirit) => spirit.id),
  );
  const skillIds = new Set(
    (snapshot?.skills ?? []).map((skill) => skill.id),
  );
  const traitIds = new Set(
    (snapshot?.traits ?? []).map((trait) => trait.id),
  );
  const attacker = repairSide(
    persistedState.sides.attacker,
    defaults.sides.attacker,
    snapshot,
    spiritIds,
    skillIds,
    traitIds,
  );
  const defender = repairSide(
    persistedState.sides.defender,
    defaults.sides.defender,
    snapshot,
    spiritIds,
    skillIds,
    traitIds,
  );

  if (!attacker || !defender) {
    return defaults;
  }

  return {
    ...defaults,
    mode:
      persistedState.mode === "single" || persistedState.mode === "four"
        ? persistedState.mode
        : defaults.mode,
    marks: normalizeMarksState(
      persistedState.marks,
      persistedState.directions,
    ),
    calculationOptions: {
      includeNegativeStatusSettlement:
        persistedState.calculationOptions?.includeNegativeStatusSettlement === true,
    },
    negativeStatuses: normalizeNegativeStatusState(
      persistedState.negativeStatuses,
    ),
    sides: {
      attacker,
      defender,
    },
    directions: {
      forward: repairDirection(
        persistedState.directions.forward,
        defaults.directions.forward,
      ),
      reverse: repairDirection(
        persistedState.directions.reverse,
        defaults.directions.reverse,
      ),
    },
  };
}

function migratePersistedEnvelope(value) {
  if (
    value?.schemaVersion === MINIAPP_PERSISTENCE_SCHEMA_VERSION &&
    isRecord(value.state)
  ) {
    return value;
  }
  if (value?.schemaVersion === 1 && isRecord(value.state)) {
    return {
      ...value,
      schemaVersion: MINIAPP_PERSISTENCE_SCHEMA_VERSION,
      state: {
        ...value.state,
        marks: value.state.marks ?? undefined,
      },
    };
  }
  return null;
}

function selectSideInputs(side) {
  const acquiredTraitIds = sanitizeAcquiredTraitIds(
    side?.acquiredTraitIds,
  );
  return {
    acquiredTraitIds,
    acquiredTraitValues: sanitizeAcquiredTraitValues(
      side?.acquiredTraitValues,
      acquiredTraitIds,
    ),
    spiritId: side?.spiritId,
    nature: side?.nature,
    displayIvs: isRecord(side?.displayIvs)
      ? { ...side.displayIvs }
      : side?.displayIvs,
    traitValues: isRecord(side?.traitValues)
      ? sanitizeTraitValues(side.traitValues)
      : {},
    skills: {
      single: sanitizeSkillEntry(side?.skills?.single),
      four: Array.isArray(side?.skills?.four)
        ? side.skills.four.map((entry) => sanitizeSkillEntry(entry))
        : [],
    },
  };
}

function selectDirectionInputs(direction) {
  const selected = {
    selectedSkillIndex: direction?.selectedSkillIndex,
    selectedDamageSource: direction?.selectedDamageSource,
    reduction: direction?.reduction,
    hitCount: direction?.hitCount,
    traitDamageHitCount: direction?.traitDamageHitCount,
    starfallStacks: direction?.starfallStacks,
    finalDamageMultiplier: direction?.finalDamageMultiplier,
    currentHp: direction?.currentHp,
    context: isRecord(direction?.context)
      ? sanitizeContext(direction.context)
      : {},
    overrides: isRecord(direction?.overrides)
      ? sanitizeOverrides(direction.overrides)
      : {},
  };
  if (
    Number.isInteger(direction?.statusTriggerCount) &&
    direction.statusTriggerCount >= 1 &&
    direction.statusTriggerCount <= 99
  ) {
    selected.statusTriggerCount = direction.statusTriggerCount;
  }
  return selected;
}

export function createPersistence({ storage }) {
  if (
    !storage ||
    typeof storage.get !== "function" ||
    typeof storage.set !== "function" ||
    typeof storage.remove !== "function"
  ) {
    throw new TypeError("计算状态持久化需要同步 storage");
  }

  function getMemoryEnabled() {
    try {
      return storage.get(MINIAPP_MEMORY_ENABLED_KEY) !== false;
    } catch {
      return true;
    }
  }

  function getTypeAnalysisEnabled() {
    try {
      return storage.get(MINIAPP_TYPE_ANALYSIS_ENABLED_KEY) === true;
    } catch {
      return false;
    }
  }

  function getNegativeStatusEnabled() {
    try {
      return storage.get(MINIAPP_NEGATIVE_STATUS_ENABLED_KEY) === true;
    } catch {
      return false;
    }
  }

  function getQuickUndoEnabled() {
    try {
      return storage.get(MINIAPP_QUICK_UNDO_ENABLED_KEY) !== false;
    } catch {
      return true;
    }
  }

  function getQuickUndoPosition() {
    try {
      const value = parseStoredValue(
        storage.get(MINIAPP_QUICK_UNDO_POSITION_KEY),
      );
      if (
        !isRecord(value) ||
        !Number.isFinite(value.bottom) ||
        !Number.isFinite(value.right)
      ) {
        return null;
      }
      return {
        bottom: Math.max(0, Math.round(value.bottom)),
        right: Math.max(0, Math.round(value.right)),
      };
    } catch {
      return null;
    }
  }

  function getTeamAnalysisEnabled() {
    try {
      return storage.get(MINIAPP_TEAM_ANALYSIS_ENABLED_KEY) === true;
    } catch {
      return false;
    }
  }

  function getTeamAnalysisMembers(snapshot) {
    try {
      return sanitizeTeamAnalysisMembers(
        parseStoredValue(storage.get(MINIAPP_TEAM_ANALYSIS_MEMBERS_KEY)),
        snapshot,
      );
    } catch {
      return sanitizeTeamAnalysisMembers([], snapshot);
    }
  }

  return {
    clear() {
      storage.remove(MINIAPP_STATE_KEY);
    },

    load(snapshot) {
      const defaults = createPersistenceDefaults(snapshot);
      if (!getMemoryEnabled()) {
        return defaults;
      }
      let persisted;

      try {
        persisted = parseStoredValue(storage.get(MINIAPP_STATE_KEY));
      } catch {
        return defaults;
      }

      const migrated = migratePersistedEnvelope(persisted);
      if (!migrated) {
        return defaults;
      }

      return repairPersistedState(snapshot, migrated.state);
    },

    save(state) {
      if (!getMemoryEnabled()) {
        return state;
      }
      const payload = {
        schemaVersion: MINIAPP_PERSISTENCE_SCHEMA_VERSION,
        dataVersion: state?.versions?.data ?? null,
        state: {
          mode: state?.mode,
          marks: normalizeMarksState(state?.marks, state?.directions),
          calculationOptions: {
            includeNegativeStatusSettlement:
              state?.calculationOptions?.includeNegativeStatusSettlement === true,
          },
          negativeStatuses: normalizeNegativeStatusState(
            state?.negativeStatuses,
          ),
          sides: {
            attacker: selectSideInputs(state?.sides?.attacker),
            defender: selectSideInputs(state?.sides?.defender),
          },
          directions: {
            forward: selectDirectionInputs(state?.directions?.forward),
            reverse: selectDirectionInputs(state?.directions?.reverse),
          },
        },
      };

      storage.set(
        MINIAPP_STATE_KEY,
        JSON.parse(JSON.stringify(payload)),
      );
      return state;
    },

    getMemoryEnabled,

    getNegativeStatusEnabled,

    getQuickUndoEnabled,

    getQuickUndoPosition,

    getTeamAnalysisEnabled,

    getTeamAnalysisMembers,

    getTypeAnalysisEnabled,

    setMemoryEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("配置记忆开关必须是布尔值");
      }
      storage.set(MINIAPP_MEMORY_ENABLED_KEY, enabled);
      if (!enabled) {
        storage.remove(MINIAPP_STATE_KEY);
      }
      return enabled;
    },

    setTypeAnalysisEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("属性分析开关必须是布尔值");
      }
      storage.set(MINIAPP_TYPE_ANALYSIS_ENABLED_KEY, enabled);
      return enabled;
    },

    setNegativeStatusEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("负面状态结算开关必须是布尔值");
      }
      storage.set(MINIAPP_NEGATIVE_STATUS_ENABLED_KEY, enabled);
      return enabled;
    },

    setQuickUndoEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("快捷撤回开关必须是布尔值");
      }
      storage.set(MINIAPP_QUICK_UNDO_ENABLED_KEY, enabled);
      return enabled;
    },

    setQuickUndoPosition(position) {
      if (
        !isRecord(position) ||
        !Number.isFinite(position.bottom) ||
        !Number.isFinite(position.right)
      ) {
        throw new TypeError("快捷撤回位置必须包含有效坐标");
      }
      const normalized = {
        bottom: Math.max(0, Math.round(position.bottom)),
        right: Math.max(0, Math.round(position.right)),
      };
      storage.set(MINIAPP_QUICK_UNDO_POSITION_KEY, normalized);
      return normalized;
    },

    setTeamAnalysisEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("队伍防守面分析开关必须是布尔值");
      }
      storage.set(MINIAPP_TEAM_ANALYSIS_ENABLED_KEY, enabled);
      return enabled;
    },

    setTeamAnalysisMembers(members, snapshot) {
      const sanitized = sanitizeTeamAnalysisMembers(members, snapshot);
      storage.set(MINIAPP_TEAM_ANALYSIS_MEMBERS_KEY, sanitized);
      return sanitized;
    },
  };
}
