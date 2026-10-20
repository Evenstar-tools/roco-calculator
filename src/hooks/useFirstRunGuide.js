import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { configLibraryImportMessage, storageIssueSource } from "../i18n/storage-errors.js";
import { createServerStorage } from "../state/server-storage.js";
import { useMemo, useState } from "react";
import {
  completeFirstRunGuide,
  isFirstRunGuideCompleted,
} from "../state/first-run-guide.js";

export function useFirstRunGuide({
  importFavoriteConfigLibrary,
  loadPopularConfigLibrary,
  onToast,
}) {
  const { serverId } = useRuntime();
  const { t } = useLocale();
  const storage = useMemo(() => { try { return createServerStorage(serverId); } catch { return null; } }, [serverId]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(
    () => serverId === "cn" && !isFirstRunGuideCompleted(storage) && globalThis.innerWidth > 640,
  );
  const [step, setStep] = useState(0);

  function finish() {
    completeFirstRunGuide(storage);
    setError("");
    setOpen(false);
    setStep(0);
  }

  function restart() {
    setError("");
    setStep(0);
    setOpen(true);
  }

  async function importPopularConfig() {
    setError("");
    setImporting(true);
    try {
      const parsed = await loadPopularConfigLibrary();
      const result = importFavoriteConfigLibrary(parsed);
      finish();
      onToast(configLibraryImportMessage(t, result.preview));
    } catch (importError) {
      setError(
        t(storageIssueSource(importError, "常用配置导入失败")),
      );
    } finally {
      setImporting(false);
    }
  }

  return {
    error,
    finish,
    importPopularConfig,
    importing,
    open,
    restart,
    setStep,
    step,
  };
}
