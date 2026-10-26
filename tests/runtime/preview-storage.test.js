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
