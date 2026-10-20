import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { storageIssueSource } from "../i18n/storage-errors.js";
import { assertRepositoryEnvironment } from "../state/server-storage.js";
import { favoritesRepository } from "../state/favorites.js";
import {
  applyFavoriteConfigLibraryImport as applyLibraryImport,
  buildFavoriteConfigLibrary as buildLibrary,
  parseFavoriteConfigLibrary as parseLibrary,
} from "../state/favorite-config-library.js";
import {
  isCompleteSpiritConfig,
  spiritConfigsRepository,
} from "../state/spirit-configs.js";
import {
  createTeamMemberFromSide,
  teamPresetsRepository,
} from "../state/team-presets.js";

const DEFAULT_FACTORIES = {
  favorites: (options) => favoritesRepository(undefined, options),
  spiritConfigs: spiritConfigsRepository,
  teams: teamPresetsRepository,
};

const EMPTY_SPIRIT_CONFIGS = { configs: {}, schemaVersion: 2 };
const EMPTY_TEAMS = {
  activeTeamId: null,
  schemaVersion: 1,
  teams: [],
  warning: "当前环境无法保存队伍",
};

function createStore(factory, options, report) {
  try {
    return factory(options);
  } catch (error) {
    report(error);
    return null;
  }
}

function loadFavorites(store, report) {
  try {
    return new Set(
      (store?.list() ?? [])
        .filter((favorite) => favorite.kind === "spirit")
        .map((favorite) => favorite.spiritId),
    );
  } catch (error) {
    report(error);
    return new Set();
  }
}

function loadSpiritConfigs(store, snapshot, report) {
  try {
    const state = store?.load(snapshot) ?? EMPTY_SPIRIT_CONFIGS;
    if (state.warning) report({ message: state.warning });
    return state;
  } catch (error) {
    report(error);
    return EMPTY_SPIRIT_CONFIGS;
  }
}

function loadTeams(store, snapshot, report) {
  try {
    const state = store?.load(snapshot) ?? EMPTY_TEAMS;
    if (state.warning) report({ message: state.warning });
    return state;
  } catch (error) {
    report(error);
    return EMPTY_TEAMS;
  }
}

function initializeStoredData(factories, serverId, snapshot) {
  const warnings = [];
  const report = (error) => warnings.push(storageIssueSource(error));
  const stores = {
    favorites: createStore(factories.favorites, { serverId }, report),
    spiritConfigs: createStore(factories.spiritConfigs, { serverId }, report),
    teams: createStore(factories.teams, { serverId }, report),
  };
  const favorites = loadFavorites(stores.favorites, report);
  const configs = loadSpiritConfigs(stores.spiritConfigs, snapshot, report);
  const teams = loadTeams(stores.teams, snapshot, report);
  return { stores, favorites, configs, teams, warning: warnings[0] ?? "" };
}

