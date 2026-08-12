import { normalizeMarksState } from "../shared/domain/marks.js";
import { createInitialState } from "../shared/state/defaults.js";
import { extractTraitValues } from "../shared/state/trait-values.js";
import { sanitizePublicContext } from "../share/context-schema.js";

export const MINIAPP_STATE_KEY = "rock-calculator.miniapp.state.v1";
export const MINIAPP_MEMORY_ENABLED_KEY =
  "rock-calculator.miniapp.memory-enabled.v1";
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStoredValue(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value;
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
        /^trait\.[A-Za-z][A-Za-z0-9]*\.[a-f0-9]{8}$/u.test(key) &&
        (
          typeof candidate === "boolean" ||
          typeof candidate === "string" ||
          finiteNumber(candidate) !== undefined
        ),
    ),
  );
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
  if (isRecord(value.context)) {
    const context = sanitizeContext(value.context);
    if (Object.keys(context).length) sanitized.context = context;
  }
  return sanitized;
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

function repairSide(side, defaults, snapshot, spiritIds, skillIds) {
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
  return {
    ...repaired,
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
  return repaired;
}

function repairPersistedState(snapshot, persistedState) {
  const defaults = createInitialState(snapshot);
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
  const attacker = repairSide(
    persistedState.sides.attacker,
    defaults.sides.attacker,
    snapshot,
    spiritIds,
    skillIds,
  );
  const defender = repairSide(
    persistedState.sides.defender,
    defaults.sides.defender,
    snapshot,
    spiritIds,
    skillIds,
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
  return {
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
  return {
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

  return {
    clear() {
      storage.remove(MINIAPP_STATE_KEY);
    },

    load(snapshot) {
      const defaults = createInitialState(snapshot);
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
  };
}
