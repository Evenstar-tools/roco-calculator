import { useMemo, useRef, useState } from "react";
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
  favorites: favoritesRepository,
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

function createStore(factory) {
  try {
    return factory();
  } catch {
    return null;
  }
}

function loadFavorites(store) {
  try {
    return new Set(
      (store?.list() ?? [])
        .filter((favorite) => favorite.kind === "spirit")
        .map((favorite) => favorite.spiritId),
    );
  } catch {
    return new Set();
  }
}

function loadSpiritConfigs(store, snapshot) {
  try {
    return store?.load(snapshot) ?? EMPTY_SPIRIT_CONFIGS;
  } catch {
    return EMPTY_SPIRIT_CONFIGS;
  }
}

function loadTeams(store, snapshot) {
  try {
    return store?.load(snapshot) ?? EMPTY_TEAMS;
  } catch {
    return EMPTY_TEAMS;
  }
}

export function useStoredCalculatorData(
  snapshot,
  { factories = DEFAULT_FACTORIES, onToast = () => {} } = {},
) {
  const stores = useMemo(
    () => ({
      favorites: createStore(factories.favorites),
      spiritConfigs: createStore(factories.spiritConfigs),
      teams: createStore(factories.teams),
    }),
    [factories],
  );
  const [favoriteSpiritIds, setFavoriteSpiritIds] = useState(() =>
    loadFavorites(stores.favorites),
  );
  const [spiritConfigsState, setSpiritConfigsState] = useState(() =>
    loadSpiritConfigs(stores.spiritConfigs, snapshot),
  );
  const spiritConfigsRef = useRef(spiritConfigsState);
  const [teamsState, setTeamsState] = useState(() =>
    loadTeams(stores.teams, snapshot),
  );
  const completeSpiritIds = useMemo(
    () =>
      new Set(
        Object.values(spiritConfigsState.configs)
          .filter(isCompleteSpiritConfig)
          .map((config) => config.spiritId),
      ),
    [spiritConfigsState],
  );

  function rememberSide(side) {
    if (!stores.spiritConfigs || !side?.spiritId) return;
    try {
      const nextConfigs = stores.spiritConfigs.save(
        spiritConfigsRef.current,
        side,
        snapshot,
      );
      spiritConfigsRef.current = nextConfigs;
      setSpiritConfigsState(nextConfigs);
    } catch {
      onToast("配置保存失败");
    }
  }

  function getSpiritConfiguration(spiritId) {
    return spiritConfigsRef.current.configs[spiritId];
  }

  function clearSpiritConfigs() {
    let nextConfigs = EMPTY_SPIRIT_CONFIGS;
    try {
      nextConfigs = stores.spiritConfigs?.clear() ?? EMPTY_SPIRIT_CONFIGS;
    } catch {
      onToast("配置保存失败");
    }
    spiritConfigsRef.current = nextConfigs;
    setSpiritConfigsState(nextConfigs);
    return nextConfigs;
  }

  function toggleSpiritFavorite(spirit) {
    if (!stores.favorites) {
      onToast("当前环境无法保存收藏");
      return;
    }
    try {
      const next = new Set(favoriteSpiritIds);
      if (next.has(spirit.id)) {
        next.delete(spirit.id);
        stores.favorites.remove(`spirit:${spirit.id}`);
        onToast(`已取消收藏 ${spirit.fullName}`);
      } else {
        next.add(spirit.id);
        stores.favorites.save({
          fullName: spirit.fullName,
          id: `spirit:${spirit.id}`,
          kind: "spirit",
          spiritId: spirit.id,
        });
        onToast(`已收藏 ${spirit.fullName}`);
      }
      setFavoriteSpiritIds(next);
    } catch {
      onToast("收藏保存失败");
    }
  }

  function buildFavoriteConfigLibrary(options) {
    return buildLibrary({
      ...options,
      favorites: stores.favorites?.list() ?? [],
      snapshot,
      spiritConfigs: spiritConfigsRef.current,
    });
  }

  function previewFavoriteConfigLibrary(json, currentVersions) {
    return parseLibrary(json, {
      currentVersions,
      existingFavorites: stores.favorites?.list() ?? [],
      existingSpiritConfigs: spiritConfigsRef.current,
      snapshot,
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
    if (!stores.teams) return;
    setTeamsState((current) => {
      try {
        const next = mutation(current);
        onSuccess?.();
        return next;
      } catch {
        onToast("队伍保存失败");
        return current;
      }
    });
  }

  function setActiveTeam(id) {
    mutateTeams((current) => stores.teams.setActive(current, id));
  }

  function captureSide(side, teamId, index, calculatorSide) {
    if (!stores.teams) {
      onToast("当前环境无法保存队伍");
      return;
    }
    let member;
    try {
      member = createTeamMemberFromSide(calculatorSide);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "队伍保存失败");
      return;
    }
    mutateTeams(
      (current) => stores.teams.updateMember(current, teamId, index, member),
      () => {
        const spirit = snapshot.spirits.find(
          (candidate) => candidate.id === member.spiritId,
        );
        onToast(
          `已把${side === "attacker" ? "攻击方" : "防御方"} ${
            spirit?.fullName ?? "当前精灵"
          } 存入${index + 1}号位`,
        );
      },
    );
  }

  function createTeam(name) {
    if (stores.teams) {
      mutateTeams((current) => stores.teams.create(current, name));
    } else {
      onToast("当前环境无法保存队伍");
    }
  }

  function deleteTeam(id) {
    mutateTeams((current) => stores.teams.remove(current, id));
  }

  function duplicateTeam(id) {
    mutateTeams((current) => stores.teams.duplicate(current, id));
  }

  function updateTeamMember(teamId, index, member) {
    mutateTeams((current) =>
      stores.teams.updateMember(current, teamId, index, member),
    );
  }

  function renameTeam(id, name) {
    mutateTeams((current) => stores.teams.rename(current, id, name));
  }

  return {
    buildFavoriteConfigLibrary,
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