export function useStoredCalculatorData(
  snapshot,
  { factories = DEFAULT_FACTORIES, onToast = () => {}, serverId = "cn" } = {},
) {
  assertRepositoryEnvironment(serverId, snapshot);
  const { t } = useLocale();
  const startup = useMemo(() => initializeStoredData(factories, serverId, snapshot), [factories, serverId, snapshot]);
  const { stores } = startup;
  const [favoriteSpiritIds, setFavoriteSpiritIds] = useState(startup.favorites);
  const [spiritConfigsState, setSpiritConfigsState] = useState(startup.configs);
  const spiritConfigsRef = useRef(spiritConfigsState);
  const [teamsState, setTeamsState] = useState(startup.teams);
  useEffect(() => { if (startup.warning) onToast(t(startup.warning)); }, [startup.warning, onToast, t]);
  const teamsStateRef = useRef(teamsState);
  useEffect(() => {
    // Hydrate mutable external stores at a server/catalog boundary, not derived UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavoriteSpiritIds(startup.favorites);
    spiritConfigsRef.current = startup.configs;
    setSpiritConfigsState(startup.configs);
    teamsStateRef.current = startup.teams;
    setTeamsState(startup.teams);
    // Reload only when the server/catalog changes, not for an inline factory object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, snapshot]);
  const completeSpiritIds = useMemo(
    () =>
      new Set(
        (serverId === "global" ? [] : Object.values(spiritConfigsState.configs))
          .filter(isCompleteSpiritConfig)
          .map((config) => config.spiritId),
      ),
    [spiritConfigsState, serverId],
  );

  function rememberSide(side) {
    if (!stores.spiritConfigs || !side?.spiritId || (serverId === "cn" && side.battleForm)) return;
    try {
      const nextConfigs = stores.spiritConfigs.save(
        spiritConfigsRef.current,
        side,
        snapshot,
      );
      if (!nextConfigs) {
        onToast(t("配置保存失败"));
        return;
      }
      spiritConfigsRef.current = nextConfigs;
      setSpiritConfigsState(nextConfigs);
    } catch (error) {
      onToast(t(storageIssueSource(error, "配置保存失败")));
    }
  }

  function getSpiritConfiguration(spiritId) {
    const config = spiritConfigsRef.current.configs[spiritId];
    return config?.needsRepair ? undefined : config;
  }

  function clearSpiritConfigs() {
    let nextConfigs = EMPTY_SPIRIT_CONFIGS;
    try {
      nextConfigs = stores.spiritConfigs?.clear() ?? EMPTY_SPIRIT_CONFIGS;
    } catch (error) {
      onToast(t(storageIssueSource(error, "配置保存失败")));
    }
    spiritConfigsRef.current = nextConfigs;
    setSpiritConfigsState(nextConfigs);
    return nextConfigs;
  }

  function clearIncompleteSpiritConfigs() {
    let nextConfigs = spiritConfigsRef.current;
    try {
      nextConfigs = stores.spiritConfigs?.clearIncomplete?.(
        spiritConfigsRef.current,
        snapshot,
      ) ?? spiritConfigsRef.current;
    } catch (error) {
      onToast(t(storageIssueSource(error, "配置保存失败")));
    }
    spiritConfigsRef.current = nextConfigs;
    setSpiritConfigsState(nextConfigs);
    return nextConfigs;
  }

  function toggleSpiritFavorite(spirit, configuration) {
    if (!stores.favorites) {
      onToast(t("当前环境无法保存收藏"));
      return;
    }
    try {
      const next = new Set(favoriteSpiritIds);
      if (next.has(spirit.id)) {
        const remaining = stores.favorites.remove(`spirit:${spirit.id}`);
        if (remaining === null) {
          onToast(t("收藏保存失败"));
          return;
        }
        next.delete(spirit.id);
        onToast(t("已取消收藏 {name}", { name: spirit.fullName }));
      } else {
        const saved = stores.favorites.save({
          fullName: spirit.fullName,
          id: `spirit:${spirit.id}`,
          kind: "spirit",
          spiritId: spirit.id,
        });
        if (!saved) {
          onToast(t("收藏保存失败"));
          return;
        }
        next.add(spirit.id);
        if (configuration?.spiritId === spirit.id) rememberSide(configuration);
        onToast(t("已收藏 {name}", { name: spirit.fullName }));
      }
      setFavoriteSpiritIds(next);
    } catch (error) {
      onToast(t(storageIssueSource(error, "收藏保存失败")));
    }
  }

  function buildFavoriteConfigLibrary(options) {
    return buildLibrary({
      ...options,
      favorites: stores.favorites?.list() ?? [],
      snapshot,
      serverId,
      spiritConfigs: spiritConfigsRef.current,
    });
  }

  function previewFavoriteConfigLibrary(json, currentVersions, historicalEntries = []) {
    return parseLibrary(json, {
      currentVersions,
      historicalEntries,
      existingFavorites: stores.favorites?.list() ?? [],
      existingSpiritConfigs: spiritConfigsRef.current,
      snapshot,
      serverId,
    });
  }

  function importFavoriteConfigLibrary(parsed) {
    if (!stores.favorites || !stores.spiritConfigs) {
      throw new TypeError("当前环境无法保存配置库");
    }
    const result = applyLibraryImport({
      favoritesRepository: stores.favorites,
      parsed,
      snapshot,
      serverId,
      spiritConfigsRepository: stores.spiritConfigs,
    });
    const nextFavoriteIds = new Set(
      result.favorites
        .filter((favorite) => favorite.kind === "spirit")
        .map((favorite) => favorite.spiritId),
    );
    spiritConfigsRef.current = result.configs;
    setSpiritConfigsState(result.configs);
    setFavoriteSpiritIds(nextFavoriteIds);
    return result;
  }

  function mutateTeams(mutation, onSuccess) {
    if (!stores.teams) return false;
    try {
      const next = mutation(teamsStateRef.current);
      if (next?.writeFailed) {
        onToast(t("队伍保存失败"));
        return false;
      }
      teamsStateRef.current = next;
      setTeamsState(next);
      onSuccess?.();
      return true;
    } catch (error) {
      onToast(t(storageIssueSource(error, "队伍保存失败")));
      return false;
    }
  }

  function setActiveTeam(id) {
    return mutateTeams((current) => stores.teams.setActive(current, id));
  }

  function captureSide(side, teamId, index, calculatorSide) {
    if (serverId === "cn" && calculatorSide?.battleForm) {
      onToast(t("当前为本场形态，请重新载入预设后再存入队伍"));
      return false;
    }
    if (!stores.teams) {
      onToast(t("当前环境无法保存队伍"));
      return false;
    }
    let member;
    try {
      member = createTeamMemberFromSide(calculatorSide, { serverId });
      if (!member?.spiritId) throw new TypeError("当前计算方没有可保存的精灵");
    } catch (error) {
      onToast(t(storageIssueSource(error, "当前计算方没有可保存的精灵")));
      return false;
    }
    return mutateTeams(
      (current) => stores.teams.updateMember(current, teamId, index, member),
      () => {
        const spirit = snapshot.spirits.find(
          (candidate) => candidate.id === member.spiritId,
        );
        onToast(
          t("已把{side} {name} 存入{index}号位", { side: t(side === "attacker" ? "攻击方" : "防御方"), name: spirit?.fullName ?? t("当前精灵"), index: index + 1 }),
        );
      },
    );
  }

  function createTeam(name) {
    if (stores.teams) {
      return mutateTeams((current) => stores.teams.create(current, name));
    }
    onToast(t("当前环境无法保存队伍"));
    return false;
  }

  function deleteTeam(id) {
    return mutateTeams((current) => stores.teams.remove(current, id));
  }

  function duplicateTeam(id) {
    return mutateTeams((current) => stores.teams.duplicate(current, id, t("{name} 副本", { name: current.teams.find((team) => team.id === id)?.name ?? "" })));
  }

  function updateTeamMember(teamId, index, member) {
    return mutateTeams((current) =>
      stores.teams.updateMember(current, teamId, index, member),
    );
  }

  function renameTeam(id, name) {
    return mutateTeams((current) => stores.teams.rename(current, id, name));
  }

  return {
    comparisonPresets: Object.fromEntries(Object.entries(spiritConfigsState.configs).filter(([id, config]) =>
      !config.needsRepair && (favoriteSpiritIds.has(id) || config.presetBaseline || (serverId === "cn" && isCompleteSpiritConfig(config))))),
    buildFavoriteConfigLibrary,
    clearIncompleteSpiritConfigs,
    clearSpiritConfigs,
    completeSpiritIds,
    favoriteSpiritIds,
    getSpiritConfiguration,
    importFavoriteConfigLibrary,
    previewFavoriteConfigLibrary,
    rememberSide,
    teams: {
      captureSide,
      create: createTeam,
      importTeam: (team) => mutateTeams((current) => stores.teams.importTeam(current, team)),
      updateLineup: (id, lineup) => mutateTeams((current) => stores.teams.updateLineup(current, id, lineup)),
      duplicate: duplicateTeam,
      remove: deleteTeam,
      rename: renameTeam,
      setActive: setActiveTeam,
      updateMember: updateTeamMember,
    },
    teamsState,
    toggleSpiritFavorite,
  };
}
