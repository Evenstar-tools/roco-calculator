import { afterEach, expect, test, vi } from "vitest";
import { readViewModeSetting, writeViewModeSetting, VIEW_MODE_STORAGE_KEY } from "../../src/state/display-settings.js";

afterEach(() => vi.unstubAllGlobals());

test("无记录或非法记录默认精简，合法模式读写", () => {
  const values = new Map();
  vi.stubGlobal("localStorage", { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  expect(readViewModeSetting()).toBe("compact");
  values.set(VIEW_MODE_STORAGE_KEY, "invalid");
  expect(readViewModeSetting()).toBe("compact");
  writeViewModeSetting("detailed");
  expect(readViewModeSetting()).toBe("detailed");
  writeViewModeSetting("compact");
  expect(readViewModeSetting()).toBe("compact");
});

test("存储异常不会阻断界面切换", () => {
  vi.stubGlobal("localStorage", { getItem() { throw Error("blocked"); }, setItem() { throw Error("quota"); } });
  expect(readViewModeSetting()).toBe("compact");
  expect(() => writeViewModeSetting("detailed")).not.toThrow();
});
