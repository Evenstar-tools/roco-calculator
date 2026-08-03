import {
  STATE_SCHEMA_VERSION,
  createInitialState,
} from "../shared/state/defaults.js";

export const MINIAPP_STATE_KEY = "rock-calculator.miniapp.state.v1";

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

function cloneSkillEntry(entry) {
  if (!isRecord(entry)) {
    return entry;
  }

  return {
    ...entry,
    ...(isRecord(entry.context) ? { context: { ...entry.context } } : {}),
    ...(isRecord(entry.overrides)
      ? { overrides: { ...entry.overrides } }
      : {}),
  };
}

function repairSkillEntry(entry, fallback, skillIds) {
  if (entry === null) {
    return null;
  }

  const skillId = getSkillId(entry);
  if (typeof skillId === "string" && skillIds.has(skillId)) {
    return cloneSkillEntry(entry);
  }
  return cloneSkillEntry(fallback);
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

function repairSide(side, defaults, spiritIds, skillIds) {
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

  return {
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
}

function repairDirection(direction, defaults) {
  if (!isRecord(direction)) {
    return { ...defaults, context: {}, overrides: {} };
  }

  const repaired = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (key === "context" || key === "overrides") {
      repaired[key] = isRecord(direction[key])
        ? { ...direction[key] }
        : { ...fallback };
    } else if (key === "selectedSkillIndex") {
      repaired[key] =
        Number.isInteger(direction[key]) &&
        direction[key] >= 0 &&
        direction[key] <= 3
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
    spiritIds,
    skillIds,
  );
  const defender = repairSide(
    persistedState.sides.defender,
    defaults.sides.defender,
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

export function createPersistence({ storage }) {
  if (
    !storage ||
    typeof storage.get !== "function" ||
    typeof storage.set !== "function" ||
    typeof storage.remove !== "function"
  ) {
    throw new TypeError("计算状态持久化需要同步 storage");
  }

  return {
    clear() {
      storage.remove(MINIAPP_STATE_KEY);
    },

    load(snapshot) {
      const defaults = createInitialState(snapshot);
      let persisted;

      try {
        persisted = parseStoredValue(storage.get(MINIAPP_STATE_KEY));
      } catch {
        return defaults;
      }

      if (
        !isRecord(persisted) ||
        persisted.schemaVersion !== STATE_SCHEMA_VERSION ||
        !isRecord(persisted.state)
      ) {
        return defaults;
      }

      return repairPersistedState(snapshot, persisted.state);
    },

    save(state) {
      const payload = {
        schemaVersion: STATE_SCHEMA_VERSION,
        dataVersion: state?.versions?.data ?? null,
        state: {
          mode: state?.mode,
          sides: state?.sides,
          directions: state?.directions,
        },
      };

      storage.set(
        MINIAPP_STATE_KEY,
        JSON.parse(JSON.stringify(payload)),
      );
      return state;
    },
  };
}
