import { correctS5PreviewStoredJson } from "../features/s5-preview/reference-corrections.js";

const PREFIX = "rock-calculator.preview.s5.";

// Bootstrap the whole preview before importing the app, including legacy readers.
// The game server remains CN; only browser persistence belongs to this channel.
export function createPreviewStorage(storage) {
  const keys = () => Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key) => key?.startsWith(PREFIX));
  return Object.freeze({
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(PREFIX.length) ?? null; },
    getItem(key) { return correctS5PreviewStoredJson(storage.getItem(PREFIX + String(key))); },
    setItem(key, value) { storage.setItem(PREFIX + String(key), String(value)); },
    removeItem(key) { storage.removeItem(PREFIX + String(key)); },
    clear() { keys().forEach((key) => storage.removeItem(key)); },
  });
}

export function installPreviewStorage(target = window) {
  const stores = new Map();
  const descriptors = new Map();
  const restoreProperties = () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    }
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    let native;
    try { native = target[name]; }
    catch { continue; } // Disabled storage remains unavailable to existing error handling.
    try {
      const scoped = createPreviewStorage(native);
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      Object.defineProperty(target, name, { configurable: true, get: () => scoped });
      descriptors.set(name, descriptor);
      stores.set(native, scoped);
    } catch (cause) {
      // Never start the preview against an unscoped formal storage area.
      restoreProperties();
      const error = new Error("抢先体验存储隔离失败，请返回正式版", { cause });
      error.code = "PREVIEW_STORAGE_UNAVAILABLE";
      throw error;
    }
  }
  const forwarded = new WeakSet();
  const onStorage = (event) => {
    if (forwarded.has(event) || !stores.has(event.storageArea)) return;
    event.stopImmediatePropagation();
    if (event.key !== null && !event.key.startsWith(PREFIX)) return;
    const copy = new target.Event("storage");
    Object.defineProperties(copy, Object.fromEntries(Object.entries({
      key: event.key === null ? null : event.key.slice(PREFIX.length),
      oldValue: correctS5PreviewStoredJson(event.oldValue), newValue: correctS5PreviewStoredJson(event.newValue),
      url: event.url, storageArea: stores.get(event.storageArea),
    }).map(([key, value]) => [key, { value }])));
    forwarded.add(copy);
    target.dispatchEvent(copy);
  };
  target.addEventListener("storage", onStorage, true);
  return () => {
    target.removeEventListener("storage", onStorage, true);
    restoreProperties();
  };
}
