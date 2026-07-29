import { normalizeNatureId } from "../domain/natures.js";
import { chooseDefaultSkillIds } from "../domain/skill-loadout.js";
import {
  STORAGE_NAMESPACE,
  finishStorageMigration,
  readStorageWithLegacy,
} from "./storage-namespace.js";

const TEAM_STORAGE_SUFFIX = "teams.v1";
export const TEAM_STORAGE_KEY = `${STORAGE_NAMESPACE}.${TEAM_STORAGE_SUFFIX}`;
export const TEAM_SCHEMA_VERSION = 1;

const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function defaultIdFactory() {
  return globalThis.crypto?.randomUUID?.() ??
    `team-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultNow() {
  return new Date().toISOString();
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function emptyState(warning) {
  return {
    activeTeamId: null,
    schemaVersion: TEAM_SCHEMA_VERSION,
    teams: [],
    ...(warning ? { warning } : {}),
  };
}

function skillId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function validateStoredState(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.schemaVersion !== TEAM_SCHEMA_VERSION ||
    !Array.isArray(value.teams)
  ) {
    throw new TypeError("队伍数据版本不受支持");
  }
  for (const team of value.teams) {
    if (
      !team ||
      typeof team.id !== "string" ||
      typeof team.name !== "string" ||
      !Array.isArray(team.members) ||
      team.members.length !== 6
    ) {
      throw new TypeError("队伍数据结构无效");
    }
  }
  if (
    value.activeTeamId !== null &&
    !value.teams.some((team) => team.id === value.activeTeamId)
  ) {
    throw new TypeError("活动队伍不存在");
  }
}

function sanitizeMember(member) {
  if (!member) return null;
  return {
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((stat) => [stat, Number(member.displayIvs?.[stat]) || 0]),
    ),
    natureId: normalizeNatureId(member.natureId),
    skills: {
      four: Array.from(
        { length: 4 },
        (_, index) => cloneJson(member.skills?.four?.[index] ?? null),
      ),
      single: cloneJson(member.skills?.single ?? null),
    },
    spiritId: member.spiritId,
  };
}

function sanitizeState(state) {
  return {
    activeTeamId: state.activeTeamId ?? null,
    schemaVersion: TEAM_SCHEMA_VERSION,
    teams: state.teams.map((team) => ({
      createdAt: team.createdAt,
      id: team.id,
      members: Array.from(
        { length: 6 },
        (_, index) => sanitizeMember(team.members[index]),
      ),
      name: team.name,
      updatedAt: team.updatedAt,
    })),
  };
}

function markRepairs(state, snapshot) {
  if (!snapshot) return state;
  const spiritIds = new Set(
    (snapshot.spirits ?? []).map((spirit) => spirit.id),
  );
  const skillIds = new Set((snapshot.skills ?? []).map((skill) => skill.id));
  return {
    ...state,
    teams: state.teams.map((team) => ({
      ...team,
      members: team.members.map((member) => {
        if (!member) return null;
        const reasons = [];
        if (!spiritIds.has(member.spiritId)) {
          reasons.push("精灵数据不存在");
        }
        const missingSkills = [
          member.skills?.single,
          ...(member.skills?.four ?? []),
        ]
          .map(skillId)
          .filter((id) => id && !skillIds.has(id));
        if (missingSkills.length > 0) {
          reasons.push("技能数据不存在");
        }
        return reasons.length
          ? {
              ...member,
              needsRepair: true,
              repairReason: reasons.join("、"),
            }
          : member;
      }),
    })),
  };
}

export function createEmptyTeam(
  name = "新队伍",
  { idFactory = defaultIdFactory, now = defaultNow } = {},
) {
  const timestamp = now();
  return {
    createdAt: timestamp,
    id: idFactory(),
    members: Array(6).fill(null),
    name: String(name).trim() || "新队伍",
    updatedAt: timestamp,
  };
}

export function createTeamMember(snapshot, spiritId) {
  if (!(snapshot.spirits ?? []).some((spirit) => spirit.id === spiritId)) {
    throw new TypeError("无法为不存在的精灵创建队伍成员");
  }
  const four = chooseDefaultSkillIds(snapshot, spiritId);
  return {
    displayIvs: Object.fromEntries(STAT_KEYS.map((stat) => [stat, 0])),
    natureId: "neutral",
    skills: {
      four,
      single: four.find(Boolean) ?? null,
    },
    spiritId,
  };
}

export function createTeamMemberFromSide(side) {
  if (!side?.spiritId) {
    throw new TypeError("当前计算方没有可保存的精灵");
  }
  return sanitizeMember({
    displayIvs: side.displayIvs,
    natureId: side.natureId ?? side.nature,
    skills: side.skills,
    spiritId: side.spiritId,
  });
}

export function teamPresetsRepository({
  idFactory = defaultIdFactory,
  now = defaultNow,
  storage = globalThis.localStorage,
} = {}) {
  if (!storage?.getItem || !storage?.setItem) {
    throw new TypeError("当前环境无法保存队伍");
  }

  function save(state) {
    const stored = sanitizeState(state);
    validateStoredState(stored);
    storage.setItem(TEAM_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }

  function load(snapshot) {
    const { key, raw } = readStorageWithLegacy(
      storage,
      TEAM_STORAGE_KEY,
      TEAM_STORAGE_SUFFIX,
    );
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      validateStoredState(parsed);
      finishStorageMigration(storage, TEAM_STORAGE_KEY, key, raw);
      return markRepairs(parsed, snapshot);
    } catch (error) {
      storage.setItem(
        `${TEAM_STORAGE_KEY}.corrupt.${now()}`,
        raw,
      );
      return emptyState(
        error instanceof SyntaxError
          ? "队伍数据损坏，已保留备份"
          : "队伍数据格式不受支持，已保留备份",
      );
    }
  }

  function persist(state) {
    const warning = state.warning;
    const stored = save(state);
    return warning ? { ...stored, warning } : stored;
  }

  return {
    create(state, name) {
      const team = createEmptyTeam(name, { idFactory, now });
      return persist({
        ...state,
        activeTeamId: team.id,
        teams: [...state.teams, team],
      });
    },
    duplicate(state, teamId) {
      const source = state.teams.find((team) => team.id === teamId);
      if (!source) throw new TypeError("要复制的队伍不存在");
      const timestamp = now();
      const duplicate = {
        ...cloneJson(source),
        createdAt: timestamp,
        id: idFactory(),
        name: `${source.name} 副本`,
        updatedAt: timestamp,
      };
      return persist({
        ...state,
        activeTeamId: duplicate.id,
        teams: [...state.teams, duplicate],
      });
    },
    load,
    remove(state, teamId) {
      const teams = state.teams.filter((team) => team.id !== teamId);
      const activeTeamId =
        state.activeTeamId === teamId
          ? teams[0]?.id ?? null
          : state.activeTeamId;
      return persist({ ...state, activeTeamId, teams });
    },
    rename(state, teamId, name) {
      const nextName = String(name).trim() || "未命名队伍";
      return persist({
        ...state,
        teams: state.teams.map((team) =>
          team.id === teamId
            ? { ...team, name: nextName, updatedAt: now() }
            : team,
        ),
      });
    },
    save,
    setActive(state, teamId) {
      if (!state.teams.some((team) => team.id === teamId)) {
        throw new TypeError("活动队伍不存在");
      }
      return persist({ ...state, activeTeamId: teamId });
    },
    updateMember(state, teamId, index, member) {
      if (!Number.isInteger(index) || index < 0 || index > 5) {
        throw new RangeError("队伍成员位置必须是 0 到 5");
      }
      return persist({
        ...state,
        teams: state.teams.map((team) => {
          if (team.id !== teamId) return team;
          const members = [...team.members];
          members[index] = sanitizeMember(member);
          return { ...team, members, updatedAt: now() };
        }),
      });
    },
  };
}
