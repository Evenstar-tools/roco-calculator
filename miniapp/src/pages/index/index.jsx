import { useCallback, useEffect, useRef, useState } from "react";
import Taro, {
  useRouter,
  useShareAppMessage,
} from "@tarojs/taro";
import { View } from "@tarojs/components";
import AppHeader from "../../components/AppHeader.jsx";
import BattleWorkspace from "../../components/BattleWorkspace.jsx";
import ErrorState from "../../components/ErrorState.jsx";
import LoadingState from "../../components/LoadingState.jsx";
import SharedResultPage from "../../components/SharedResultPage.jsx";
import SharedSessionStrip from "../../components/SharedSessionStrip.jsx";
import commonSpiritConfig from "../../data/common-spirit-config.json";
import { BUNDLED_PET_IMAGE_OVERRIDES } from "../../data/bundled-pet-image-overrides.js";
import previewSnapshot from "../../data/preview-runtime.json";
import { PREVIEW_PET_IMAGES } from "../../data/preview-pet-images.js";
import { createCloudAdapter } from "../../services/cloud-adapter.js";
import { createDataService } from "../../services/data-service.js";
import { createStorageAdapter } from "../../services/storage-adapter.js";
import {
  createShareMessage,
  decodeSharePayloadResult,
} from "../../share/payload.js";
import { createCalculatorStore } from "../../state/calculator-store.js";
import { createAutosaveController } from "../../state/autosave.js";
import { createCalculationView } from "../../view-models/calculation.js";
import {
  configPresetsBySpirit,
  createConfigLibraryRepository,
  expandBundledConfigLibrary,
} from "../../state/config-library.js";
import { createFavoritesRepository } from "../../state/favorites.js";
import { createPersistence } from "../../state/persistence.js";
import bundledRuntimePayload from "../../data/bundled-runtime.json";
import { expandBundledRuntime } from "../../data/expand-bundled-runtime.js";
import "./index.css";

const bundledRuntime = expandBundledRuntime(bundledRuntimePayload);

const COMMON_SPIRIT_CONFIG_JSON = JSON.stringify(
  expandBundledConfigLibrary(commonSpiritConfig),
);

function bundledPetImagesFor(snapshot) {
  return Object.fromEntries(
    (snapshot?.spirits ?? []).flatMap((spirit) => {
      const imageUrl = BUNDLED_PET_IMAGE_OVERRIDES[spirit.id]
        ?? PREVIEW_PET_IMAGES[spirit.id]
        ?? spirit.imageUrl;
      return typeof imageUrl === "string" && imageUrl.trim()
        ? [[spirit.id, imageUrl]]
        : [];
    }),
  );
}

function createRuntimeTaro() {
  return {
    cloud: Taro.cloud,
    getStorageSync(...args) {
      return Taro.getStorageSync(...args);
    },
    setStorageSync(...args) {
      return Taro.setStorageSync(...args);
    },
    removeStorageSync(...args) {
      return Taro.removeStorageSync(...args);
    },
    getFileSystemManager(...args) {
      return Taro.getFileSystemManager(...args);
    },
  };
}

export function createDefaultServices({
  bundledData = bundledRuntime,
  taro,
  config,
  previewData = previewSnapshot,
} = {}) {
  const platform = taro ?? createRuntimeTaro();
  const storage = createStorageAdapter(platform);
  const cloud = !config || config.preview
    ? null
    : createCloudAdapter(platform, {
        cloudEnv: config.cloudEnv,
        manifestFileId: config.manifestFileId,
      });
  const favoritesRepository = createFavoritesRepository({ storage });

  return {
    configLibraryRepository: createConfigLibraryRepository({
      favoritesRepository,
      storage,
    }),
    dataService: createDataService({
      bundledPetImages: bundledPetImagesFor(bundledData),
      bundledSnapshot: config ? null : bundledData,
      cloud,
      storage,
      previewPetImages: PREVIEW_PET_IMAGES,
      previewSnapshot: previewData,
      config,
    }),
    favoritesRepository,
    persistence: createPersistence({ storage }),
  };
}

