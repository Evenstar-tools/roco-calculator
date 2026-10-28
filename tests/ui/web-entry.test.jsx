import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WebEntry, browserEntry } from "../../src/runtime/WebEntry.jsx";
import { MANUAL_PREFERENCE_KEY } from "../../src/runtime/routes.js";
import { encodeShareState, encodeShareEnvelope } from "../../src/state/share.js";
import { createInitialState } from "../../src/state/defaults.js";
import { useRuntime } from "../../src/runtime/RuntimeContext.jsx";
import { App as MockGlobalWorkspace } from "../../src/App.jsx";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";

vi.mock("../../src/CalculatorRouter.jsx", () => ({
  CalculatorRouter: function CnWorkspace({ active, onOpenGlobal }) {
    const [draft, setDraft] = useState("");
    const runtime = useRuntime();
    if (runtime.serverId === "global") return <MockGlobalWorkspace active={active} />;
    return active && <><input aria-label="CN draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <select aria-label="CN theme" value={runtime.seasonThemePreference} onChange={(event) => runtime.onSeasonThemeChange(event.target.value)}>
        {["default", "random", "s1", "s2", "s3", "s4", "s5"].map((id) => <option key={id}>{id}</option>)}
      </select>
      <button onClick={() => runtime.onSeasonThemeChange("random")}>Random CN theme</button>
      <button onClick={onOpenGlobal}>Global</button></>;
  },
}));
vi.mock("../../src/App.jsx", () => ({
  App: function OriginalApp({ active }) {
    const runtime = useRuntime();
    return active && <>
      <h1>{runtime.locale === "ja" ? "グローバル版計算機" : "Global calculator"}</h1>
      <select aria-label="Language" value={runtime.locale} onChange={(event) => runtime.onLocaleChange(event.target.value)}>
        {["en", "zh-CN", "ja"].map((locale) => <option key={locale}>{locale}</option>)}
      </select>
      <select aria-label="Global theme" value={runtime.seasonThemePreference} onChange={(event) => runtime.onSeasonThemeChange(event.target.value)}>
        {["default", "random", "s1", "s2", "s3", "s4", "s5"].map((id) => <option key={id}>{id}</option>)}
      </select>
      <button onClick={() => runtime.onSeasonThemeChange("random")}>Random Global theme</button>
      <button onClick={runtime.onServerChange}>Switch to the CN server</button>
      <span data-testid="server-snapshot" data-share-request={runtime.shareRequestId}>{runtime.serverId}</span>
    </>;
  },
}));
vi.mock("../../src/analytics/metrics.js", () => ({ metrics: { setServer: vi.fn(), start: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/en/");
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
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

test("Global direct entry mounts the reference-capable App without CN workspace; locale changes keep the server", async () => {
  localStorage.setItem("rock-calculator.teams.v1", "cn-team-sentinel");
  render(<WebEntry />);
  await screen.findByRole("heading", { name: "Global calculator" }, { timeout: 10000 });
  expect(screen.queryByLabelText("CN draft")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.season).toBe("neutral");
  expect(document.documentElement.style.getPropertyValue("--season-scene-image")).toBe("none");
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ja" } });
  await screen.findByRole("heading", { name: "グローバル版計算機" });
  expect(location.pathname).toBe("/jp/");
  expect(document.documentElement.lang).toBe("ja");
  expect(JSON.parse(localStorage.getItem(MANUAL_PREFERENCE_KEY))).toEqual({ serverId: "global", locale: "ja" });
  expect(localStorage.getItem("rock-calculator.teams.v1")).toBe("cn-team-sentinel");
});

test("switching servers restores the current CN draft and never copies it into Global", async () => {
  history.replaceState(null, "", "/cn/");
  render(<WebEntry />);
  fireEvent.change(await screen.findByLabelText("CN draft"), { target: { value: "unsaved CN state" } });
  fireEvent.click(screen.getByRole("button", { name: "Global", exact: true }));
  await screen.findByRole("heading", { name: "Global calculator" }, { timeout: 10000 });
  expect(screen.queryByLabelText("CN draft")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Switch to the CN server" }));
  expect(await screen.findByLabelText("CN draft")).toHaveValue("unsaved CN state");
  expect(location.pathname).toBe("/cn/");
});

test("legacy CN share stays in conflict across language changes and cancel keeps manual preference", async () => {
  const hash = await encodeShareState(createInitialState({ meta: { id: "test-cn", rulesVersion: "test-rules" }, spirits: [], skills: [] }));
  history.replaceState(null, "", `/en/?keep=1${hash}`);
  render(<WebEntry />);
  await screen.findByRole("alert");
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBeNull();
  expect(await screen.findByRole("alert")).toHaveTextContent("This shared setup belongs to the CN server");
  const preference = localStorage.getItem(MANUAL_PREFERENCE_KEY);
  fireEvent.click(screen.getByRole("button", { name: "Keep current workspace" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(location.hash).toBe("");
  expect(location.search).toBe("?keep=1");
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBe(preference);
});

test("a damaged Global share never offers a server switch or imports into the CN workspace", async () => {
  history.replaceState(null, "", "/cn/#v2.global.en.e30.000000000000");
  render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent("无法打开这份分享配置");
  expect(screen.queryByRole("button", { name: "在国际服打开" })).toBeNull();
  expect(screen.queryByLabelText("CN draft")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
  expect(await screen.findByLabelText("CN draft")).toBeVisible();
  expect(location.pathname).toBe("/cn/");
  expect(location.hash).toBe("");
});

test("a verified Global share on a CN URL waits for an explicit switch without changing manual preference", async () => {
  const workspace = createInitialState(UNVERIFIED_GLOBAL_SNAPSHOT);
  const hash = await encodeShareEnvelope({ serverId: "global", gameVersion: null, dataVersion: null,
    rulesVersion: null, locale: "ja", kind: "configuration-draft", payload: workspace });
  localStorage.setItem(MANUAL_PREFERENCE_KEY, JSON.stringify({ serverId: "cn", locale: "zh-CN" }));
  history.replaceState(null, "", `/cn/${hash}`);
  render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent("这份分享草稿属于国际服");
  expect(location.pathname).toBe("/cn/");
  fireEvent.click(screen.getByRole("button", { name: "在国际服打开" }));
  await waitFor(() => expect(location.pathname).toBe("/jp/"));
  expect(await screen.findByTestId("server-snapshot")).toHaveTextContent("global");
  expect(screen.getByTestId("server-snapshot")).toHaveAttribute("data-share-request", "1");
  expect(location.hash).toBe(hash); // The original App share hook consumes it; routing never strips it early.
  expect(JSON.parse(localStorage.getItem(MANUAL_PREFERENCE_KEY))).toEqual({ serverId: "cn", locale: "zh-CN" });
  expect(fetch).not.toHaveBeenCalled();
});

test("root restores explicit manual choice but auto Global remains closed pending data", () => {
  history.replaceState(null, "", "/");
  expect(browserEntry().serverId).toBe("cn");
  localStorage.setItem(MANUAL_PREFERENCE_KEY, JSON.stringify({ serverId: "global", locale: "en" }));
  expect(browserEntry().serverId).toBe("global");
  history.replaceState(null, "", "/cn/");
  expect(browserEntry().serverId).toBe("cn");
});


test("Back to the previous root entry restores CN despite the newly saved Global preference", async () => {
  history.replaceState({ preserved: 1 }, "", "/");
  render(<WebEntry />);
  await screen.findByLabelText("CN draft");
  fireEvent.click(screen.getByRole("button", { name: "Global", exact: true }));
  await screen.findByRole("heading", { name: "Global calculator" });
  history.back();
  await waitFor(() => expect(location.pathname).toBe("/"));
  expect(await screen.findByLabelText("CN draft")).toBeVisible();
  expect(history.state.preserved).toBe(1);
  expect(JSON.parse(localStorage.getItem(MANUAL_PREFERENCE_KEY)).serverId).toBe("global");
});


test("opening a valid CN share keeps the Global workspace in the same page and does not overwrite preference", async () => {
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


test("local season preview changes only presentation and stays separate from game data", async () => {
  history.replaceState(null, "", "/en/?seasonPreview=s2");
  render(<WebEntry />);
  await screen.findByRole("heading", { name: "Global calculator" });
  expect(document.documentElement.dataset.season).toBe("s2");
  expect(document.documentElement.style.getPropertyValue("--season-scene-image")).toContain("s2-carnival.webp");
  expect(screen.getByTestId("server-snapshot")).toHaveTextContent("global");
  expect(fetch).not.toHaveBeenCalled();
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ja" } });
  await screen.findByRole("heading", { name: "グローバル版計算機" });
  expect(document.documentElement.dataset.season).toBe("s2");
  expect(document.documentElement.style.getPropertyValue("--season-character-image")).toContain("s2-jimufangzhou.webp");
});

test("manual theme exits a preview without dropping query/share data and survives locale, server and reload changes", async () => {
  const hash = await encodeShareEnvelope({ serverId: "global", gameVersion: null, dataVersion: null,
    rulesVersion: null, locale: "en", kind: "configuration-draft", payload: createInitialState(UNVERIFIED_GLOBAL_SNAPSHOT) });
  history.replaceState({ retained: true }, "", `/en/?seasonPreview=s5&keep=1${hash}`);
  localStorage.setItem("rock-calculator.servers.cn.settings.season-theme.v1", "s4");
  const view = render(<WebEntry />);
  const selector = await screen.findByRole("combobox", { name: "Global theme" });
  // App's existing light/dark control writes the shared preference and DOM directly.
  localStorage.setItem("rock-calculator.settings.theme.v1", "dark");
  document.documentElement.dataset.theme = "dark";
  fireEvent.change(selector, { target: { value: "s5" } });
  expect(document.documentElement.dataset.season).toBe("s5");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(location.search).toBe("?keep=1");
  expect(location.hash).toBe(hash);
  expect(history.state.retained).toBe(true);
  expect(localStorage.getItem("rock-calculator.servers.global.settings.season-theme.v1")).toBe("s5");
  expect(localStorage.getItem("rock-calculator.servers.cn.settings.season-theme.v1")).toBe("s4");
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ja" } });
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("s5");
  expect(location.hash).toBe(hash);
  expect(document.documentElement.dataset.season).toBe("s5");
  fireEvent.click(screen.getByRole("button", { name: "Switch to the CN server" }));
  expect(await screen.findByRole("combobox", { name: "CN theme" })).toHaveValue("s4");
  expect(document.documentElement.dataset.season).toBe("s4");
  fireEvent.change(screen.getByLabelText("CN draft"), { target: { value: "unsaved CN state" } });
  fireEvent.change(screen.getByRole("combobox", { name: "CN theme" }), { target: { value: "s2" } });
  expect(screen.getByLabelText("CN draft")).toHaveValue("unsaved CN state");
  expect(document.documentElement.dataset.season).toBe("s2");
  fireEvent.click(screen.getByRole("button", { name: "Global", exact: true }));
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("s5");
  expect(document.documentElement.dataset.season).toBe("s5");
  view.unmount();
  render(<WebEntry />);
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("s5");
  expect(document.documentElement.dataset.season).toBe("s5");
  fireEvent.change(screen.getByRole("combobox", { name: "Global theme" }), { target: { value: "default" } });
  expect(document.documentElement.dataset.season).toBe("neutral");
  expect(document.documentElement.style.getPropertyValue("--season-character-image")).toBe("none");
  fireEvent.click(screen.getByRole("button", { name: "Switch to the CN server" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "CN theme" }), { target: { value: "default" } });
  expect(document.documentElement.dataset.season).toBe("s4");
  expect(fetch).not.toHaveBeenCalled();
});

test("random themes redraw only on entry or explicit shuffle, retain each server's choice and allow fixing the drawn theme", async () => {
  localStorage.setItem("rock-calculator.servers.cn.settings.season-theme.v1", "random");
  localStorage.setItem("rock-calculator.servers.global.settings.season-theme.v1", "random");
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  const view = render(<WebEntry />);
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("random");
  expect(document.documentElement.dataset.season).toBe("s1");
  random.mockReturnValue(0.25);
  fireEvent.click(screen.getByRole("button", { name: "Random Global theme" }));
  expect(document.documentElement.dataset.season).toBe("s3");
  localStorage.setItem("rock-calculator.settings.theme.v1", "dark");
  document.documentElement.dataset.theme = "dark";
  random.mockReturnValue(0.5);
  for (const locale of ["zh-CN", "ja"]) {
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: locale } });
    expect(document.documentElement.dataset.season).toBe("s3");
  }
  fireEvent.click(screen.getByRole("button", { name: "Switch to the CN server" }));
  expect(await screen.findByRole("combobox", { name: "CN theme" })).toHaveValue("random");
  expect(document.documentElement.dataset.season).toBe("s1");
  fireEvent.change(screen.getByLabelText("CN draft"), { target: { value: "unsaved CN draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Random CN theme" }));
  expect(document.documentElement.dataset.season).toBe("s4");
  expect(screen.getByLabelText("CN draft")).toHaveValue("unsaved CN draft");
  fireEvent.click(screen.getByRole("button", { name: "Global", exact: true }));
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("random");
  expect(document.documentElement.dataset.season).toBe("s3");
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.change(screen.getByRole("combobox", { name: "Global theme" }), { target: { value: "s3" } });
  expect(localStorage.getItem("rock-calculator.servers.global.settings.season-theme.v1")).toBe("s3");
  expect(document.documentElement.dataset.season).toBe("s3");
  fireEvent.click(screen.getByRole("button", { name: "Random Global theme" }));
  expect(document.documentElement.dataset.season).toBe("s4");
  view.unmount();
  random.mockReturnValue(0.2);
  render(<WebEntry />);
  expect(await screen.findByRole("combobox", { name: "Global theme" })).toHaveValue("random");
  expect(document.documentElement.dataset.season).toBe("s1");
  expect(localStorage.getItem("rock-calculator.servers.global.settings.season-theme-last-random.v1")).toBe("s1");
  expect(localStorage.getItem("rock-calculator.servers.cn.settings.season-theme-last-random.v1")).toBe("s4");
  expect(localStorage.getItem("rock-calculator.servers.global.settings.season-theme.v1")).toBe("random");
  expect(localStorage.getItem("rock-calculator.servers.cn.settings.season-theme.v1")).toBe("random");
  expect(fetch).not.toHaveBeenCalled();
});

test("shuffle exits a local preview without losing unrelated URL state or persisting preview artwork", async () => {
  const hash = await encodeShareEnvelope({ serverId: "global", gameVersion: null, dataVersion: null,
    rulesVersion: null, locale: "en", kind: "configuration-draft", payload: createInitialState(UNVERIFIED_GLOBAL_SNAPSHOT) });
  history.replaceState({ retained: true }, "", `/en/?seasonPreview=s1&keep=1${hash}`);
  localStorage.setItem("rock-calculator.servers.global.settings.season-theme.v1", "random");
  vi.spyOn(Math, "random").mockReturnValue(0.25);
  render(<WebEntry />);
  await screen.findByRole("combobox", { name: "Global theme" });
  expect(document.documentElement.dataset.season).toBe("s1");
  fireEvent.click(screen.getByRole("button", { name: "Random Global theme" }));
  expect(document.documentElement.dataset.season).toBe("s3");
  expect(location.search).toBe("?keep=1");
  expect(location.hash).toBe(hash);
  expect(history.state.retained).toBe(true);
  expect(localStorage.getItem("rock-calculator.servers.global.settings.season-theme.v1")).toBe("random");
  expect(localStorage.getItem(MANUAL_PREFERENCE_KEY)).toBeNull();
});
