import { normalizeNatureId } from "../domain/natures.js";
import { assertRepositoryEnvironment, createServerStorage, serverStorageKey, storageError } from "./server-storage.js";
import { recoverPendingLineupIvs } from "./lineup-ivs.js";
import { chooseDefaultSkillIds } from "../domain/skill-loadout.js";
import { isUsableDraftConfiguration } from "./spirit-configs.js";
import {
  STORAGE_NAMESPACE,
  backupCorruptValue,
  finishStorageMigration,
  readStorageWithLegacy,
  trySetItem,
} from "./storage-namespace.js";

const TEAM_STORAGE_SUFFIX = "teams.v1";
export const TEAM_STORAGE_KEY = serverStorageKey("cn", `${STORAGE_NAMESPACE}.${TEAM_STORAGE_SUFFIX}`);
export const TEAM_SCHEMA_VERSION = 1;

export const TEAM_BLOODLINE_OPTIONS = Object.freeze([
  { label: "普通", value: "normal" },
  { label: "草", value: "grass" },
  { label: "火", value: "fire" },
  { label: "水", value: "water" },
  { label: "光", value: "light" },
  { label: "地", value: "ground" },
  { label: "冰", value: "ice" },
  { label: "龙", value: "dragon" },
  { label: "电", value: "electric" },
  { label: "毒", value: "poison" },
  { label: "虫", value: "bug" },
  { label: "武", value: "martial" },
  { label: "翼", value: "wing" },
  { label: "萌", value: "moe" },
  { label: "幽", value: "ghost" },
  { label: "恶", value: "evil" },
  { label: "机械", value: "machine" },
  { label: "幻", value: "phantom" },
  { label: "首领", value: "boss" },
]);

const TEAM_BLOODLINE_VALUES = new Set(
  TEAM_BLOODLINE_OPTIONS.map(({ value }) => value),
);

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
  if (member.needsRepair) return cloneJson(member);
  const capacity = member.skills?.four?.length === 7 ? 7 : 4;
  return {
    ...(TEAM_BLOODLINE_VALUES.has(member.bloodlineType)
      ? { bloodlineType: member.bloodlineType }
      : {}),
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((stat) => [stat, Number(member.displayIvs?.[stat]) || 0]),
    ),
    natureId: normalizeNatureId(member.natureId),
    skills: {
      four: Array.from(
        { length: capacity },
        (_, index) => cloneJson(member.skills?.four?.[index] ?? null),
      ),
      single: cloneJson(member.skills?.single ?? null),
    },
    spiritId: member.spiritId,
    ...(member.ivsPending === true ? { ivsPending: true } : {}),
    ...(member.lineupSource ? { lineupSource: cloneJson(member.lineupSource) } : {}),
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
      ...(team.lineup ? { lineup: cloneJson(team.lineup) } : {}),
      updatedAt: team.updatedAt,
    })),
  };
}

