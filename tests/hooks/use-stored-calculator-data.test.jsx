import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useStoredCalculatorData } from "../../src/hooks/useStoredCalculatorData.js";

const snapshot = {
  meta: { id: "s3-storage" },
  skills: [{ id: "skill-a" }],
  spirits: [{ fullName: "火灵", id: "fire" }],
};

test("loads repositories once and coordinates personal persistence", () => {
  const favoriteStore = {
    list: vi.fn(() => []),
    remove: vi.fn(),
    save: vi.fn(),
  };
  const spiritState = { configs: {}, schemaVersion: 1 };
  const spiritStore = {
    clear: vi.fn(() => spiritState),
    load: vi.fn(() => spiritState),
    save: vi.fn((current, side) => ({
      configs: { ...current.configs, [side.spiritId]: side },
      schemaVersion: 1,
    })),
  };
  const teamState = { activeTeamId: null, schemaVersion: 1, teams: [] };
  const teamStore = { load: vi.fn(() => teamState) };
  const factories = {
    favorites: vi.fn(() => favoriteStore),
    spiritConfigs: vi.fn(() => spiritStore),
    teams: vi.fn(() => teamStore),
  };
  const onToast = vi.fn();

  const { result, rerender } = renderHook(() =>
    useStoredCalculatorData(snapshot, { factories, onToast }),
  );
  rerender();

  expect(factories.favorites).toHaveBeenCalledTimes(1);
  expect(factories.spiritConfigs).toHaveBeenCalledTimes(1);
  expect(factories.teams).toHaveBeenCalledTimes(1);
  expect(spiritStore.load).toHaveBeenCalledTimes(1);
  expect(teamStore.load).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.rememberSide({ spiritId: "fire" });
  });

  expect(result.current.getSpiritConfiguration("fire")).toEqual({
    spiritId: "fire",
  });
  expect(spiritStore.save).toHaveBeenCalledWith(
    spiritState,
    { spiritId: "fire" },
    snapshot,
  );
  expect(onToast).not.toHaveBeenCalled();
});

test("degrades repository creation failures without blocking the workspace", () => {
  const onToast = vi.fn();
  const { result } = renderHook(() =>
    useStoredCalculatorData(snapshot, {
      factories: {
        favorites: () => {
          throw new Error("unavailable");
        },
        spiritConfigs: () => {
          throw new Error("unavailable");
        },
        teams: () => {
          throw new Error("unavailable");
        },
      },
      onToast,
    }),
  );

  expect(result.current.favoriteSpiritIds.size).toBe(0);
  expect(result.current.teamsState.warning).toBe("当前环境无法保存队伍");
  act(() => result.current.toggleSpiritFavorite(snapshot.spirits[0]));
  expect(onToast).toHaveBeenCalledWith("当前环境无法保存收藏");
});

test.each([
  ["create", (teams) => teams.create("新队伍")],
  ["updateMember", (teams) => teams.updateMember("team-1", 0, null)],
  ["rename", (teams) => teams.rename("team-1", "新名称")],
])(
  "keeps team state when the %s repository mutation throws",
  (method, mutate) => {
    const teamState = {
      activeTeamId: "team-1",
      schemaVersion: 1,
      teams: [
        {
          id: "team-1",
          members: Array(6).fill(null),
          name: "原队伍",
        },
      ],
    };
    const teamStore = {
      create: vi.fn((state) => state),
      duplicate: vi.fn((state) => state),
      load: vi.fn(() => teamState),
      remove: vi.fn((state) => state),
      rename: vi.fn((state) => state),
      setActive: vi.fn((state) => state),
      updateMember: vi.fn((state) => state),
    };
    teamStore[method].mockImplementation(() => {
      throw new Error("storage write failed");
    });
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useStoredCalculatorData(snapshot, {
        factories: {
          favorites: () => ({ list: () => [] }),
          spiritConfigs: () => ({
            load: () => ({ configs: {}, schemaVersion: 1 }),
          }),
          teams: () => teamStore,
        },
        onToast,
      }),
    );

    act(() => mutate(result.current.teams));

    expect(result.current.teamsState).toBe(teamState);
    expect(onToast).toHaveBeenCalledWith("队伍保存失败");
  },
);

