import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useStoredCalculatorData } from "../../src/hooks/useStoredCalculatorData.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";
import { createProductInitialState } from "../../src/state/calculator-session.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { teamPresetsRepository } from "../../src/state/team-presets.js";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { getGlobalEntityText } from "../../src/runtime/global-entity-localization.js";
import globalSnapshot from "../../data/snapshots/global/s3-midseason.json";

test("Global favorite and team feedback follows the language without translating stored identity or team names", () => {
  const spirit = globalSnapshot.spirits.find((entry) => entry.fullName === "迪莫");
  const side = { ...createProductInitialState(globalSnapshot).sides.attacker, spiritId: spirit.id };
  const favoriteStore = { list: () => [], save: vi.fn((value) => [value]), remove: vi.fn(() => []) };
  const teamState = { activeTeamId: "mine", schemaVersion: 1, teams: [{ id: "mine", name: "我的 My Team", members: Array(6).fill(null) }] };
  const teamStore = { load: () => teamState, updateMember: vi.fn((current, _id, index, member) => ({
    ...current, teams: current.teams.map((team) => ({ ...team, members: team.members.map((previous, position) => position === index ? member : previous) })),
  })) };
  const factories = { favorites: () => favoriteStore, spiritConfigs: () => ({ load: () => ({ configs: {}, schemaVersion: 2 }) }), teams: () => teamStore };
  const onToast = vi.fn();
  let locale = "en";
  const { result, rerender } = renderHook(() => useStoredCalculatorData(globalSnapshot, { serverId: "global", factories, onToast }), {
    wrapper: ({ children }) => <LocaleProvider locale={locale}>{children}</LocaleProvider>,
  });
  act(() => result.current.toggleSpiritFavorite(spirit));
  expect(onToast).toHaveBeenLastCalledWith("Added Dimo to favorites");
  expect(favoriteStore.save).toHaveBeenCalledWith(expect.objectContaining({ spiritId: spirit.id, fullName: "迪莫" }));
  locale = "ja";
  rerender();
  expect(result.current.favoriteSpiritIds.has(spirit.id)).toBe(true);
  act(() => result.current.toggleSpiritFavorite(spirit));
  expect(onToast).toHaveBeenLastCalledWith(`${getGlobalEntityText("spirit", spirit, "fullName", "ja")}をお気に入りから削除しました`);
  act(() => expect(result.current.teams.captureSide("attacker", "mine", 0, side)).toBe(true));
  expect(onToast).toHaveBeenLastCalledWith(`攻撃側の${getGlobalEntityText("spirit", spirit, "fullName", "ja")}を1番枠に保存しました`);
  expect(result.current.teamsState.teams[0]).toMatchObject({ name: "我的 My Team", members: [expect.objectContaining({ spiritId: spirit.id }), null, null, null, null, null] });
  locale = "zh-CN";
  rerender();
  act(() => result.current.toggleSpiritFavorite(spirit));
  expect(onToast).toHaveBeenLastCalledWith("已收藏 迪莫");
  expect(result.current.teamsState.teams[0].name).toBe("我的 My Team");
});

test.each([["en", "copy"], ["ja", "のコピー"]])("%s duplicates the exact custom team name with only a localized suffix", (locale, suffix) => {
  localStorage.clear();
  const store = teamPresetsRepository({ serverId: "global" });
  const initial = store.create(store.load(globalSnapshot), "My team・普通");
  const { result, unmount } = renderHook(() => useStoredCalculatorData(globalSnapshot, { serverId: "global" }), {
    wrapper: ({ children }) => <LocaleProvider locale={locale}>{children}</LocaleProvider>,
  });
  act(() => result.current.teams.duplicate(initial.activeTeamId));
  expect(result.current.teamsState.teams.map((team) => team.name)).toEqual(["My team・普通", `My team・普通 ${suffix}`]);
  unmount();
  localStorage.clear();
});

test("Global references restore after catalog loading and capture unset input into their own team store", () => {
  localStorage.clear();
  const catalog = globalPlaceholderCatalog();
  const side = { ...createProductInitialState(catalog).sides.attacker, spiritId: catalog.spirits[0].id };
  side.skills.four[0] = { skillId: catalog.skills[0].id, context: { rainWeather: false, custom: 42 } };
  const repo = spiritConfigsRepository({ serverId: "global" });
  repo.save(repo.load(UNVERIFIED_GLOBAL_SNAPSHOT), side, UNVERIFIED_GLOBAL_SNAPSHOT);
  const { result, rerender, unmount } = renderHook(({ current }) => useStoredCalculatorData(current, { serverId: "global" }), {
    initialProps: { current: UNVERIFIED_GLOBAL_SNAPSHOT },
  });
  expect(result.current.getSpiritConfiguration(side.spiritId)).toBeUndefined();
  rerender({ current: catalog });
  expect(result.current.getSpiritConfiguration(side.spiritId)).toMatchObject(side);
  expect(result.current.completeSpiritIds.size).toBe(0);
  act(() => result.current.teams.create("Global草稿"));
  const teamId = result.current.teamsState.activeTeamId;
  act(() => expect(result.current.teams.captureSide("attacker", teamId, 0, side)).toBe(true));
  const member = teamPresetsRepository({ serverId: "global" }).load(catalog).teams[0].members[0];
  expect(member).toMatchObject({ spiritId: side.spiritId, natureId: null, displayIvs: side.displayIvs, skills: side.skills });
  expect(teamPresetsRepository().load({ spirits: [], skills: [] }).teams).toEqual([]);
  unmount();
  localStorage.clear();
});

