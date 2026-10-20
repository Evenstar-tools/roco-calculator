import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useShareFlow } from "../../src/hooks/useShareFlow.js";
import { createInitialState } from "../../src/state/defaults.js";
import { decodeShareEnvelope, encodeShareEnvelope, selectShareableInputs } from "../../src/state/share.js";

const raceStats = {
  hp: 100, speed: 100, physicalAttack: 100, magicalAttack: 100,
  physicalDefense: 100, magicalDefense: 100,
};
const snapshot = {
  meta: { id: "s4-test", rulesVersion: "rules-test" },
  spirits: [
    { id: "attacker", raceStats },
    { id: "defender", raceStats },
  ],
  skills: ["skill_a", "skill_b", "skill_c", "skill_d"].map((id) => ({ id })),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([
  "https://rococalc.top/",
  "http://localhost:5173/?source=preview",
  "http://127.0.0.1:4174/preview/?mode=four",
  "app://calculator/",
  "file:///C:/RocoCalc/index.html",
])("从 %s 分享弹窗和复制均输出官网链接，当前页面只更新hash", async (source) => {
  const location = new URL(source);
  const originalAddress = {
    origin: location.origin, pathname: location.pathname, search: location.search,
  };
  const replaceState = vi.fn((_state, _title, hash) => { location.hash = hash; });
  const navigationState = { rocoEntry: { serverId: "cn", locale: "zh-CN" }, deerInput: { stacks: 3 } };
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", { replaceState, state: navigationState });
  vi.stubGlobal("navigator", { clipboard: { writeText } });

  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker.nature = "brave";
  state.sides.defender.nature = "calm";
  state.sides.defender.displayIvs.hp = 48;
  state.sides.defender.skills.four.reverse();
  const hash = await encodeShareEnvelope({ serverId: "cn", gameVersion: null,
    dataVersion: state.versions.data, rulesVersion: state.versions.rules,
    locale: "zh-CN", kind: "configuration", payload: selectShareableInputs(state) });
  const expectedLink = `https://rococalc.top/cn/${hash}`;
  const onToast = vi.fn();
  const { result } = renderHook(() => useShareFlow({
    commitSession: vi.fn(),
    configurationReady: true,
    initialState: state,
    onToast,
    snapshot,
    state,
    stateRef: { current: state },
  }));

  await act(() => result.current.openShareConfiguration());
  await act(() => result.current.overlayProps.actions.onCopy());

  expect(result.current.overlayProps.open).toBe(true);
  expect(hash).toMatch(/^#v2\.cn\.zh-CN\./u);
  expect(replaceState).toHaveBeenCalledExactlyOnceWith(navigationState, "", hash);
  expect(location).toMatchObject(originalAddress);
  expect(location.hash).toBe(hash);
  expect.soft(result.current.overlayProps.shareLink).toBe(expectedLink);
  expect.soft(writeText).toHaveBeenCalledExactlyOnceWith(expectedLink);
  const { payload: decoded } = await decodeShareEnvelope(new URL(result.current.overlayProps.shareLink).hash);
  expect(decoded.mode).toBe(state.mode);
  expect(decoded.sides).toEqual(state.sides);
  expect(onToast).toHaveBeenLastCalledWith("分享链接已复制");
});
