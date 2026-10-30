import { useState } from "react";
import { publicResourceUrl } from "../runtime/public-resource-url.js";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { configLibraryImportMessage, storageIssueSource } from "../i18n/storage-errors.js";
import { version as appVersion } from "../../package.json";

export { POPULAR_CONFIG_COUNT } from "../data/preset-metadata.js";

async function loadPresetHistory({ signal } = {}) {
  const history = await fetch(publicResourceUrl("/data/presets/pvp-preset-history.json"), { signal })
    .then((result) => result.ok ? result.json() : null).catch(() => null);
  return Array.isArray(history?.entries) ? history.entries : [];
}

function configLibraryFileName(serverId, locale, date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const name = locale === "zh-CN" ? "洛克计算器-收藏配置" : locale === "ja" ? "ロコ計算機-お気に入り設定" : "roco-calculator-setups";
  return `${name}-${serverId}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

async function saveConfigLibraryFile(library, { serverId, locale, t }) {
  const content = `${JSON.stringify(library, null, 2)}\n`;
  const filename = configLibraryFileName(serverId, locale);
  const file = new File([content], filename, { type: "application/json" });
  if (
    globalThis.navigator?.share &&
    globalThis.navigator?.canShare?.({ files: [file] })
  ) {
    await globalThis.navigator.share({ files: [file], title: t("洛克计算器配置库") });
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
  const { serverId } = useRuntime();
  const { t, locale } = useLocale();
  const [configLibraryError, setConfigLibraryError] = useState("");
  const [configLibraryMode, setConfigLibraryMode] = useState(null);
  const [configLibraryParsed, setConfigLibraryParsed] = useState(null);
  const [configLibrarySummary, setConfigLibrarySummary] = useState(null);

  function describeError(error, fallback) {
    const knownSources = ["配置库文件不能超过 5 MB", "配置库 JSON 无法解析", "不是洛克计算器配置库文件", "不支持此配置库结构版本", "配置库最多包含 2000 条配置"];
    return storageIssueSource(error, knownSources.includes(error?.message) ? error.message : fallback);
  }

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
      appVersion: appVersion,
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

  async function loadPopularConfigLibrary({ signal } = {}) {
    const response = await fetch(publicResourceUrl(serverId === "global" ? "/data/global/presets/pvp-popular-configs.json" : "/data/presets/pvp-popular-configs.json"), { signal });
    if (!response.ok) {
      throw new Error(`内置配置读取失败：${response.status}`);
    }
    const history = serverId === "cn" ? await loadPresetHistory({ signal }) : [];
    return storedData.previewFavoriteConfigLibrary(
      await response.text(),
      initialState.versions,
      history,
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
        describeError(error, "内置配置无法读取"),
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
        serverId === "cn" ? await loadPresetHistory() : [],
      );
      setConfigLibraryParsed(parsed);
    } catch (error) {
      setConfigLibraryError(
        describeError(error, "配置库文件无法读取"),
      );
    }
  }

  const overlayProps = {
    error: configLibraryError ? t(configLibraryError) : "",
    exportSummary: configLibrarySummary,
    mode: configLibraryMode,
    onClose: closeConfigLibrary,
    onConfirmImport: () => {
      try {
        const result = storedData.importFavoriteConfigLibrary(
          configLibraryParsed,
        );
        closeConfigLibrary();
        onToast(configLibraryImportMessage(t, result.preview));
      } catch (error) {
        setConfigLibraryError(
          describeError(error, "配置库导入失败"),
        );
      }
    },
    onExport: () => {
      saveConfigLibraryFile(configLibrarySummary.library, { serverId, locale, t })
        .then(() => {
          closeConfigLibrary();
          onToast(t(serverId === "global" ? "已导出 {count} 份配置和 {favorites} 项收藏" : "已导出 {count} 只精灵", { count: configLibrarySummary.exportedCount, favorites: configLibrarySummary.library.favorites?.length ?? 0 }));
        })
        .catch((error) => setConfigLibraryError(
          describeError(error, "配置库导出失败"),
        ));
    },
    onFile: previewConfigLibraryFile,
    onStartImport: openConfigLibraryImport,
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
