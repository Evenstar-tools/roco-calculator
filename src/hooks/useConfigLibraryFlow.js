import { useState } from "react";
import packageInfo from "../../package.json";

export const POPULAR_CONFIG_COUNT = 224;

function configLibraryFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `洛克计算器-收藏配置-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

async function saveConfigLibraryFile(library) {
  const content = `${JSON.stringify(library, null, 2)}\n`;
  const filename = configLibraryFileName();
  const file = new File([content], filename, { type: "application/json" });
  if (
    globalThis.navigator?.share &&
    globalThis.navigator?.canShare?.({ files: [file] })
  ) {
    await globalThis.navigator.share({ files: [file], title: "洛克计算器配置库" });
    return;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useConfigLibraryFlow({
  initialState,
  onToast,
  snapshot,
  storedData,
}) {
  const [configLibraryError, setConfigLibraryError] = useState("");
  const [configLibraryMode, setConfigLibraryMode] = useState(null);
  const [configLibraryParsed, setConfigLibraryParsed] = useState(null);
  const [configLibrarySummary, setConfigLibrarySummary] = useState(null);

  function closeConfigLibrary() {
    setConfigLibraryError("");
    setConfigLibraryMode(null);
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(null);
  }

  function openConfigLibraryExport() {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(storedData.buildFavoriteConfigLibrary({
      appVersion: packageInfo.version,
      versions: initialState.versions,
    }));
    setConfigLibraryMode("export");
  }

  function openConfigLibraryImport() {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(null);
    setConfigLibraryMode("import");
  }

  async function loadPopularConfigLibrary() {
    const response = await fetch("/data/presets/pvp-popular-configs.json");
    if (!response.ok) {
      throw new Error(`内置配置读取失败：${response.status}`);
    }
    return storedData.previewFavoriteConfigLibrary(
      await response.text(),
      initialState.versions,
    );
  }

  async function openPopularConfigLibrary() {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(null);
    setConfigLibraryMode("popular");
    try {
      setConfigLibraryParsed(await loadPopularConfigLibrary());
    } catch (error) {
      setConfigLibraryError(
        error instanceof Error ? error.message : "内置配置无法读取",
      );
    }
  }

  async function previewConfigLibraryFile(file) {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new TypeError("配置库文件不能超过 5 MB");
      }
      const parsed = storedData.previewFavoriteConfigLibrary(
        await file.text(),
        initialState.versions,
      );
      setConfigLibraryParsed(parsed);
    } catch (error) {
      setConfigLibraryError(
        error instanceof Error ? error.message : "配置库文件无法读取",
      );
    }
  }

  const overlayProps = {
    error: configLibraryError,
    exportSummary: configLibrarySummary,
    mode: configLibraryMode,
    onClose: closeConfigLibrary,
    onConfirmImport: () => {
      try {
        const result = storedData.importFavoriteConfigLibrary(
          configLibraryParsed,
        );
        closeConfigLibrary();
        onToast(
          `已导入 ${result.preview.added + result.preview.overwritten} 只配置，新增收藏 ${result.preview.favoritesAdded} 只，覆盖 ${result.preview.overwritten} 只，跳过 ${result.preview.missingSpirits + result.preview.invalidEntries} 只。`,
        );
      } catch (error) {
        setConfigLibraryError(
          error instanceof Error ? error.message : "配置库导入失败",
        );
      }
    },
    onExport: () => {
      saveConfigLibraryFile(configLibrarySummary.library)
        .then(() => {
          closeConfigLibrary();
          onToast(`已导出 ${configLibrarySummary.exportedCount} 只精灵`);
        })
        .catch((error) => setConfigLibraryError(
          error instanceof Error ? error.message : "配置库导出失败",
        ));
    },
    onFile: previewConfigLibraryFile,
    parsed: configLibraryParsed,
    snapshot,
  };

  return {
    loadPopularConfigLibrary,
    openConfigLibraryExport,
    openConfigLibraryImport,
    openPopularConfigLibrary,
    overlayProps,
  };
}
