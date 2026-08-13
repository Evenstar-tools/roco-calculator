export const FIRST_RUN_GUIDE_STORAGE_KEY =
  "rock-calculator.first-run-guide.v1";

export function isFirstRunGuideCompleted(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(FIRST_RUN_GUIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function completeFirstRunGuide(storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
