import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCalculatorSession } from "../../src/hooks/useCalculatorSession.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { serverStorageKey, storageError } from "../../src/state/server-storage.js";
import { replaceConfiguration } from "../../src/state/calculator-session.js";
import { weatherDraft } from "../fixtures/global-weather-draft.js";

const initialState = { versions: { data: "current", rules: "current" }, sides: { attacker: { spiritId: null } }, counter: 0 };
const key = serverStorageKey("cn", "calculator.session.v1");
function store() {
  return createCalculatorSessionStore({ validateState: (value) => {
    if (value.versions?.data !== "current" || value.versions?.rules !== "current") throw storageError("INCOMPATIBLE_SERVER_VERSION", "旧版本会话已保留，未载入");
  } });
}
function mount(options = {}) {
  const onToast = vi.fn();
  return { ...renderHook(() => useCalculatorSession({ initialState, onToast, onRememberSide: vi.fn(), sessionStore: store(), ...options })), onToast };
}
async function change(result, counter) {
  await act(async () => result.current.commitSession({ state: { ...result.current.state, counter }, persistence: { rememberSide: null } }));
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("CN refresh restores the actual current state and both undo/redo stacks", async () => {
  const first = mount();
  await change(first.result, 1);
  await change(first.result, 2);
  act(() => first.result.current.undoLastChange());
  expect(first.result.current.state.counter).toBe(1);
  first.unmount();

  const refreshed = mount();
  expect(refreshed.result.current.state.counter).toBe(1);
  expect(refreshed.result.current.undoCount).toBe(1);
  expect(refreshed.result.current.redoCount).toBe(1);
  act(() => refreshed.result.current.redoLastChange());
  expect(refreshed.result.current.state.counter).toBe(2);
  act(() => refreshed.result.current.undoLastChange());
  expect(refreshed.result.current.state.counter).toBe(1);
});

test("explicit incoming state can take priority over persisted state without restoring its history", async () => {
  store().saveSession({ present: { ...initialState, counter: 9 }, past: [{ state: initialState, rememberSides: [] }], future: [] });
  const h = mount({ initialState: { ...initialState, counter: 3 }, restoreSession: false });
  expect(h.result.current.state.counter).toBe(3);
  expect(h.result.current.undoCount).toBe(0);
  await change(h.result, 4);
  expect(store().loadSession().present.counter).toBe(4);
});

test.each([
  "{broken",
  JSON.stringify({ schemaVersion: 1, serverId: "cn", kind: "calculator-session", payload: { present: { ...initialState, versions: { data: "old", rules: "old" } }, past: [], future: [] } }),
])("damaged or incompatible CN sessions warn and are not overwritten by subsequent edits: %s", async (raw) => {
  localStorage.setItem(key, raw);
  const h = mount();
  expect(h.onToast).toHaveBeenCalled();
  expect(h.result.current.state.counter).toBe(0);
  await change(h.result, 1);
  expect(h.result.current.state.counter).toBe(1);
  expect(localStorage.getItem(key)).toBe(raw);
});

test("a second CN tab keeps its local edit and reports a persistence conflict", async () => {
  const firstStore = store();
  const secondStore = store();
  const first = mount({ sessionStore: firstStore });
  const second = mount({ sessionStore: secondStore });
  await change(first.result, 1);
  await change(second.result, 2);
  expect(second.result.current.state.counter).toBe(2);
  expect(second.onToast).toHaveBeenCalledWith(expect.stringContaining("另一标签页"));
  expect(store().loadSession().present.counter).toBe(1);
});

test("Global import, swap, reload, undo and redo preserve unverified weather and unknown data", async () => {
  const draft = weatherDraft();
  draft.sides.attacker.unknownSideField = { original: 71 };
  const initial = structuredClone(draft);
  initial.directions.forward.context = { beforeImport: true };
  const globalStore = () => createCalculatorSessionStore({ serverId: "global" });
  const options = { initialState: initial, serverId: "global", sessionStore: globalStore() };
  const first = mount(options);
  await act(async () => first.result.current.commitSession(replaceConfiguration(initial, draft, { remember: false, source: "share", serverId: "global" })));
  await act(async () => first.result.current.dispatch({ type: "sides/swap" }));
  const swapped = first.result.current.state;
  expect(swapped.directions).toEqual(draft.directions);
  expect(swapped.sides.defender).toEqual(draft.sides.attacker);
  expect(globalStore().loadSession().present).toEqual(swapped);
  first.unmount();

  const refreshed = mount({ ...options, sessionStore: globalStore() });
  expect(refreshed.result.current.state).toEqual(swapped);
  expect(refreshed.result.current.undoCount).toBe(2);
  act(() => refreshed.result.current.undoLastChange());
  expect(refreshed.result.current.state).toEqual(draft);
  act(() => refreshed.result.current.redoLastChange());
  expect(refreshed.result.current.state).toEqual(swapped);
  act(() => refreshed.result.current.undoLastChange());
  act(() => refreshed.result.current.undoLastChange());
  expect(refreshed.result.current.state).toEqual(initial);
  expect(localStorage.getItem(key)).toBeNull();
});
