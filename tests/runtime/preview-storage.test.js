import { afterEach, expect, test } from "vitest";
import { createPreviewStorage, installPreviewStorage } from "../../src/runtime/preview-storage.js";

let restore;
afterEach(() => { restore?.(); restore = null; localStorage.clear(); sessionStorage.clear(); });

test("preview cannot read, migrate, overwrite or clear formal and legacy saves", () => {
  localStorage.setItem("rock-calculator.servers.cn.teams.v1", "formal-team");
  localStorage.setItem("rock-calculator.teams.v1", "legacy-team");
  const preview = createPreviewStorage(localStorage);
  expect(preview.getItem("rock-calculator.servers.cn.teams.v1")).toBeNull();
  expect(preview.getItem("rock-calculator.teams.v1")).toBeNull();
  preview.setItem("rock-calculator.servers.cn.teams.v1", "preview-team");
  expect(createPreviewStorage(localStorage).getItem("rock-calculator.servers.cn.teams.v1")).toBe("preview-team");
  expect(preview.key(0)).toBe("rock-calculator.servers.cn.teams.v1");
  expect(preview.length).toBe(1);
  preview.clear();
  expect(preview.length).toBe(0);
  expect(localStorage.getItem("rock-calculator.servers.cn.teams.v1")).toBe("formal-team");
  expect(localStorage.getItem("rock-calculator.teams.v1")).toBe("legacy-team");
});

test("bootstrap scopes raw appearance and session readers before the app loads", () => {
  const nativeLocal = localStorage;
  const nativeSession = sessionStorage;
  nativeLocal.setItem("rock-calculator.theme", "light");
  nativeSession.setItem("form-memory", "formal");
  restore = installPreviewStorage(window);
  expect(localStorage.getItem("rock-calculator.theme")).toBeNull();
  expect(sessionStorage.getItem("form-memory")).toBeNull();
  localStorage.setItem("rock-calculator.theme", "dark");
  sessionStorage.setItem("form-memory", "preview");
  expect(nativeLocal.getItem("rock-calculator.theme")).toBe("light");
  expect(nativeSession.getItem("form-memory")).toBe("formal");
  expect(localStorage.getItem("rock-calculator.theme")).toBe("dark");
});

test("storage events from formal tabs are ignored; preview tabs receive scoped keys", () => {
  const native = localStorage;
  restore = installPreviewStorage(window);
  const events = [];
  const listener = (event) => events.push([event.key, event.newValue, event.storageArea]);
  window.addEventListener("storage", listener);
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: "rock-calculator.teams.v1", newValue: "formal", storageArea: native }));
    expect(events).toEqual([]);
    window.dispatchEvent(new StorageEvent("storage", { key: "rock-calculator.preview.s5.rock-calculator.teams.v1", newValue: "preview", storageArea: native }));
    expect(events).toEqual([["rock-calculator.teams.v1", "preview", localStorage]]);
  } finally { window.removeEventListener("storage", listener); }
});


test("storage isolation failure stops startup and restores an already scoped area", () => {
  const target = new EventTarget();
  const nativeLocal = localStorage;
  const nativeSession = sessionStorage;
  Object.defineProperties(target, {
    localStorage: { configurable: true, get: () => nativeLocal },
    sessionStorage: { configurable: false, get: () => nativeSession },
  });
  expect(() => installPreviewStorage(target)).toThrow("抢先体验存储隔离失败");
  expect(target.localStorage).toBe(nativeLocal);
  expect(target.sessionStorage).toBe(nativeSession);
});

test("restoring inherited storage properties removes only the bootstrap overrides", () => {
  const nativeLocal = localStorage;
  const nativeSession = sessionStorage;
  const target = Object.assign(Object.create({ localStorage: nativeLocal, sessionStorage: nativeSession }), {
    addEventListener() {}, removeEventListener() {},
  });
  const undo = installPreviewStorage(target);
  expect(target.localStorage).not.toBe(nativeLocal);
  undo();
  expect(Object.hasOwn(target, "localStorage")).toBe(false);
  expect(Object.hasOwn(target, "sessionStorage")).toBe(false);
  expect(target.localStorage).toBe(nativeLocal);
});

test("preview reads correct old duplicate references without rewriting raw or formal storage", () => {
  const native = localStorage;
  const oldId = "spirit_preview_s5_boss-thousand-spikes";
  const actualId = "spirit_786924cd03526ca4";
  const key = "rock-calculator.servers.cn.calculator.session.v1";
  const prefix = "rock-calculator.preview.s5.";
  const raw = JSON.stringify({ present: { spiritId: oldId }, past: [{ state: { spiritId: oldId } }], future: [] });
  native.setItem(prefix + key, raw);
  native.setItem(key, raw);
  const preview = createPreviewStorage(native);
  expect(JSON.parse(preview.getItem(key))).toEqual({
    present: { spiritId: actualId }, past: [{ state: { spiritId: actualId } }], future: [],
  });
  expect(native.getItem(prefix + key)).toBe(raw);
  expect(native.getItem(key)).toBe(raw);
});

test("forwarded preview storage events correct both values with the same read-only policy", () => {
  const native = localStorage;
  const raw = JSON.stringify({ spiritId: "spirit_preview_s5_boss-thousand-spikes" });
  const corrected = JSON.stringify({ spiritId: "spirit_786924cd03526ca4" });
  restore = installPreviewStorage(window);
  const received = [];
  const listener = (event) => received.push([event.oldValue, event.newValue]);
  window.addEventListener("storage", listener);
  try {
    window.dispatchEvent(new StorageEvent("storage", {
      key: "rock-calculator.preview.s5.rock-calculator.teams.v1",
      oldValue: raw, newValue: raw, storageArea: native,
    }));
    expect(received).toEqual([[corrected, corrected]]);
    expect(native.length).toBe(0);
  } finally { window.removeEventListener("storage", listener); }
});
