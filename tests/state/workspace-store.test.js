// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { serverStorageKey } from "../../src/state/server-storage.js";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
const session = (name) => ({ present: { name, sides: {}, parameters: {} }, past: [], future: [] });

test("original-UI CN and Global sessions and undo/redo histories stay separate after refresh", () => {
  const cn = createCalculatorSessionStore({ serverId: "cn" });
  const global = createCalculatorSessionStore({ serverId: "global" });
  const globalSession = session("Global notes");
  globalSession.present.parameters.unknownNativeId = "raw-reference";
  globalSession.future = [{ state: session("redo state").present, rememberSides: [] }];
  cn.saveSession(session("CN state"));
  global.saveSession(globalSession);
  expect(createCalculatorSessionStore({ serverId: "cn" }).loadSession().present.name).toBe("CN state");
  expect(createCalculatorSessionStore({ serverId: "global" }).loadSession()).toEqual(globalSession);
});

test("same-server tabs retain local work on session conflict", () => {
  const first = createCalculatorSessionStore({ serverId: "global" });
  const second = createCalculatorSessionStore({ serverId: "global" });
  first.loadSession(); second.loadSession();
  first.saveSession(session("first"));
  const local = session("unsaved second");
  expect(() => second.saveSession(local)).toThrow(expect.objectContaining({ code: "STORAGE_CONFLICT" }));
  expect(local.present.name).toBe("unsaved second");
  expect(createCalculatorSessionStore({ serverId: "global" }).loadSession().present.name).toBe("first");
});

test.each(["{broken", JSON.stringify({ schemaVersion: 1, serverId: "cn", kind: "calculator-session", payload: session("foreign") })])(
  "corrupt or foreign session bytes are not overwritten by defaults: %s", (raw) => {
    const key = serverStorageKey("global", "calculator.session.v1");
    localStorage.setItem(key, raw);
    const store = createCalculatorSessionStore({ serverId: "global" });
    expect(() => store.loadSession()).toThrow();
    expect(() => store.saveSession(session("default"))).toThrow();
    expect(localStorage.getItem(key)).toBe(raw);
  },
);

test("quota failure reports unsaved work without changing the last persisted record", () => {
  const store = createCalculatorSessionStore({ serverId: "global" });
  store.saveSession(session("saved"));
  const key = serverStorageKey("global", "calculator.session.v1");
  const before = localStorage.getItem(key);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  expect(() => store.saveSession(session("unsaved"))).toThrow(expect.objectContaining({ code: "STORAGE_WRITE_FAILED" }));
  expect(localStorage.getItem(key)).toBe(before);
});
