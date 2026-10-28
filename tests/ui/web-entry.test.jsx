import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WebEntry, browserEntry } from "../../src/runtime/WebEntry.jsx";
import { MANUAL_PREFERENCE_KEY } from "../../src/runtime/routes.js";
import { encodeShareState, encodeShareEnvelope } from "../../src/state/share.js";
import { createInitialState } from "../../src/state/defaults.js";
import { useRuntime } from "../../src/runtime/RuntimeContext.jsx";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";

vi.mock("../../src/CalculatorRouter.jsx", () => ({
  CalculatorRouter: function CnWorkspace({ active, onOpenGlobal }) {
    const [draft, setDraft] = useState("");
    const runtime = useRuntime();
    return active && <><input aria-label="CN draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <select aria-label="CN theme" value={runtime.seasonThemePreference} onChange={(event) => runtime.onSeasonThemeChange(event.target.value)}>
        {["default", "random", "s1", "s2", "s3", "s4"].map((id) => <option key={id}>{id}</option>)}
      </select>
      <button onClick={() => runtime.onSeasonThemeChange("random")}>Random CN theme</button>
      <button onClick={onOpenGlobal}>Global</button></>;
  },
}));
vi.mock("../../src/App.jsx", () => ({
  App: function OriginalApp({ active }) {
    const runtime = useRuntime();
    return active && <>
      <h1>Global calculator {runtime.locale}</h1>
      <select aria-label="Language" value={runtime.locale} onChange={(event) => runtime.onLocaleChange(event.target.value)}>
        {["en", "zh-CN", "ja"].map((locale) => <option key={locale}>{locale}</option>)}
      </select>
      <select aria-label="Global theme" value={runtime.seasonThemePreference} onChange={(event) => runtime.onSeasonThemeChange(event.target.value)}>
        {["default", "random", "s1", "s2", "s3", "s4"].map((id) => <option key={id}>{id}</option>)}
      </select>
      <button onClick={() => runtime.onSeasonThemeChange("random")}>Random Global theme</button>
      <button onClick={runtime.onServerChange}>Switch to the CN server</button>
      <span data-testid="server-snapshot">{runtime.serverId}</span>
    </>;
  },
}));
vi.mock("../../src/analytics/metrics.js", () => ({ metrics: { setServer: vi.fn(), start: vi.fn() } }));

let hardNavigation;
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/en/");
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
  hardNavigation = { assign: vi.fn(), replace: vi.fn() };
  const realWindow = window;
  // JSDOM does not navigate documents. Intercept only hard navigation while keeping
  // its real history, events and location for route/readback assertions.
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, property) {
      if (property === "location") return hardNavigation;
      const value = Reflect.get(target, property, target);
      return ["addEventListener", "removeEventListener", "scrollTo"].includes(property) ? value.bind(target) : value;
    },
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
  delete document.documentElement.dataset.server;
  delete document.documentElement.dataset.season;
  document.documentElement.style.removeProperty("--season-scene-image");
  document.documentElement.style.removeProperty("--season-character-image");
});
function completeDocumentNavigation(view) {
  const target = hardNavigation.assign.mock.lastCall[0];
  view.unmount();
  history.replaceState(null, "", target);
  return render(<WebEntry />);
}

