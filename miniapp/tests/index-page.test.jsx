import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __getShareMessage,
  __setRouterParams,
} from "@tarojs/taro";
import Taro from "@tarojs/taro";
import IndexPage, {
  createDefaultServices,
} from "../src/pages/index/index.jsx";
import { encodeSharePayload } from "../src/share/payload.js";
import { createInitialState } from "../src/shared/state/defaults.js";
import { createRuntimeConfig } from "../src/config/runtime.js";

function createSnapshot() {
  return {
    meta: {
      id: "data-v1",
      rulesVersion: "rules-v1",
    },
    spirits: [
      {
        id: "spirit-a",
        fullName: "音速犬",
        raceStats: {
          hp: 120,
          magicalAttack: 95,
          magicalDefense: 100,
          physicalAttack: 125,
          physicalDefense: 105,
          speed: 110,
        },
        types: ["火"],
      },
      {
        id: "spirit-b",
        fullName: "水灵",
        raceStats: {
          hp: 130,
          magicalAttack: 120,
          magicalDefense: 110,
          physicalAttack: 90,
          physicalDefense: 115,
          speed: 95,
        },
        types: ["水"],
      },
    ],
    skills: [
      { id: "skill-a", name: "火焰冲锋" },
      { id: "skill-b", name: "气泡" },
      { id: "skill-c", name: "防御" },
      { id: "skill-d", name: "闪光" },
    ],
  };
}

function createServices(load) {
  return {
    dataService: {
      load,
    },
  };
}

function createUserSettingServices({
  load = async () => ({ snapshot: createSnapshot() }),
  persistedState,
  favoriteIds = [],
  memoryEnabled = true,
} = {}) {
  const persistence = {
    clear: vi.fn(),
    getMemoryEnabled: vi.fn(() => memoryEnabled),
    load: vi.fn(() => persistedState),
    save: vi.fn(),
    setMemoryEnabled: vi.fn((value) => {
      memoryEnabled = value;
      return value;
    }),
  };
  const favoritesRepository = {
    clear: vi.fn(() => []),
    load: vi.fn(() => favoriteIds),
    toggle: vi.fn((spiritId) =>
      favoriteIds.includes(spiritId)
        ? favoriteIds.filter((id) => id !== spiritId)
        : [...favoriteIds, spiritId],
    ),
  };
  const dataService = {
    clearCache: vi.fn(),
    load: vi.fn(load),
  };
  return {
    dataService,
    favoritesRepository,
    persistence,
  };
}

function createStorageTaro(overrides = {}) {
  const values = new Map();
  return {
    getStorageSync: vi.fn((key) => values.get(key)),
    setStorageSync: vi.fn((key, value) => values.set(key, value)),
    removeStorageSync: vi.fn((key) => values.delete(key)),
    ...overrides,
  };
}

