export const FORM_CONFIG_PREFERENCES_STORAGE_KEY =
  "rock-calculator.settings.form-config-preferences.v2";
export const FORM_CONFIG_MEMORY_STORAGE_KEY =
  "rock-calculator.settings.form-config-memory.v1";

const listeners = new Set();
const inMemoryPreferences = { attack: undefined, defense: undefined };
const inMemoryOnly = { attack: false, defense: false };
let persistentFallback = {};
let persistentInMemoryOnly = false;
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

function readPersistentPreferences() {
  if (persistentInMemoryOnly) return persistentFallback;
  let raw;
  try {
    raw = globalThis.localStorage?.getItem(FORM_CONFIG_MEMORY_STORAGE_KEY) ?? "{}";
  } catch {
    return persistentFallback;
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writePersistentPreferences(value) {
  persistentFallback = value;
  try {
    const storage = globalThis.localStorage;
    storage?.setItem(FORM_CONFIG_MEMORY_STORAGE_KEY, JSON.stringify(value));
    persistentInMemoryOnly = !storage;
  } catch {
    // 存储受限时仅在当前页面生效，不影响本场配置。
    persistentInMemoryOnly = true;
  }
}

export function readFormConfigMemoryEnabled() {
  return readPersistentPreferences().enabled === true;
}

export function writeFormConfigMemoryEnabled(enabled) {
  const preferences = {
    attack: readFormConfigPreferences("attack"),
    defense: readFormConfigPreferences("defense"),
  };
  // 关闭长期记忆只切换存储策略，不改变本页开关，更不改精灵预设。
  for (const side of ["attack", "defense"]) {
    if (typeof preferences[side] === "boolean") {
      writeFormConfigPreference(side, preferences[side], sessionStorageOrNull());
      inMemoryPreferences[side] = preferences[side];
    }
  }
  writePersistentPreferences(enabled ? { enabled: true, ...preferences } : { enabled: false });
  listeners.forEach((listener) => listener());
  return Boolean(enabled);
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
  if (storage === undefined) {
    const persistent = readPersistentPreferences();
    if (persistent.enabled === true) {
      return typeof persistent[side] === "boolean" ? persistent[side] : undefined;
    }
  }
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
  if (storage === undefined) {
    const persistent = readPersistentPreferences();
    if (persistent.enabled === true) {
      writePersistentPreferences({ ...persistent, [side]: next });
    }
    listeners.forEach((listener) => listener());
  }
  return next;
}

function onMemoryStorageChange(event) {
  if (event.key !== FORM_CONFIG_MEMORY_STORAGE_KEY && event.key !== null) return;
  if (event.storageArea && event.storageArea !== globalThis.localStorage) return;
  persistentInMemoryOnly = false;
  // 同浏览器的页面同步开关；关闭长期记忆后，各页继续保留最后一次状态。
  let persistent = readPersistentPreferences();
  if (persistent.enabled !== true && event.oldValue) {
    try { persistent = JSON.parse(event.oldValue) ?? {}; } catch { /* 损坏的旧值不恢复。 */ }
  }
  if (persistent.enabled === true) {
    for (const side of ["attack", "defense"]) {
      if (typeof persistent[side] === "boolean") {
        writeFormConfigPreference(side, persistent[side], sessionStorageOrNull());
        inMemoryPreferences[side] = persistent[side];
      }
    }
  }
  listeners.forEach((listener) => listener());
}

export function subscribeFormConfigPreferences(listener) {
  if (listeners.size === 0) globalThis.addEventListener?.("storage", onMemoryStorageChange);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) globalThis.removeEventListener?.("storage", onMemoryStorageChange);
  };
}
