import { useState } from "react";
import { formatConfigLibraryImportResult } from "../state/favorite-config-library.js";
import {
  completeFirstRunGuide,
  isFirstRunGuideCompleted,
} from "../state/first-run-guide.js";

export function useFirstRunGuide({
  importFavoriteConfigLibrary,
  loadPopularConfigLibrary,
  onToast,
}) {
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(
    () => !isFirstRunGuideCompleted() && globalThis.innerWidth > 640,
  );
  const [step, setStep] = useState(0);

  function finish() {
    completeFirstRunGuide();
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
      onToast(formatConfigLibraryImportResult(result.preview));
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "常用配置导入失败",
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
