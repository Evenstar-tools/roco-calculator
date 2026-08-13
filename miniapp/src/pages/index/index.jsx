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
import commonSpiritConfig from "../../data/common-spirit-config.json";
import previewSnapshot from "../../data/preview-runtime.json";
import { PREVIEW_PET_IMAGES } from "../../data/preview-pet-images.js";
import { createCloudAdapter } from "../../services/cloud-adapter.js";
import { createDataService } from "../../services/data-service.js";
import { createStorageAdapter } from "../../services/storage-adapter.js";
import {
  createShareMessage,
  decodeSharePayload,
} from "../../share/payload.js";
import { createCalculatorStore } from "../../state/calculator-store.js";
import { createAutosaveController } from "../../state/autosave.js";
import {
  configPresetsBySpirit,
  createConfigLibraryRepository,
  expandBundledConfigLibrary,
} from "../../state/config-library.js";
import { createFavoritesRepository } from "../../state/favorites.js";
import { createPersistence } from "../../state/persistence.js";
import bundledRuntime from "../../data/bundled-runtime.js";
import "./index.css";

const COMMON_SPIRIT_CONFIG_JSON = JSON.stringify(
  expandBundledConfigLibrary(commonSpiritConfig),
);

function bundledPetImagesFor(snapshot) {
  return Object.fromEntries(
    (snapshot?.spirits ?? []).flatMap((spirit) => {
      const imageUrl = PREVIEW_PET_IMAGES[spirit.id] ?? spirit.imageUrl;
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
    title: "洛克计算器 · S3季中",
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
    typeAnalysisEnabled: false,
    services: null,
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
      typeAnalysisEnabled: false,
      services: null,
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
      const sharedState = sharePayload
        ? decodeSharePayload(sharePayload, snapshot)
        : null;
      const memoryEnabled =
        pageServices.persistence?.getMemoryEnabled?.() ?? true;
      const typeAnalysisEnabled =
        pageServices.persistence?.getTypeAnalysisEnabled?.() ?? false;
      const persistedState = sharedState?.sides
        ? sharedState
        : memoryEnabled
          ? pageServices.persistence?.load(snapshot)
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
        typeAnalysisEnabled,
        services: pageServices,
        store: createCalculatorStore(
          snapshot,
          persistedState,
        ),
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
        typeAnalysisEnabled: false,
        services: null,
      });
    }
  }, [services, sharePayload]);

  const updateShareMessage = useCallback((view, state) => {
    shareMessage.current = createShareMessage(view, state);
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
      pageState.services?.persistence
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
  }, [pageState.memoryEnabled, pageState.services, pageState.store]);

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

  const changeTypeAnalysisEnabled = useCallback((enabled) => {
    try {
      pageState.services?.persistence?.setTypeAnalysisEnabled?.(enabled);
      setPageState((current) => current.store === pageState.store
        ? { ...current, typeAnalysisEnabled: enabled }
        : current);
      return true;
    } catch {
      Promise.resolve(Taro.showToast({
        duration: 2400,
        icon: "none",
        title: "属性分析设置失败，请重试",
      })).catch(() => {});
      return false;
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
        onTypeAnalysisChange={changeTypeAnalysisEnabled}
        typeAnalysisEnabled={pageState.typeAnalysisEnabled}
      />
      <BattleWorkspace
        configPresetsBySpirit={configPresetsBySpirit(
          pageState.configLibrary.entries,
        )}
        favoriteIds={pageState.favoriteIds}
        onFavoriteToggle={toggleFavorite}
        onShareChange={updateShareMessage}
        petImages={pageState.petImages}
        showTypeAnalysis={pageState.typeAnalysisEnabled}
        snapshot={pageState.snapshot}
        store={pageState.store}
      />
    </View>
  );
}