test("Global current battle forms are not saved as personal presets or team members", () => {
  localStorage.clear();
  const spirit = globalSnapshot.spirits.find((entry) => entry.fullName === "迪莫");
  const side = { ...createProductInitialState(globalSnapshot).sides.attacker, spiritId: spirit.id,
    battleForm: { spiritId: spirit.id, branchId: spirit.id } };
  const onToast = vi.fn();
  const { result, unmount } = renderHook(() => useStoredCalculatorData(globalSnapshot, { serverId: "global", onToast }));
  act(() => result.current.rememberSide(side));
  expect(result.current.getSpiritConfiguration(side.spiritId)).toBeUndefined();
  expect(spiritConfigsRepository({ serverId: "global" }).load(globalSnapshot).configs[side.spiritId]).toBeUndefined();
  act(() => result.current.teams.create("我的队伍"));
  const teamId = result.current.teamsState.activeTeamId;
  act(() => expect(result.current.teams.captureSide("attacker", teamId, 0, side)).toBe(false));
  expect(teamPresetsRepository({ serverId: "global" }).load(globalSnapshot).teams[0].members[0]).toBeNull();
  expect(onToast).toHaveBeenLastCalledWith("当前为本场形态，请重新载入预设后再存入队伍");
  unmount();
  localStorage.clear();
});

const snapshot = {
  meta: { id: "s3-storage" },
  skills: [{ id: "skill-a" }],
  spirits: [{ fullName: "火灵", id: "fire" }],
};

test("本场形态不写入个人预设或静默存成原精灵队伍成员", () => {
  const save = vi.fn(), updateMember = vi.fn(), onToast = vi.fn();
  const factories = {
    favorites: () => ({ list: () => [] }),
    spiritConfigs: () => ({ load: () => ({ configs: {}, schemaVersion: 2 }), save }),
    teams: () => ({ load: () => ({ teams: [] }), updateMember }),
  };
  const { result } = renderHook(() => useStoredCalculatorData(snapshot, { factories, onToast }));
  const side = { spiritId: "fire", battleForm: { spiritId: "small", branchId: "fire" } };
  act(() => {
    result.current.rememberSide(side);
    expect(result.current.teams.captureSide("attacker", "team-1", 0, side)).toBe(false);
  });
  expect(save).not.toHaveBeenCalled();
  expect(updateMember).not.toHaveBeenCalled();
  expect(onToast).toHaveBeenCalledWith(expect.stringContaining("本场形态"));
});

test("临时配置不冒充预设，收藏时保存当前分配并跟随后续修改", () => {
  const values = new Map();
  const favoriteStore = { list: () => [], save: vi.fn((value) => [value]) };
  const spiritStore = { load: () => ({ configs: {}, schemaVersion: 2 }), save: (_current, side) => { values.set(side.spiritId, side); return { configs: Object.fromEntries(values), schemaVersion: 2 }; } };
  const factories = { favorites: () => favoriteStore, spiritConfigs: () => spiritStore, teams: () => ({ load: () => ({ teams: [] }) }) };
  const { result } = renderHook(() => useStoredCalculatorData(snapshot, { factories }));
  const side = { spiritId: "fire", nature: "neutral", displayIvs: { hp: 60 }, skills: { four: [] } };
  act(() => result.current.rememberSide(side));
  expect(result.current.comparisonPresets).toEqual({});
  act(() => result.current.rememberSide({ ...side, presetBaseline: "imported-preset" }));
  expect(result.current.comparisonPresets.fire.nature).toBe("neutral");
  act(() => result.current.toggleSpiritFavorite(snapshot.spirits[0], side));
  expect(result.current.comparisonPresets.fire).toEqual(side);
  act(() => result.current.rememberSide({ ...side, nature: "timid" }));
  expect(result.current.comparisonPresets.fire.nature).toBe("timid");
});

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

    let mutationResult;
    act(() => {
      mutationResult = mutate(result.current.teams);
    });

    expect(mutationResult).toBe(false);
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

  let captureResult;
  act(() => {
    captureResult = result.current.teams.captureSide(
      "attacker",
      "team-1",
      3,
      side,
    );
  });

  expect(captureResult).toBe(true);
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
