import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useShareFlow } from "../../src/hooks/useShareFlow.js";
import { decodeShareEnvelope, encodeShareEnvelope, selectShareableInputs } from "../../src/state/share.js";
import { assertSnapshotReferences, migrateSharedConfiguration, replaceConfiguration } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { translateUi } from "../../src/i18n/messages.js";
import globalSnapshot from "../../data/snapshots/global/s3-midseason.json";

vi.mock("../../src/state/share.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, decodeShareEnvelope: vi.fn(original.decodeShareEnvelope) };
});
vi.mock("../../src/state/calculator-session.js", () => ({
  assertSnapshotReferences: vi.fn(),
  migrateSharedConfiguration: vi.fn((state) => state),
  replaceConfiguration: vi.fn((_current, state) => ({ state })),
  sameConfigurationVersions: (left, right) => left.data === right.data && left.rules === right.rules,
  shareHashFromInput: (value) => value,
}));

const versions = { data: "cn-current", rules: "cn-current" };
const envelope = (payload) => ({ protocolVersion: 1, serverId: "cn", gameVersion: null,
  dataVersion: payload.versions.data, rulesVersion: payload.versions.rules, kind: "configuration", payload });

function setup(overrides = {}) {
  const initialState = { versions, sides: {} };
  const options = {
    commitSession: vi.fn(),
    configurationReady: true,
    initialState,
    onToast: vi.fn(),
    snapshot: { meta: { id: versions.data, rulesVersion: versions.rules } },
    state: initialState,
    stateRef: { current: initialState },
    ...overrides,
  };
  return {
    ...renderHook(({ active, shareRequestId }) => useShareFlow({ ...options, active, shareRequestId }), {
      initialProps: { active: true, shareRequestId: 0 },
      wrapper: ({ children }) => <LocaleProvider locale={options.locale ?? "zh-CN"}>{children}</LocaleProvider>,
    }),
    options,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  history.replaceState(null, "", "/cn/");
});

function setupGlobal(overrides = {}) {
  const state = createInitialState();
  const options = { serverId: "global", locale: "en", configurationReady: false,
    initialState: state, state, stateRef: { current: state }, snapshot: { meta: { serverId: "global", id: null, rulesVersion: null } }, ...overrides };
  return setup(options);
}

test("Global can share the original empty App configuration without declaring verified rules", async () => {
  history.replaceState({ rocoEntry: { serverId: "global" } }, "", "/en/");
  const { result } = setupGlobal();
  await act(async () => result.current.openShareConfiguration());
  const url = new URL(result.current.overlayProps.shareLink);
  expect(url.pathname).toBe("/en/");
  expect(await decodeShareEnvelope(url.hash)).toMatchObject({ serverId: "global", kind: "configuration-draft",
    gameVersion: null, dataVersion: null, rulesVersion: null, payload: { versions: { data: null, rules: null } } });
  expect(history.state).toEqual({ rocoEntry: { serverId: "global" } });
});

test("Global export does not normalize unknown draft parameters through CN rules", async () => {
  history.replaceState(null, "", "/en/");
  const state = createInitialState();
  state.sides.attacker.spiritId = "unknown-spirit";
  state.sides.attacker.nature = "unknown-nature";
  state.sides.attacker.traitValues = { "unknown-trait": { value: 105 } };
  state.marks.attacker.positive = { id: "unknown-mark", stacks: 102 };
  state.negativeStatuses.defender = { "unknown-status": 103, electrified: 5 };
  const { result } = setupGlobal({ initialState: state, state, stateRef: { current: state } });
  await act(async () => result.current.openShareConfiguration());
  const decoded = await decodeShareEnvelope(new URL(result.current.overlayProps.shareLink).hash);
  expect(decoded.payload).toEqual(state);
});

