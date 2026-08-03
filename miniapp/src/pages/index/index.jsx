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
import { readRuntimeConfig } from "../../config/runtime.js";
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
import { createFavoritesRepository } from "../../state/favorites.js";
import { createPersistence } from "../../state/persistence.js";
import "./index.css";

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
  taro,
  config = readRuntimeConfig(),
  previewData = previewSnapshot,
} = {}) {
  const platform = taro ?? createRuntimeTaro();
  const storage = createStorageAdapter(platform);
  const cloud = config.preview
    ? null
    : createCloudAdapter(platform, {
        cloudEnv: config.cloudEnv,
        manifestFileId: config.manifestFileId,
      });

  return {
    dataService: createDataService({
      cloud,
      storage,
      previewPetImages: PREVIEW_PET_IMAGES,
      previewSnapshot: previewData,
      config,
    }),
    favoritesRepository: createFavoritesRepository({ storage }),
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
      const persistedState = sharedState?.sides
        ? sharedState
        : pageServices.persistence?.load(snapshot);
      const favoriteIds =
        pageServices.favoritesRepository?.load(snapshot) ?? [];
      setPageState({
        status: "ready",
        error: null,
        petImages,
        snapshot,
        favoriteIds,
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
    if (pageState.store && pageState.services?.persistence) {
      autosave.current = createAutosaveController({
        persistence: pageState.services.persistence,
        store: pageState.store,
      });
    }
    return () => {
      autosave.current?.dispose();
      autosave.current = null;
    };
  }, [pageState.services, pageState.store]);

  const toggleFavorite = useCallback((spiritId) => {
    setPageState((current) => {
      const favoriteIds =
        current.services?.favoritesRepository?.toggle(spiritId) ??
        current.favoriteIds;
      return { ...current, favoriteIds };
    });
  }, []);

  const clearLocalData = useCallback(async () => {
    const confirmation = await Taro.showModal({
      title: "清除本机数据",
      content:
        "将清除本机保存的最近配置、宠物收藏和计算数据缓存，且无法撤销。",
      confirmText: "确认清除",
      cancelText: "取消",
    });
    if (!confirmation?.confirm) {
      return;
    }

    const current = pageState;
    autosave.current?.cancel();
    let clearFailed = false;
    const clearActions = [
      () => current.services?.persistence?.clear(),
      () => current.services?.favoritesRepository?.clear(),
      () => current.services?.dataService?.clearCache?.(),
    ];
    for (const clear of clearActions) {
      try {
        clear();
      } catch {
        clearFailed = true;
      }
    }

    current.store?.reset();
    autosave.current?.cancel();
    setPageState((latest) =>
      latest.store === current.store
        ? { ...latest, favoriteIds: [] }
        : latest
    );
    if (clearFailed) {
      try {
        await Taro.showToast({
          duration: 3200,
          icon: "none",
          title: "部分本机数据未能清除，请重试",
        });
      } catch {
        // 清理已进入稳定完成态，提示失败不应再次破坏页面。
      }
    }
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
        dataVersion={pageState.snapshot.meta?.id}
        onClearLocalData={clearLocalData}
        onReset={pageState.store.reset}
        onRetry={load}
      />
      <BattleWorkspace
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
