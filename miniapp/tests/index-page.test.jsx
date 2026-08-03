import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
} = {}) {
  const persistence = {
    clear: vi.fn(),
    load: vi.fn(() => persistedState),
    save: vi.fn(),
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
      screen.getByLabelText("防守方配置").querySelector("img"),
    ).toBeNull();
  });

  test("shows an explicit loading state while calculator data is pending", () => {
    render(
      <IndexPage
        services={createServices(() => new Promise(() => {}))}
      />,
    );

    expect(screen.getByText("正在加载计算数据…")).toBeInTheDocument();
    expect(document.querySelector("progress")).toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: "重置配置" }).tagName,
    ).toBe("BUTTON");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
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

  test("cancels pending saves when the store is rebuilt or the page unmounts", async () => {
    vi.useFakeTimers();
    const services = createUserSettingServices();
    const { unmount } = render(<IndexPage services={services} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "四技能模式" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(
      screen.getByRole("button", { name: "重试数据加载" }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(services.persistence.save).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "四技能模式" }),
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(services.persistence.save).not.toHaveBeenCalled();
  });

  test("leaves local data untouched when clear confirmation is cancelled", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(
      screen.getByRole("button", { name: "清除本机数据" }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(Taro.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/收藏|配置|缓存/u),
        title: "清除本机数据",
      }),
    );
    expect(services.persistence.clear).not.toHaveBeenCalled();
    expect(services.favoritesRepository.clear).not.toHaveBeenCalled();
    expect(services.dataService.clearCache).not.toHaveBeenCalled();
  });

  test("clears settings, favorites and cache after confirmation and restores defaults", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    expect(screen.queryByText(/删除账号/u)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "清除本机数据" }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(services.persistence.clear).toHaveBeenCalledTimes(1);
    expect(services.favoritesRepository.clear).toHaveBeenCalledTimes(1);
    expect(services.dataService.clearCache).toHaveBeenCalledTimes(1);
    expect(services.persistence.save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "单技能模式" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test.each([
    ["state", "persistence"],
    ["favorites", "favoritesRepository"],
  ])(
    "continues every clear step and resets the UI when %s clearing throws",
    async (_label, failingService) => {
      vi.useFakeTimers();
      const snapshot = createSnapshot();
      const persistedState = createInitialState(snapshot);
      persistedState.mode = "four";
      const services = createUserSettingServices({
        favoriteIds: ["spirit-a"],
        persistedState,
      });
      const privateError = new Error(
        "storage key and internal adapter details",
      );
      if (failingService === "persistence") {
        services.persistence.clear.mockImplementation(() => {
          throw privateError;
        });
      } else {
        services.favoritesRepository.clear.mockImplementation(() => {
          throw privateError;
        });
      }
      vi.spyOn(Taro, "showModal").mockResolvedValue({
        cancel: false,
        confirm: true,
      });
      vi.spyOn(Taro, "showToast").mockResolvedValue();

      render(<IndexPage services={services} />);
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(
        screen.getByRole("button", { name: "四技能模式" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "更多" }));
      fireEvent.click(
        screen.getByRole("button", { name: "清除本机数据" }),
      );
      await act(async () => {
        await Promise.resolve();
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(services.persistence.clear).toHaveBeenCalledTimes(1);
      expect(
        services.favoritesRepository.clear,
      ).toHaveBeenCalledTimes(1);
      expect(services.dataService.clearCache).toHaveBeenCalledTimes(1);
      expect(services.persistence.save).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "单技能模式" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(Taro.showToast).toHaveBeenCalledWith({
        duration: 3200,
        icon: "none",
        title: "部分本机数据未能清除，请重试",
      });
      expect(JSON.stringify(Taro.showToast.mock.calls)).not.toContain(
        privateError.message,
      );
    },
  );

  test("shows the BWIKI source and unofficial notice from the more menu", async () => {
    render(
      <IndexPage
        services={createUserSettingServices()}
      />,
    );
    expect(
      await screen.findByLabelText("攻击方配置"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(
      screen.getByRole("button", { name: "关于与数据来源" }),
    );

    expect(screen.getByText(/BWIKI/u)).toBeInTheDocument();
    expect(screen.getByText(/非官方/u)).toBeInTheDocument();
    expect(screen.queryByText(/删除账号/u)).not.toBeInTheDocument();
  });
});