test("Global imports original App drafts without CN migration and consumes the URL while preserving history", async () => {
  const shared = selectShareableInputs(createInitialState());
  shared.sides.attacker.spiritId = "unknown-global-id";
  shared.sides.attacker.nature = "unknown-global-nature";
  const hash = await encodeShareEnvelope({ serverId: "global", locale: "en", kind: "configuration-draft",
    gameVersion: null, dataVersion: null, rulesVersion: null, payload: shared });
  history.replaceState({ rocoEntry: { serverId: "global" }, marker: "keep" }, "", `/en/${hash}`);
  const { options } = setupGlobal();
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledExactlyOnceWith({ state: shared }, { recordHistory: false }));
  expect(migrateSharedConfiguration).not.toHaveBeenCalled();
  expect(location.hash).toBe("");
  expect(history.state).toEqual({ rocoEntry: { serverId: "global" }, marker: "keep" });
});

test.each(["cn", "global"])("a valid %s URL share records the restored previous session for undo", async (serverId) => {
  const shared = serverId === "global" ? createInitialState() : { versions, sides: {} };
  decodeShareEnvelope.mockResolvedValueOnce(serverId === "global"
    ? { protocolVersion: 2, serverId, gameVersion: null, dataVersion: null, rulesVersion: null,
        kind: "configuration-draft", payload: shared }
    : envelope(shared));
  history.replaceState(null, "", serverId === "global" ? "/en/#v2.global.en.payload.signature" : "/cn/#v1.payload.signature");
  const { options } = serverId === "global"
    ? setupGlobal({ initialImportHasPreviousSession: true }) : setup({ initialImportHasPreviousSession: true });
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledExactlyOnceWith({ state: shared }, { recordHistory: true }));
});

test("Global share import preserves unknown weather values through the real session replacement", async () => {
  const realSession = await vi.importActual("../../src/state/calculator-session.js");
  replaceConfiguration.mockImplementationOnce(realSession.replaceConfiguration);
  const shared = createInitialState();
  shared.directions.forward.context = { weatherRainTurns: 42, weatherThunder: true };
  shared.directions.reverse.context = { weatherRainTurns: 21, weatherThunder: true };
  const hash = await encodeShareEnvelope({ serverId: "global", locale: "en", kind: "configuration-draft",
    gameVersion: null, dataVersion: null, rulesVersion: null, payload: shared });
  history.replaceState(null, "", "/en/");
  const { result, options } = setupGlobal();
  submit(result, hash);
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(1));
  expect(options.commitSession.mock.calls[0][0].state).toEqual(shared);
  expect(replaceConfiguration).toHaveBeenCalledWith(options.stateRef.current, shared, { remember: false, source: "share", serverId: "global" });
});

test("a validated pasted cross-server share offers a server switch without overwriting the current state", async () => {
  const hash = await encodeShareEnvelope({ serverId: "global", locale: "ja", gameVersion: null,
    dataVersion: null, rulesVersion: null, kind: "configuration-draft", payload: selectShareableInputs(createInitialState()) });
  const onCrossServerShare = vi.fn();
  const { result, options } = setup({ onCrossServerShare });
  submit(result, `https://other.test/${hash}`);
  await waitFor(() => expect(onCrossServerShare).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ serverId: "global", locale: "ja" }), hash));
  expect(options.commitSession).not.toHaveBeenCalled();
  expect(migrateSharedConfiguration).not.toHaveBeenCalled();
});

test("a malformed same-server Global URL reports an error without importing", async () => {
  history.replaceState(null, "", "/en/#v2.global.en.payload.signature");
  const { options } = setupGlobal();
  await waitFor(() => expect(options.onToast).toHaveBeenCalledTimes(1));
  expect(options.onToast.mock.calls[0][0]).not.toMatch(/[\u3400-\u9fff]/u);
  expect(options.commitSession).not.toHaveBeenCalled();
});