// In production these URLs are served by the pinned Global bundle. The stable
// entry bridge must not loop when an older shell has been retained in a cache.
test.each([["/en/", "en"], ["/jp/", "ja"], ["/global/zh-CN/", "zh-CN"]])("canonical %s does not reload itself", async (pathname, locale) => {
  history.replaceState(null, "", pathname);
  render(<WebEntry />);
  await screen.findByRole("heading", { name: `Global calculator ${locale}` });
  expect(hardNavigation.replace).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("CN draft")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("legacy Japanese entry replaces its path with /jp/ and retains URL state", async () => {
  history.replaceState(null, "", "/global/ja/?source=pwa#retained");
  render(<WebEntry />);
  await waitFor(() => expect(hardNavigation.replace).toHaveBeenCalledWith("/jp/?source=pwa#retained"));
});

test("root preference loads the isolated Global entry; explicit CN URL stays CN", async () => {
  history.replaceState(null, "", "/?keep=1");
  expect(browserEntry().serverId).toBe("cn");
  localStorage.setItem(MANUAL_PREFERENCE_KEY, JSON.stringify({ serverId: "global", locale: "ja" }));
  expect(browserEntry().serverId).toBe("global");
  const view = render(<WebEntry />);
  await waitFor(() => expect(hardNavigation.replace).toHaveBeenCalledWith("/jp/?keep=1"));
  view.unmount();
  history.replaceState(null, "", "/cn/");
  expect(browserEntry().serverId).toBe("cn");
  render(<WebEntry />);
  expect(await screen.findByLabelText("CN draft")).toBeVisible();
  expect(hardNavigation.replace).toHaveBeenCalledOnce();
});

test("manual CN-to-Global switching navigates to the isolated bundle and preserves saved CN data/history", async () => {
  history.replaceState({ preserved: 1 }, "", "/?keep=1");
  localStorage.setItem("rock-calculator.teams.v1", "cn-team-sentinel");
  render(<WebEntry />);
  fireEvent.change(await screen.findByLabelText("CN draft"), { target: { value: "current CN draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Global", exact: true }));
  expect(hardNavigation.assign).toHaveBeenCalledWith("/en/?keep=1");
  expect(screen.getByLabelText("CN draft")).toHaveValue("current CN draft");
  expect(screen.queryByRole("heading")).toBeNull();
  expect(localStorage.getItem("rock-calculator.teams.v1")).toBe("cn-team-sentinel");
  expect(JSON.parse(localStorage.getItem(MANUAL_PREFERENCE_KEY))).toEqual({ serverId: "global", locale: "en" });
  expect(history.state).toMatchObject({ preserved: 1, rocoEntry: { serverId: "cn", locale: "zh-CN" } });
  expect(browserEntry().serverId).toBe("cn"); // Back restores the root entry, even after saving a new preference.
});

test("locale changes navigate to canonical Japanese without copying CN storage", async () => {
  localStorage.setItem("rock-calculator.teams.v1", "cn-team-sentinel");
  history.replaceState(null, "", "/en/?source=pwa#retained");
  render(<WebEntry />);
  fireEvent.change(await screen.findByRole("combobox", { name: "Language" }), { target: { value: "ja" } });
  expect(hardNavigation.assign).toHaveBeenCalledWith("/jp/?source=pwa#retained");
  expect(JSON.parse(localStorage.getItem(MANUAL_PREFERENCE_KEY))).toEqual({ serverId: "global", locale: "ja" });
  expect(localStorage.getItem("rock-calculator.teams.v1")).toBe("cn-team-sentinel");
});

test("legacy CN share conflict can be cancelled without changing preferences or query", async () => {
  const hash = await encodeShareState(createInitialState({ meta: { id: "test-cn", rulesVersion: "test-rules" }, spirits: [], skills: [] }));
  history.replaceState(null, "", `/en/?keep=1${hash}`);
  render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent("This shared setup belongs to the CN server");
  fireEvent.click(screen.getByRole("button", { name: "Keep current workspace" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(location.hash).toBe("");
  expect(location.search).toBe("?keep=1");
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBeNull();
  expect(hardNavigation.assign).not.toHaveBeenCalled();
});

test("damaged Global share cannot navigate or import into CN", async () => {
  history.replaceState(null, "", "/cn/#v2.global.en.e30.000000000000");
  render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent("无法打开这份分享配置");
  expect(screen.queryByRole("button", { name: "在国际服打开" })).toBeNull();
  expect(screen.queryByLabelText("CN draft")).toBeNull();
  expect(hardNavigation.assign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
  expect(await screen.findByLabelText("CN draft")).toBeVisible();
  expect(location.hash).toBe("");
});

test("validated Global share waits for a click then retains its payload during hard navigation", async () => {
  const hash = await encodeShareEnvelope({ serverId: "global", gameVersion: null, dataVersion: null,
    rulesVersion: null, locale: "ja", kind: "configuration-draft", payload: createInitialState(UNVERIFIED_GLOBAL_SNAPSHOT) });
  localStorage.setItem(MANUAL_PREFERENCE_KEY, JSON.stringify({ serverId: "cn", locale: "zh-CN" }));
  history.replaceState(null, "", `/cn/?keep=1${hash}`);
  render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent("这份分享配置属于国际服");
  expect(hardNavigation.assign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "在国际服打开" }));
  expect(hardNavigation.assign).toHaveBeenCalledWith(`/jp/?keep=1${hash}`);
  expect(JSON.parse(localStorage.getItem(MANUAL_PREFERENCE_KEY))).toEqual({ serverId: "cn", locale: "zh-CN" });
  expect(fetch).not.toHaveBeenCalled();
});

test("opening CN share preserves query and share for the original CN consumer", async () => {
  const hash = await encodeShareState(createInitialState({ meta: { id: "test-cn", rulesVersion: "test-rules" }, spirits: [], skills: [] }));
  history.replaceState(null, "", `/en/?retained=1${hash}`);
  render(<WebEntry />);
  fireEvent.click(await screen.findByRole("button", { name: "Open on CN server" }));
  expect(await screen.findByLabelText("CN draft")).toBeVisible();
  expect(location.pathname).toBe("/cn/");
  expect(location.hash).toBe(hash);
  expect(location.search).toBe("?retained=1");
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBeNull();
});

test("theme selection survives the locale document load, with CN preference isolated", async () => {
  history.replaceState({ retained: true }, "", "/en/?seasonPreview=s1&keep=1#retained");
  localStorage.setItem("rock-calculator.servers.cn.settings.season-theme.v1", "s4");
  let view = render(<WebEntry />);
  const selector = await screen.findByRole("combobox", { name: "Global theme" });
  expect(document.documentElement.dataset.season).toBe("s1");
  localStorage.setItem("rock-calculator.settings.theme.v1", "dark");
  document.documentElement.dataset.theme = "dark";
  fireEvent.change(selector, { target: { value: "s3" } });
  expect(location.search).toBe("?keep=1");
  expect(location.hash).toBe("#retained");
  expect(history.state.retained).toBe(true);
  expect(localStorage.getItem("rock-calculator.servers.cn.settings.season-theme.v1")).toBe("s4");
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ja" } });
  expect(hardNavigation.assign).toHaveBeenCalledWith("/jp/?keep=1#retained");
  view = completeDocumentNavigation(view);
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("s3");
  expect(document.documentElement.dataset.season).toBe("s3");
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Switch to the CN server" }));
  expect(await screen.findByRole("combobox", { name: "CN theme" })).toHaveValue("s4");
  expect(document.documentElement.dataset.season).toBe("s4");
  view.unmount();
});

test("random theme shuffle exits preview, keeps unrelated URL state and persists separately", async () => {
  history.replaceState({ retained: true }, "", "/en/?seasonPreview=s1&keep=1#retained");
  localStorage.setItem("rock-calculator.servers.global.settings.season-theme.v1", "random");
  localStorage.setItem("rock-calculator.servers.cn.settings.season-theme.v1", "s4");
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const view = render(<WebEntry />);
  await screen.findByRole("combobox", { name: "Global theme" });
  expect(document.documentElement.dataset.season).toBe("s1");
  fireEvent.click(screen.getByRole("button", { name: "Random Global theme" }));
  expect(document.documentElement.dataset.season).toBe("s3");
  expect(location.search).toBe("?keep=1");
  expect(location.hash).toBe("#retained");
  expect(history.state.retained).toBe(true);
  expect(localStorage.getItem("rock-calculator.servers.global.settings.season-theme.v1")).toBe("random");
  expect(localStorage.getItem("rock-calculator.servers.cn.settings.season-theme.v1")).toBe("s4");
  fireEvent.change(screen.getByRole("combobox", { name: "Global theme" }), { target: { value: "s3" } });
  view.unmount();
  render(<WebEntry />);
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("s3");
  expect(document.documentElement.dataset.season).toBe("s3");
});