export default function IndexPage({ services }) {
  const autosave = useRef(null);
  const loadId = useRef(0);
  const router = useRouter();
  const sharePayload = router?.params?.share;
  const shareMessage = useRef({
    title: "洛克对战计算器",
    path: "/pages/index/index",
  });
  const [pageState, setPageState] = useState({
    status: "loading",
    error: null,
    petImages: {},
    snapshot: null,
    store: null,
    favoriteIds: [],
    configLibrary: { entries: [], schemaVersion: 1 },
    memoryEnabled: true,
    services: null,
    shareSession: null,
  });

  useShareAppMessage(() => shareMessage.current);

  const load = useCallback(async () => {
    const currentLoadId = loadId.current + 1;
    loadId.current = currentLoadId;
    setPageState({
      status: "loading",
      error: null,
      petImages: {},
      snapshot: null,
      store: null,
      favoriteIds: [],
      configLibrary: { entries: [], schemaVersion: 1 },
      memoryEnabled: true,
      services: null,
      shareSession: null,
    });

    try {
      const pageServices = services ?? createDefaultServices();
      const {
        petImages = {},
        snapshot,
      } = await pageServices.dataService.load();
      if (loadId.current !== currentLoadId) {
        return;
      }
      const memoryEnabled =
        pageServices.persistence?.getMemoryEnabled?.() ?? true;
      const localState = memoryEnabled
        ? pageServices.persistence?.load(snapshot)
        : null;
      const shareResult = sharePayload
        ? decodeSharePayloadResult(sharePayload, snapshot)
        : null;
      const hasSharedState = Boolean(shareResult?.state?.sides);
      const shareSession = sharePayload
        ? hasSharedState
          ? {
              completeness: shareResult.completeness,
              decodeStatus: shareResult.status,
              direction: shareResult.direction,
              localState,
              sharedState: shareResult.state,
              status: "preview",
            }
          : {
              completeness: "minimal",
              decodeStatus: "invalid",
              localState,
              sharedState: null,
              status: "invalid",
            }
        : null;
      const favoriteIds =
        pageServices.favoritesRepository?.load(snapshot) ?? [];
      const configLibrary =
        pageServices.configLibraryRepository?.load(snapshot) ??
        { entries: [], schemaVersion: 1 };
      setPageState({
        status: "ready",
        error: null,
        petImages,
        snapshot,
        favoriteIds,
        configLibrary,
        memoryEnabled,
        services: pageServices,
        store: createCalculatorStore(
          snapshot,
          hasSharedState ? shareResult.state : localState,
        ),
        shareSession,
      });
    } catch (error) {
      if (loadId.current !== currentLoadId) {
        return;
      }
      setPageState({
        status: "error",
        error,
        petImages: {},
        snapshot: null,
        store: null,
        favoriteIds: [],
        configLibrary: { entries: [], schemaVersion: 1 },
        memoryEnabled: true,
        services: null,
        shareSession: null,
      });
    }
  }, [services, sharePayload]);

  const updateShareMessage = useCallback((view, state, direction) => {
    shareMessage.current = createShareMessage(view, state, direction);
  }, []);

  useEffect(() => {
    load();
    return () => {
      loadId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    autosave.current?.dispose();
    autosave.current = null;
    if (
      pageState.memoryEnabled &&
      pageState.store &&
      pageState.services?.persistence &&
      !["preview", "invalid"].includes(pageState.shareSession?.status)
    ) {
      autosave.current = createAutosaveController({
        persistence: pageState.services.persistence,
        store: pageState.store,
      });
    }
    return () => {
      autosave.current?.dispose();
      autosave.current = null;
    };
  }, [
    pageState.memoryEnabled,
    pageState.services,
    pageState.shareSession?.status,
    pageState.store,
  ]);

  useEffect(() => {
    if (
      pageState.status !== "ready" ||
      pageState.shareSession?.status !== "preview" ||
      !pageState.snapshot ||
      !pageState.store
    ) {
      return;
    }
    const state = pageState.store.getState();
    updateShareMessage(
      createCalculationView(
        pageState.snapshot,
        state,
        pageState.shareSession.direction,
      ),
      state,
      pageState.shareSession.direction,
    );
  }, [pageState, updateShareMessage]);

  const returnToLocalCalculation = useCallback(() => {
    autosave.current?.cancel();
    setPageState((current) => {
      if (!current.snapshot || !current.shareSession) return current;
      return {
        ...current,
        shareSession: null,
        store: createCalculatorStore(
          current.snapshot,
          current.shareSession.localState,
        ),
      };
    });
  }, []);

  const continueSharedCalculation = useCallback(() => {
    setPageState((current) => current.shareSession?.status === "preview"
      ? {
          ...current,
          shareSession: { ...current.shareSession, status: "active" },
        }
      : current);
  }, []);

  const restoreSharedSnapshot = useCallback(() => {
    setPageState((current) => {
      if (
        current.shareSession?.status !== "active" ||
        !current.store ||
        !current.shareSession.sharedState
      ) {
        return current;
      }
      current.store.dispatch({
        type: "state/replace",
        value: current.shareSession.sharedState,
      });
      return current;
    });
  }, []);

  const toggleFavorite = useCallback((spiritId) => {
    setPageState((current) => {
      const favoriteIds =
        current.services?.favoritesRepository?.toggle(spiritId) ??
        current.favoriteIds;
      return { ...current, favoriteIds };
    });
  }, []);

  const changeMemoryEnabled = useCallback((enabled) => {
    try {
      autosave.current?.cancel();
      pageState.services?.persistence?.setMemoryEnabled?.(enabled);
      if (enabled && pageState.store) {
        pageState.services?.persistence?.save(pageState.store.getState());
      }
      setPageState((current) => current.store === pageState.store
        ? { ...current, memoryEnabled: enabled }
        : current);
      return true;
    } catch {
      Promise.resolve(Taro.showToast({
        duration: 2400,
        icon: "none",
        title: "配置记忆设置失败，请重试",
      })).catch(() => {});
      return false;
    }
  }, [pageState]);

  const importCommonConfigLibrary = useCallback(() => {
    try {
      const repository = pageState.services?.configLibraryRepository;
      if (!repository) {
        throw new TypeError("常用精灵配置仓库尚未就绪");
      }
      const parsed = repository.preview(
        COMMON_SPIRIT_CONFIG_JSON,
        pageState.snapshot,
      );
      const imported = repository.commit(parsed, pageState.snapshot);
      setPageState((current) => current.store === pageState.store
        ? {
            ...current,
            configLibrary: {
              entries: imported.entries,
              schemaVersion: imported.schemaVersion,
            },
            favoriteIds: imported.favorites,
          }
        : current);
      Promise.resolve(Taro.showToast({
        duration: 2400,
        icon: "success",
        title: `已导入 ${imported.entries.length} 只精灵`,
      })).catch(() => {});
      return imported;
    } catch {
      Promise.resolve(Taro.showToast({
        duration: 2800,
        icon: "none",
        title: "常用精灵配置导入失败，请重试",
      })).catch(() => {});
      return null;
    }
  }, [pageState]);

  const resetCurrentPage = useCallback(async () => {
    const confirmation = await Taro.showModal({
      title: "重置本页",
      content: "将恢复当前页面的默认计算参数，收藏不会删除。",
      confirmText: "确认重置",
      cancelText: "取消",
    });
    if (!confirmation?.confirm) {
      return false;
    }

    autosave.current?.cancel();
    pageState.store?.reset();
    autosave.current?.cancel();
    if (pageState.memoryEnabled && pageState.store) {
      pageState.services?.persistence?.save(pageState.store.getState());
    }
    return true;
  }, [pageState]);

  if (pageState.status === "loading") {
    return <LoadingState />;
  }
  if (pageState.status === "error") {
    return <ErrorState message={pageState.error?.message} onRetry={load} />;
  }

  if (pageState.shareSession?.status === "invalid") {
    return (
      <View className="page">
        <SharedResultPage
          onOpenLocal={returnToLocalCalculation}
          status="invalid"
        />
      </View>
    );
  }

  if (pageState.shareSession?.status === "preview") {
    const sharedState = pageState.store.getState();
    return (
      <View className="page">
        <SharedResultPage
          completeness={pageState.shareSession.completeness}
          onContinue={continueSharedCalculation}
          onReturnLocal={returnToLocalCalculation}
          petImages={pageState.petImages}
          snapshot={pageState.snapshot}
          state={sharedState}
          status="preview"
          direction={pageState.shareSession.direction}
          view={createCalculationView(
            pageState.snapshot,
            sharedState,
            pageState.shareSession.direction,
          )}
        />
      </View>
    );
  }

  return (
    <View className="page">
      <AppHeader
        commonConfigCount={pageState.configLibrary.entries.length}
        dataVersion={[
          pageState.snapshot.meta?.seasonId,
          pageState.snapshot.meta?.bwikiRevision
            ?? pageState.snapshot.meta?.snapshotVersion,
        ].filter(Boolean).join(" · ") || pageState.snapshot.meta?.id}
        memoryEnabled={pageState.memoryEnabled}
        onImportCommonConfig={importCommonConfigLibrary}
        onMemoryChange={changeMemoryEnabled}
        onReset={resetCurrentPage}
      />
      {pageState.shareSession?.status === "active" ? (
        <SharedSessionStrip
          onRestore={restoreSharedSnapshot}
          onReturnLocal={returnToLocalCalculation}
        />
      ) : null}
      <BattleWorkspace
        configPresetsBySpirit={configPresetsBySpirit(
          pageState.configLibrary.entries,
        )}
        favoriteIds={pageState.favoriteIds}
        onFavoriteToggle={toggleFavorite}
        onShareChange={updateShareMessage}
        petImages={pageState.petImages}
        snapshot={pageState.snapshot}
        store={pageState.store}
      />
    </View>
  );
}