test.each(["en", "ja", "zh-CN"])("%s explains invalid Global entity references and retains the pasted setup", async (locale) => {
  const errors = [
    "分享配置包含当前数据中不存在的精灵",
    "分享配置包含无效的本场形态或分支",
    "分享配置包含当前数据中不存在的技能",
    "分享配置包含当前数据中不存在的特性",
    "分享配置中的精灵不具备吞噬特性能力",
    "分享配置包含未选中的吞噬特性参数",
  ];
  for (const error of errors) {
    const message = translateUi(locale, error);
    expect(message).not.toMatch(/Translation unavailable|翻訳未対応/);
    if (locale !== "zh-CN") expect(message).not.toBe(error);
  }
  const state = createInitialState(globalSnapshot);
  const shared = structuredClone(state);
  shared.sides.attacker.spiritId = "missing-global-spirit";
  const hash = await encodeShareEnvelope({ serverId: "global", locale, kind: "configuration",
    gameVersion: globalSnapshot.meta.gameVersion ?? null, dataVersion: state.versions.data, rulesVersion: state.versions.rules,
    payload: selectShareableInputs(shared) });
  const realSession = await vi.importActual("../../src/state/calculator-session.js");
  const realShare = await vi.importActual("../../src/state/share.js");
  assertSnapshotReferences.mockImplementationOnce(realSession.assertSnapshotReferences);
  decodeShareEnvelope.mockImplementationOnce(realShare.decodeShareEnvelope);
  history.replaceState(null, "", locale === "ja" ? "/jp/" : locale === "en" ? "/en/" : "/global/zh-CN/");
  const { result, options } = setupGlobal({ locale, initialState: state, state, stateRef: { current: state }, snapshot: globalSnapshot });
  submit(result, hash);
  await waitFor(() => expect(options.onToast).toHaveBeenCalledWith(translateUi(locale, errors[0])));
  expect(result.current.overlayProps.importDraft).toBe(hash);
  expect(options.commitSession).not.toHaveBeenCalled();
  expect(options.stateRef.current).toEqual(state);
});

test("an unknown protocol on a Global URL reports an error instead of being ignored", async () => {
  history.replaceState(null, "", "/en/#v3.global.en.payload.signature");
  const { options } = setupGlobal();
  await waitFor(() => expect(options.onToast).toHaveBeenCalledWith("This share format is not supported by this version of the calculator."));
  expect(options.commitSession).not.toHaveBeenCalled();
});

test("returning to a session does not replay its previously consumed URL and overwrite later edits", async () => {
  history.replaceState(null, "", "/cn/#v1.original.signature");
  decodeShareEnvelope.mockResolvedValueOnce(envelope({ versions, sides: {} }));
  const { rerender, options } = setup();
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(1));
  rerender({ active: false });
  rerender({ active: true });
  await act(async () => {});
  expect(decodeShareEnvelope).toHaveBeenCalledTimes(1);
  expect(options.commitSession).toHaveBeenCalledTimes(1);
});

test("explicitly opening the same URL share again still imports it", async () => {
  history.replaceState(null, "", "/cn/#v1.original.signature");
  decodeShareEnvelope.mockResolvedValue(envelope({ versions, sides: {} }));
  const { options } = setup();
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(1));
  act(() => {
    history.replaceState(null, "", "/cn/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    history.replaceState(null, "", "/cn/#v1.original.signature");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(2));
  decodeShareEnvelope.mockImplementation(async (...args) => (await vi.importActual("../../src/state/share.js")).decodeShareEnvelope(...args));
});

test("an explicit cross-server share request imports an already-consumed hash after same-page navigation", async () => {
  history.replaceState(null, "", "/cn/#v1.original.signature");
  const shared = envelope({ versions, sides: {} });
  decodeShareEnvelope.mockResolvedValueOnce(shared).mockResolvedValueOnce(shared);
  const { rerender, options } = setup();
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(1));
  history.replaceState(null, "", "/en/");
  rerender({ active: false, shareRequestId: 0 });
  history.replaceState(null, "", "/cn/#v1.original.signature");
  rerender({ active: true, shareRequestId: 1 });
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(2));
  expect(options.commitSession).toHaveBeenLastCalledWith({ state: shared.payload }, { recordHistory: true });
});