test("captures only the requested team slot without saving a personal configuration", () => {
  const teamState = {
    activeTeamId: "team-1",
    schemaVersion: 1,
    teams: [
      {
        id: "team-1",
        members: Array(6).fill(null),
        name: "主队",
      },
    ],
  };
  const teamStore = {
    load: vi.fn(() => teamState),
    updateMember: vi.fn((state, teamId, index, member) => ({
      ...state,
      teams: state.teams.map((team) => {
        if (team.id !== teamId) return team;
        const members = [...team.members];
        members[index] = member;
        return { ...team, members };
      }),
    })),
  };
  const spiritStore = {
    load: vi.fn(() => ({ configs: {}, schemaVersion: 1 })),
    save: vi.fn(),
  };
  const { result } = renderHook(() =>
    useStoredCalculatorData(snapshot, {
      factories: {
        favorites: () => ({ list: () => [] }),
        spiritConfigs: () => spiritStore,
        teams: () => teamStore,
      },
    }),
  );
  const side = {
    displayIvs: {
      hp: 0,
      speed: 60,
      physicalAttack: 60,
      magicalAttack: 60,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    nature: "adamant",
    skills: {
      four: [
        {
          context: { nested: { stacks: 2 } },
          overrides: { basePower: 100 },
          skillId: "skill-a",
        },
        null,
        null,
        null,
      ],
      single: "skill-a",
    },
    spiritId: "fire",
  };

  act(() => {
    result.current.teams.captureSide("attacker", "team-1", 3, side);
  });

  expect(result.current.teamsState.teams[0].members.slice(0, 3)).toEqual([
    null,
    null,
    null,
  ]);
  expect(result.current.teamsState.teams[0].members[3]).toMatchObject({
    natureId: "adamant",
    spiritId: "fire",
  });
  expect(result.current.teamsState.teams[0].members.slice(4)).toEqual([
    null,
    null,
  ]);
  expect(spiritStore.save).not.toHaveBeenCalled();
  side.skills.four[0].context.nested.stacks = 9;
  expect(
    result.current.teamsState.teams[0].members[3].skills.four[0].context.nested
      .stacks,
  ).toBe(2);
});

test("imports a configuration library and refreshes favorites and personal memory immediately", () => {
  let favorites = [];
  let configs = { configs: {}, schemaVersion: 2 };
  const favoriteStore = {
    list: () => structuredClone(favorites),
    replace: (next) => {
      favorites = structuredClone(next);
      return favorites;
    },
  };
  const spiritStore = {
    load: () => structuredClone(configs),
    replace: (next) => {
      configs = structuredClone(next);
      return configs;
    },
  };
  const { result } = renderHook(() =>
    useStoredCalculatorData(snapshot, {
      factories: {
        favorites: () => favoriteStore,
        spiritConfigs: () => spiritStore,
        teams: () => ({
          load: () => ({ activeTeamId: null, schemaVersion: 1, teams: [] }),
        }),
      },
    }),
  );
  const json = JSON.stringify({
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
    appVersion: "1.3.1",
    versions: {},
    exportedAt: "2026-08-03T00:00:00.000Z",
    entryCount: 1,
    entries: [{
      spiritId: "fire",
      natureId: "adamant",
      displayIvs: {
        hp: 0,
        speed: 60,
        physicalAttack: 60,
        magicalAttack: 60,
        physicalDefense: 0,
        magicalDefense: 0,
      },
      skills: ["skill-a", null, null, null],
      traitValues: {},
    }],
  });

  act(() => {
    const parsed = result.current.previewFavoriteConfigLibrary(json, {});
    result.current.importFavoriteConfigLibrary(parsed);
  });

  expect(result.current.favoriteSpiritIds).toEqual(new Set(["fire"]));
  expect(result.current.getSpiritConfiguration("fire")).toMatchObject({
    natureId: "adamant",
    spiritId: "fire",
  });
});
