export const FORM_CONFIG_PREFERENCES_STORAGE_KEY =
  "rock-calculator.settings.form-config-preferences.v2";

const listeners = new Set();
const inMemoryPreferences = { attack: undefined, defense: undefined };
const inMemoryOnly = { attack: false, defense: false };
const FORM_STAGE_ORDER = ["一阶", "二阶", "三阶", "首领"];

export function canPreserveBattleFormConfig(source, target) {
  const sourceStage = FORM_STAGE_ORDER.indexOf(source?.stage);
  const targetStage = FORM_STAGE_ORDER.indexOf(target?.stage);
  // 升阶和同阶不同形态都有独立预设；只沿用底座本人或降阶萌化的本场配置。
  return sourceStage >= 0 && targetStage >= 0
    && (target?.id === source?.id || targetStage < sourceStage);
}

function sessionStorageOrNull() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function initializeFormConfigSession(navigationType, storage = sessionStorageOrNull()) {
  if (navigationType !== "navigate") return;
  try {
    // 新窗口可能复制 opener 的 sessionStorage；新访问重置，刷新与历史返回继续保留。
    storage?.removeItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY);
  } catch {
    // 存储受限时仍使用当前页面内状态。
  }
}

initializeFormConfigSession(globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type);

function isFormSide(side) {
  return side === "attack" || side === "defense";
}

function readStoredPreferences(storage) {
  try {
    const value = JSON.parse(storage?.getItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return null;
  }
}

export function readFormConfigPreferences(side, storage) {
  if (!isFormSide(side)) return undefined;
  const target = storage === undefined ? sessionStorageOrNull() : storage;
  const stored = readStoredPreferences(target);
  if (storage === undefined && (!target || !stored || inMemoryOnly[side])) {
    return inMemoryPreferences[side];
  }
  return typeof stored?.[side] === "boolean" ? stored[side] : undefined;
}

export function writeFormConfigPreference(side, enabled, storage) {
  const next = Boolean(enabled);
  if (!isFormSide(side)) return next;
  if (storage === undefined) inMemoryPreferences[side] = next;
  const target = storage === undefined ? sessionStorageOrNull() : storage;
  try {
    const stored = readStoredPreferences(target) ?? {};
    target?.setItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY, JSON.stringify({
      attack: typeof stored.attack === "boolean" ? stored.attack : undefined,
      defense: typeof stored.defense === "boolean" ? stored.defense : undefined,
      [side]: next,
    }));
    if (storage === undefined) inMemoryOnly[side] = !target;
  } catch {
    // 存储不可用时，当前页面内仍可切换。
    if (storage === undefined) inMemoryOnly[side] = true;
  }
  if (storage === undefined) listeners.forEach((listener) => listener());
  return next;
}

export function subscribeFormConfigPreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