function markRepairs(state, snapshot, serverId) {
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
        if (serverId === "global" && !isUsableDraftConfiguration(member)) reasons.push("配置结构不完整");
        if (!spiritIds.has(member.spiritId)) {
          reasons.push("精灵数据不存在");
        }
        const entries = [
          member.skills?.single,
          ...(member.skills?.four ?? []),
        ];
        const missingSkills = entries
          .flatMap((entry) => [skillId(entry), ...(serverId === "global" ? Object.keys(entry?.memoryBySkill ?? {}) : [])])
          .filter((id) => id && !skillIds.has(id));
        if (missingSkills.length > 0) {
          reasons.push("技能数据不存在");
        }
        if (serverId === "global" && reasons.length === 0) {
          const preserved = cloneJson(member);
          delete preserved.needsRepair;
          delete preserved.repairReason;
          return preserved;
        }
        return reasons.length
          ? {
              ...member,
              needsRepair: true,
              repairReason: reasons.join("、"),
            }
          : recoverPendingLineupIvs(member);
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
  if (snapshot?.meta?.serverId === "global" && !snapshot.meta.id) {
    return {
      displayIvs: Object.fromEntries(STAT_KEYS.map((stat) => [stat, null])),
      natureId: null,
      skills: { four: [null, null, null, null], single: null },
      spiritId,
    };
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

export function createTeamMemberFromSpiritConfig(config, { serverId = "cn" } = {}) {
  if (!config?.spiritId) {
    throw new TypeError("个人精灵配置必须包含 spiritId");
  }
  if (serverId === "global") {
    const member = cloneJson(config);
    member.natureId = Object.hasOwn(member, "natureId") ? member.natureId : member.nature ?? null;
    delete member.nature;
    return member;
  }
  return sanitizeMember(config);
}

export function createTeamMemberFromSide(side, { serverId = "cn" } = {}) {
  if (!side?.spiritId) {
    throw new TypeError("当前计算方没有可保存的精灵");
  }
  if (serverId === "global") return createTeamMemberFromSpiritConfig(side, { serverId });
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
  serverId = "cn",
} = {}) {
  if (!storage?.getItem || !storage?.setItem) {
    throw new TypeError("当前环境无法保存队伍");
  }
  assertRepositoryEnvironment(serverId);
  storage = createServerStorage(serverId, storage);
  const teamKey = serverStorageKey(serverId, `rock-calculator.${TEAM_STORAGE_SUFFIX}`);
  let observedRaw;

  function save(state) {
    const previous = storage.getItem(teamKey);
    if (observedRaw !== undefined && previous !== observedRaw) throw storageError("STORAGE_CONFLICT", "另一标签页已更新队伍；本标签内容已保留，未覆盖存档");
    if (previous) {
      try { validateStoredState(JSON.parse(previous)); }
      catch { throw storageError("STORAGE_CORRUPT", "原队伍数据损坏；保存已停止，原始内容未覆盖"); }
    }
    const stored = serverId === "global" ? cloneJson(state) : sanitizeState(state);
    validateStoredState(stored);
    const raw = JSON.stringify(stored);
    if (!trySetItem(storage, teamKey, raw)) {
      return {
        ...stored,
        warning: "队伍保存失败：存储空间不足",
        writeFailed: true,
      };
    }
    observedRaw = raw;
    return stored;
  }

  function load(snapshot) {
    assertRepositoryEnvironment(serverId, snapshot);
    const { key, raw } = readStorageWithLegacy(
      storage,
      teamKey,
      TEAM_STORAGE_SUFFIX,
    );
    observedRaw = storage.getItem(teamKey);
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      validateStoredState(parsed);
      finishStorageMigration(storage, teamKey, key, raw);
      return markRepairs(parsed, snapshot, serverId);
    } catch (error) {
      backupCorruptValue(storage, teamKey, raw, now());
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
    if (stored.writeFailed) return stored;
    return warning ? { ...stored, warning } : stored;
  }

  return {
    importTeam(state, imported) {
      if (!Array.isArray(imported.members) || imported.members.length !== 6) {
        throw new TypeError("导入队伍必须包含六个位置");
      }
      const created = createEmptyTeam(imported.name, { idFactory, now });
      const team = serverId === "global"
        ? { ...cloneJson(imported), id: created.id, createdAt: created.createdAt, updatedAt: created.updatedAt }
        : { ...created, members: imported.members, lineup: imported.lineup };
      return persist({ ...state, activeTeamId: team.id, teams: [...state.teams, team] });
    },
    updateLineup(state, teamId, lineup) {
      return persist({ ...state, teams: state.teams.map((team) => team.id === teamId
        ? { ...team, lineup: { ...team.lineup, ...lineup }, updatedAt: now() } : team) });
    },
    create(state, name) {
      const team = createEmptyTeam(name, { idFactory, now });
      return persist({
        ...state,
        activeTeamId: team.id,
        teams: [...state.teams, team],
      });
    },
    duplicate(state, teamId, name) {
      const source = state.teams.find((team) => team.id === teamId);
      if (!source) throw new TypeError("要复制的队伍不存在");
      const timestamp = now();
      const duplicate = {
        ...cloneJson(source),
        createdAt: timestamp,
        id: idFactory(),
        name: name ?? `${source.name} 副本`,
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
    moveMember(state, teamId, from, to) {
      if (![from, to].every((index) => Number.isInteger(index) && index >= 0 && index <= 5)) {
        throw new RangeError("队伍成员位置必须是 0 到 5");
      }
      const source = state.teams.find((team) => team.id === teamId);
      if (!source) throw new TypeError("要调整的队伍不存在");
      if (from === to || !source.members[from]) return state;
      const members = [...source.members];
      const [member] = members.splice(from, 1);
      members.splice(to, 0, member);
      return persist({
        ...state,
        teams: state.teams.map((team) => team.id === teamId
          ? { ...team, members, updatedAt: now() }
          : team),
      });
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
          const previous = members[index];
          members[index] = serverId === "global" ? cloneJson(member) : sanitizeMember(member && { ...member,
            ivsPending: previous?.ivsPending === true && previous.spiritId === member.spiritId &&
              STAT_KEYS.every((stat) => Number(previous.displayIvs[stat]) === Number(member.displayIvs?.[stat] ?? 0)),
            ...(previous?.spiritId === member.spiritId && previous.lineupSource
              ? { lineupSource: previous.lineupSource } : {}),
          });
          return { ...team, members, updatedAt: now() };
        }),
      });
    },
  };
}