describe("IndexPage", () => {
  afterEach(() => {
    __setRouterParams();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("registers a safe share message and restores shared calculator inputs", async () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.nature = "adamant";
    const encoded = encodeSharePayload(state);
    __setRouterParams({ share: encoded });

    render(
      <IndexPage
        services={createServices(async () => ({ snapshot }))}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "四技能模式" }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(__getShareMessage().title).toMatch(/^音速犬 → 水灵｜/u);
    });
    const message = __getShareMessage();
    expect(message.path).toMatch(
      /^\/pages\/index\/index\?share=[A-Za-z0-9_-]+$/u,
    );
    expect(message.path.length).toBeLessThan(940);
  });

  test("default H5 preview services reach fixture data loading", async () => {
    const snapshot = createSnapshot();
    const services = createDefaultServices({
      taro: createStorageTaro(),
      config: createRuntimeConfig({
        previewFixture: "1",
        target: "h5",
      }),
      previewData: snapshot,
    });

    await expect(services.dataService.load()).resolves.toEqual({
      petImages: {
        spirit_db5a2cb398dc0385: expect.stringMatching(
          /spirit_db5a2cb398dc0385\.webp$/u,
        ),
        spirit_f60e2755ae42cf41: expect.stringMatching(
          /spirit_f60e2755ae42cf41\.webp$/u,
        ),
      },
      snapshot,
      source: "preview",
      stale: false,
    });
  });

  test("compiled H5 default Taro path exposes storage APIs", async () => {
    const snapshot = createSnapshot();
    const services = createDefaultServices({
      config: createRuntimeConfig({
        previewFixture: "1",
        target: "h5",
      }),
      previewData: snapshot,
    });

    await expect(services.dataService.load()).resolves.toMatchObject({
      snapshot,
      source: "preview",
    });
  });

  test("default WeApp services load bundled data without cloud configuration", async () => {
    const snapshot = createSnapshot();
    snapshot.spirits[0].imageUrl =
      "https://images.example/spirit-a.png";
    const taro = createStorageTaro({
      cloud: {
        init: vi.fn(),
      },
    });
    const services = createDefaultServices({
      bundledData: snapshot,
      taro,
    });

    await expect(services.dataService.load()).resolves.toEqual({
      petImages: {
        "spirit-a": "https://images.example/spirit-a.png",
      },
      snapshot,
      source: "bundled",
      stale: false,
    });
    expect(taro.cloud.init).not.toHaveBeenCalled();
  });

  test("default WeApp services reach valid cloud data loading", async () => {
    const snapshot = createSnapshot();
    const runtimeText = JSON.stringify(snapshot);
    const runtimeSha256 = createHash("sha256")
      .update(runtimeText, "utf8")
      .digest("hex");
    const manifest = {
      runtimeFileId: "cloud://env-test/runtime.json",
      runtimeSha256,
      petImages: {
        "spirit-a": "cloud://env-test/spirits/spirit-a.webp",
      },
    };
    const files = {
      "cloud://env-test/manifest.json": JSON.stringify(manifest),
      "cloud://env-test/runtime.json": runtimeText,
    };
    const taro = createStorageTaro({
      cloud: {
        init: vi.fn(),
        downloadFile: vi.fn(async ({ fileID }) => ({
          tempFilePath: fileID,
        })),
      },
      getFileSystemManager: vi.fn(() => ({
        readFile({ filePath, success }) {
          success({ data: files[filePath] });
        },
      })),
    });
    const services = createDefaultServices({
      taro,
      config: createRuntimeConfig({
        cloudEnv: "env-test",
        manifestFileId: "cloud://env-test/manifest.json",
        target: "weapp",
        trustedRuntimeSha256: runtimeSha256,
      }),
      previewData: snapshot,
    });

    await expect(services.dataService.load()).resolves.toEqual({
      petImages: {
        "spirit-a": "cloud://env-test/spirits/spirit-a.webp",
      },
      snapshot,
      source: "cloud",
      stale: false,
    });
    expect(taro.cloud.init).toHaveBeenCalledWith({ env: "env-test" });
  });

  test("renders a verified cloud manifest image through the real data service", async () => {
    const snapshot = createSnapshot();
    const runtimeText = JSON.stringify(snapshot);
    const runtimeSha256 = createHash("sha256")
      .update(runtimeText, "utf8")
      .digest("hex");
    const attackerImage =
      "cloud://env-test/spirits/spirit-a.webp";
    const manifest = {
      runtimeFileId: "cloud://env-test/runtime.json",
      runtimeSha256,
      petImages: {
        "spirit-a": attackerImage,
      },
    };
    const files = {
      "cloud://env-test/manifest.json": JSON.stringify(manifest),
      "cloud://env-test/runtime.json": runtimeText,
    };
    const taro = createStorageTaro({
      cloud: {
        init: vi.fn(),
        downloadFile: vi.fn(async ({ fileID }) => ({
          tempFilePath: fileID,
        })),
      },
      getFileSystemManager: vi.fn(() => ({
        readFile({ filePath, success }) {
          success({ data: files[filePath] });
        },
      })),
    });
    const services = createDefaultServices({
      taro,
      config: createRuntimeConfig({
        cloudEnv: "env-test",
        manifestFileId: "cloud://env-test/manifest.json",
        target: "weapp",
        trustedRuntimeSha256: runtimeSha256,
      }),
      previewData: snapshot,
    });

    render(<IndexPage services={services} />);

    expect(
      await screen.findByRole("img", { name: "音速犬头像" }),
    ).toHaveAttribute("src", attackerImage);
    expect(
      screen
        .getByLabelText("防守方配置")
        .querySelector(".combatant-card__image"),
    ).toBeNull();
  });

  test("shows an explicit loading state while calculator data is pending", () => {
    render(
      <IndexPage
        services={createServices(() => new Promise(() => {}))}
      />,
    );

    expect(screen.getByText("正在加载计算数据…")).toBeInTheDocument();
    expect(document.querySelector(".state-card__progress-fill"))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("攻击方配置")).not.toBeInTheDocument();
  });

  test("shows a recoverable error and retries the data load", async () => {
    const snapshot = createSnapshot();
    const load = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("计算数据加载失败，请检查网络后重试"),
      )
      .mockResolvedValueOnce({ snapshot });

    render(<IndexPage services={createServices(load)} />);

    expect(
      await screen.findByText("计算数据加载失败，请检查网络后重试"),
    ).toBeInTheDocument();
    const retryButton = screen.getByRole("button", {
      name: "重新加载",
    });
    expect(retryButton.tagName).toBe("BUTTON");
    fireEvent.click(retryButton);

    expect(await screen.findByLabelText("攻击方配置")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("creates the ready workspace from snapshot defaults", async () => {
    const snapshot = createSnapshot();
    render(
      <IndexPage
        services={createServices(async () => ({ snapshot }))}
      />,
    );

    expect(await screen.findByLabelText("攻击方配置")).toHaveTextContent(
      "音速犬",
    );
    expect(screen.getByLabelText("防守方配置")).toHaveTextContent("水灵");
    expect(screen.getByText("数据 data-v1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(
      screen.getByRole("button", { name: "重置本页" }).tagName,
    ).toBe("BUTTON");
    expect(screen.getByText("常用精灵配置")).toBeInTheDocument();
    expect(screen.queryByText(/配置库 JSON/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /头像/u }))
      .not.toBeInTheDocument();
  });

  test("restores settings and saves the latest store state once after 250ms", async () => {
    vi.useFakeTimers();
    const snapshot = createSnapshot();
    const persistedState = createInitialState(snapshot);
    persistedState.mode = "four";
    const services = createUserSettingServices({ persistedState });

    render(<IndexPage services={services} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", { name: "四技能模式" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "单技能模式" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "四技能模式" }),
    );

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(services.persistence.save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(services.persistence.save).toHaveBeenCalledTimes(1);
    expect(services.persistence.save.mock.calls[0][0].mode).toBe("four");
  });

  test("skips restore and autosave while configuration memory is disabled", async () => {
    vi.useFakeTimers();
    const snapshot = createSnapshot();
    const persistedState = createInitialState(snapshot);
    persistedState.mode = "four";
    const services = createUserSettingServices({
      memoryEnabled: false,
      persistedState,
    });

    render(<IndexPage services={services} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(services.persistence.load).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "单技能模式" }))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(services.persistence.save).not.toHaveBeenCalled();
  });

  test("turns configuration memory off and back on with immediate current-page persistence", async () => {
    const services = createUserSettingServices();
    render(<IndexPage services={services} />);
    expect(await screen.findByLabelText("攻击方配置")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    const memorySwitch = screen.getByRole("switch", { name: "配置记忆" });
    expect(memorySwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(memorySwitch);
    expect(services.persistence.setMemoryEnabled).toHaveBeenCalledWith(false);
    expect(memorySwitch).toHaveAttribute("aria-checked", "false");
    expect(services.persistence.save).not.toHaveBeenCalled();

    fireEvent.click(memorySwitch);
    expect(services.persistence.setMemoryEnabled).toHaveBeenCalledWith(true);
    expect(memorySwitch).toHaveAttribute("aria-checked", "true");
    expect(services.persistence.save).toHaveBeenCalledTimes(1);
    expect(services.persistence.save.mock.calls[0][0].mode).toBe("four");
  });

  test("imports bundled PVP presets only after tapping and applies one on selection", async () => {
    const entry = {
      displayIvs: {
        hp: 60,
        magicalAttack: 60,
        magicalDefense: 60,
        physicalAttack: 0,
        physicalDefense: 60,
        speed: 60,
      },
      natureId: "timid",
      skills: ["skill-b", null, null, null],
      spiritId: "spirit-b",
      traitValues: {},
    };
    const services = createUserSettingServices();
    services.configLibraryRepository = {
      commit: vi.fn(() => ({
        entries: [entry],
        favorites: ["spirit-b"],
        preview: { added: 1, overwritten: 0 },
        schemaVersion: 1,
      })),
      load: vi.fn(() => ({ entries: [], schemaVersion: 1 })),
      preview: vi.fn(() => ({
        entries: [entry],
        favoriteSpiritIds: ["spirit-b"],
        preview: { added: 1, overwritten: 0 },
      })),
    };
    vi.spyOn(Taro, "showToast").mockResolvedValue();

    render(<IndexPage services={services} />);
    expect(await screen.findByLabelText("攻击方配置")).toBeInTheDocument();
    expect(services.configLibraryRepository.commit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", {
      name: "导入PVP热门配置",
    }));

    await waitFor(() => {
      expect(services.configLibraryRepository.commit).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/已导入 1 只/u)).toBeInTheDocument();
    expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "已导入 1 只精灵",
    }));

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.click(within(attacker).getByLabelText("攻击方宠物摘要"));
    fireEvent.input(within(attacker).getByLabelText("搜索攻击方宠物"), {
      target: { value: "水灵" },
    });
    fireEvent.click(within(attacker).getByRole("button", {
      name: "选择水灵",
    }));

    expect(screen.getByLabelText("攻击方配置")).toHaveTextContent("水灵");
    expect(screen.getByLabelText("攻击方快速属性配置"))
      .toHaveTextContent("胆小");
  });

  test("cancels pending saves when the page unmounts", async () => {
    vi.useFakeTimers();
    const services = createUserSettingServices();
    const { unmount } = render(<IndexPage services={services} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "四技能模式" }),
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(services.persistence.save).not.toHaveBeenCalled();
  });

  test("does not reset the page when reset confirmation is cancelled", async () => {
    const services = createUserSettingServices({
      favoriteIds: ["spirit-a"],
    });
    vi.spyOn(Taro, "showModal").mockResolvedValue({
      cancel: true,
      confirm: false,
    });

    render(<IndexPage services={services} />);
    expect(
      await screen.findByLabelText("攻击方配置"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(
      screen.getByRole("button", { name: "重置本页" }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(Taro.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/收藏/u),
        title: "重置本页",
      }),
    );
    expect(services.persistence.clear).not.toHaveBeenCalled();
    expect(services.favoritesRepository.clear).not.toHaveBeenCalled();
    expect(services.dataService.clearCache).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "四技能模式" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("resets only the current page after confirmation and preserves favorites", async () => {
    vi.useFakeTimers();
    const snapshot = createSnapshot();
    const persistedState = createInitialState(snapshot);
    persistedState.mode = "four";
    const services = createUserSettingServices({
      favoriteIds: ["spirit-a"],
      persistedState,
    });
    vi.spyOn(Taro, "showModal").mockResolvedValue({
      cancel: false,
      confirm: true,
    });

    render(<IndexPage services={services} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "四技能模式" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(
      screen.getByRole("button", { name: "重置本页" }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(services.favoritesRepository.clear).not.toHaveBeenCalled();
    expect(services.dataService.clearCache).not.toHaveBeenCalled();
    expect(services.persistence.save).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "单技能模式" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