test("a newer import invalidates an older pending version confirmation", async () => {
  const older = { versions: { data: "cn-old", rules: "cn-old" }, sides: {} };
  const latest = { versions, sides: { attacker: { spiritId: "latest" } } };
  decodeShareEnvelope.mockResolvedValueOnce(envelope(older)).mockResolvedValueOnce(envelope(latest));
  const { result, options } = setup();
  submit(result, "#v1.old.signature");
  await waitFor(() => expect(result.current.overlayProps.pendingState).toBe(older));
  const staleConfirm = result.current.overlayProps.actions.onPendingConfirm;
  submit(result, "#v1.next.signature");
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(1));
  act(() => staleConfirm());
  expect(result.current.overlayProps.pendingState).toBeNull();
  expect(options.commitSession).toHaveBeenCalledExactlyOnceWith({ state: latest }, { recordHistory: true });
});
afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

test.each([versions, { data: "cn-old", rules: "cn-old" }])(
  "switching to Global ignores unfinished CN share decoding, including version conflicts: %j",
  async (sharedVersions) => {
    history.replaceState(null, "", "/cn/#v1.pending.signature");
    let finishDecode;
    const decoding = new Promise((resolve) => { finishDecode = resolve; });
    decodeShareEnvelope.mockReturnValueOnce(decoding);
    const { result, rerender, options } = setup();
    expect(decodeShareEnvelope).toHaveBeenCalledWith("#v1.pending.signature");

    history.replaceState(null, "", "/en/#v1.pending.signature");
    rerender({ active: false });
    await act(async () => {
      finishDecode(envelope({ versions: sharedVersions, sides: { attacker: { spiritId: "shared-cn" } } }));
      await decoding;
    });

    expect(options.commitSession).not.toHaveBeenCalled();
    expect(migrateSharedConfiguration).not.toHaveBeenCalled();
    expect(result.current.overlayProps.pendingState).toBeNull();
    expect(result.current.overlayProps.open).toBe(false);
    expect(options.onToast).not.toHaveBeenCalled();
  },
);

