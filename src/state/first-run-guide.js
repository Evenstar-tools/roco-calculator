import { createServerStorage, serverStorageKey } from "./server-storage.js";

export const FIRST_RUN_GUIDE_STORAGE_KEY =
  serverStorageKey("cn", "rock-calculator.first-run-guide.v1");

export function isFirstRunGuideCompleted(storage = globalThis.localStorage) {
  try {
    return createServerStorage(storage?.serverId ?? "cn", storage).getItem("rock-calculator.first-run-guide.v1") === "1";
  } catch {
    return false;
  }
}

export function completeFirstRunGuide(storage = globalThis.localStorage) {
  try {
    createServerStorage(storage?.serverId ?? "cn", storage).setItem("rock-calculator.first-run-guide.v1", "1");
    return true;
  } catch {
    return false;
  }
}
