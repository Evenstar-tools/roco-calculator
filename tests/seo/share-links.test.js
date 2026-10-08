import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useShareFlow } from "../../src/hooks/useShareFlow.js";
import { createInitialState } from "../../src/state/defaults.js";
import { decodeShareState, encodeShareState } from "../../src/state/share.js";

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
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", { replaceState });
  vi.stubGlobal("navigator", { clipboard: { writeText } });

  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker.nature = "brave";
  state.sides.defender.nature = "calm";
  state.sides.defender.displayIvs.hp = 48;
  state.sides.defender.skills.four.reverse();
  const hash = await encodeShareState(state);
  const expectedLink = `https://rococalc.top/${hash}`;
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
  expect(hash).toMatch(/^#v1\./u);
  expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", hash);
  expect(location).toMatchObject(originalAddress);
  expect(location.hash).toBe(hash);
  expect.soft(result.current.overlayProps.shareLink).toBe(expectedLink);
  expect.soft(writeText).toHaveBeenCalledExactlyOnceWith(expectedLink);
  const decoded = await decodeShareState(new URL(result.current.overlayProps.shareLink).hash);
  expect(decoded.mode).toBe(state.mode);
  expect(decoded.sides).toEqual(state.sides);
  expect(onToast).toHaveBeenLastCalledWith("分享链接已复制");
});