test("a new CN hash after mounting applies the share and records its history", async () => {
  const shared = { versions, sides: { attacker: { spiritId: "shared-cn" } } };
  decodeShareEnvelope.mockResolvedValueOnce(envelope(shared));
  const { result, options } = setup();
  expect(decodeShareEnvelope).not.toHaveBeenCalled();

  act(() => {
    history.replaceState(null, "", "/cn/#v1.next.signature");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  await waitFor(() => expect(options.commitSession).toHaveBeenCalledWith({ state: shared }, { recordHistory: true }));
  expect(decodeShareEnvelope).toHaveBeenCalledWith("#v1.next.signature");
  expect(migrateSharedConfiguration).toHaveBeenCalledWith(shared, versions, options.snapshot);
  expect(replaceConfiguration).toHaveBeenCalledWith(options.stateRef.current, shared, { remember: false, source: "share", serverId: "cn" });
  expect(result.current.overlayProps.pendingState).toBeNull();
});

test.each(["/en/", "/global/zh-CN/", "/global/ja/"])(
  "an active hook on %s cannot decode a CN share, on mount or hashchange",
  (path) => {
    history.replaceState(null, "", `${path}#v1.original.signature`);
    const { result, options } = setup();
    act(() => {
      history.replaceState(null, "", `${path}#v1.next.signature`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(decodeShareEnvelope).not.toHaveBeenCalled();
    expect(options.commitSession).not.toHaveBeenCalled();
    expect(result.current.overlayProps.pendingState).toBeNull();
  },
);

function submit(result, value) {
  act(() => result.current.overlayProps.actions.onImportDraftChange(value));
  act(() => result.current.overlayProps.actions.onImportSubmit({ preventDefault() {} }));
}

test.each([versions, { data: "cn-old", rules: "cn-old" }])("a manual asynchronous import cannot commit after a server switch: %j", async (sharedVersions) => {
  let finish;
  const decoding = new Promise((resolve) => { finish = resolve; });
  decodeShareEnvelope.mockReturnValueOnce(decoding);
  const { result, rerender, options } = setup();
  submit(result, "#v1.pending.signature");
  history.replaceState(null, "", "/en/");
  rerender({ active: false });
  // 即使用户先切回国服，前一个服会话发起的异步结果也已失效。
  history.replaceState(null, "", "/cn/");
  rerender({ active: true });
  await act(async () => { finish(envelope({ versions: sharedVersions, sides: {} })); await decoding; });
  expect(options.commitSession).not.toHaveBeenCalled();
  expect(options.onToast).not.toHaveBeenCalled();
  expect(result.current.overlayProps.pendingState).toBeNull();
});

test("closing a manual import while decoding cancels its result", async () => {
  let finish;
  const decoding = new Promise((resolve) => { finish = resolve; });
  decodeShareEnvelope.mockReturnValueOnce(decoding);
  const { result, options } = setup();
  submit(result, "#v1.pending.signature");
  act(() => result.current.overlayProps.actions.onClose());
  await act(async () => { finish(envelope({ versions, sides: {} })); await decoding; });
  expect(options.commitSession).not.toHaveBeenCalled();
  expect(options.onToast).not.toHaveBeenCalled();
});

test("the latest import wins when asynchronous decoding finishes out of order", async () => {
  let finishFirst;
  const first = new Promise((resolve) => { finishFirst = resolve; });
  const latest = { versions, sides: { attacker: { spiritId: "latest" } } };
  decodeShareEnvelope.mockReturnValueOnce(first).mockResolvedValueOnce(envelope(latest));
  const { result, options } = setup();
  submit(result, "#v1.first.signature");
  submit(result, "#v1.last.signature");
  await waitFor(() => expect(options.commitSession).toHaveBeenCalledTimes(1));
  await act(async () => { finishFirst(envelope({ versions, sides: {} })); await first; });
  expect(options.commitSession).toHaveBeenCalledExactlyOnceWith({ state: latest }, { recordHistory: true });
});

test("a Global v2 pasted into CN is rejected without replacing or migrating the session", async () => {
  const hash = await encodeShareEnvelope({ serverId: "global", locale: "ja", gameVersion: null,
    dataVersion: null, rulesVersion: null, kind: "configuration-draft", payload: selectShareableInputs(createInitialState()) });
  const { result, options } = setup();
  submit(result, `https://rococalc.top/global/ja/${hash}`);
  await waitFor(() => expect(options.onToast).toHaveBeenCalledWith("分享服务器与当前工作区不匹配"));
  expect(options.commitSession).not.toHaveBeenCalled();
  expect(migrateSharedConfiguration).not.toHaveBeenCalled();
});

test("a CN share declaring a different game version is not applied", async () => {
  decodeShareEnvelope.mockResolvedValueOnce({ ...envelope({ versions, sides: {} }), protocolVersion: 2, gameVersion: "other-build" });
  const { result, options } = setup();
  submit(result, "#v2.cn.zh-CN.payload.signature");
  await waitFor(() => expect(options.onToast).toHaveBeenCalledWith("分享游戏版本与当前工作区不匹配"));
  expect(options.commitSession).not.toHaveBeenCalled();
});

test("switching servers clears an already-decoded version conflict before returning to CN", async () => {
  const shared = { versions: { data: "cn-old", rules: "cn-old" }, sides: {} };
  decodeShareEnvelope.mockResolvedValueOnce(envelope(shared));
  const { result, rerender, options } = setup();
  submit(result, "#v1.old.signature");
  await waitFor(() => expect(result.current.overlayProps.pendingState).toBe(shared));
  history.replaceState(null, "", "/en/");
  rerender({ active: false });
  history.replaceState(null, "", "/cn/");
  rerender({ active: true });
  expect(result.current.overlayProps.pendingState).toBeNull();
  act(() => result.current.overlayProps.actions.onPendingConfirm());
  expect(options.commitSession).not.toHaveBeenCalled();
});
