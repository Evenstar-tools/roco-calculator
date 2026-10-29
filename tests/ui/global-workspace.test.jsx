import { fireEvent, render, screen, within, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { encodeShareEnvelope } from "../../src/state/share.js";
import { createInitialState } from "../../src/state/defaults.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { App } from "../../src/App.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages } from "../../src/i18n/messages.js";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/en/");
  clearMissingUiMessages();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function workspace(locale = "en", props = {}) {
  return <RuntimeProvider serverId="global" locale={locale} onLocaleChange={() => {}} onServerChange={() => {}}>
    <LocaleProvider locale={locale}><App initialSnapshot={UNVERIFIED_GLOBAL_SNAPSHOT} {...props} /></LocaleProvider>
  </RuntimeProvider>;
}

test.each([
  ["en", "Calculate damage in three steps", "Open menu", "Display settings", "Done", "Open teams"],
  ["zh-CN", "三步完成一次伤害计算", "打开菜单", "显示设置", "完成", "打开队伍"],
  ["ja", "3ステップでダメージ計算", "メニューを開く", "表示設定", "完了", "チームを開く"],
])("%s inherits the original calculator, menus and settings without loading CN data", (locale, title, menu, settings, done, teams) => {
  localStorage.setItem("rock-calculator.teams.v1", "CN sentinel");
  const { container } = render(workspace(locale));
  expect(screen.getByRole("heading", { name: title })).toBeVisible();
  expect(container.querySelector(".calculator-layout")).toBeInTheDocument();
  expect(container.querySelector(".global-workspace")).toBeNull();
  expect(screen.getByRole("button", { name: teams })).toBeVisible();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: menu }));
  fireEvent.click(screen.getByRole("button", { name: settings, exact: true }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveClass("display-settings-dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: done }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(localStorage.getItem("rock-calculator.teams.v1")).toBe("CN sentinel");
  expect(getMissingUiMessages()).toEqual([]);
});

test("Global ignores an accidentally supplied CN snapshot and remains an empty unverified original workspace", () => {
  render(workspace("en", { initialSnapshot: { meta: { id: "cn-test", rulesVersion: "rules" }, spirits: [{ id: "cn-only", fullName: "CN only" }], skills: [] } }));
  expect(screen.getByRole("heading", { name: "Calculate damage in three steps" })).toBeVisible();
  expect(screen.queryByText("CN only")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("server switching keeps the same original component alive and view settings remain server scoped", () => {
  const view = render(workspace());
  const toggle = screen.getByRole("button", { name: "Detailed", exact: true });
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Detailed", exact: true })).toHaveAttribute("aria-pressed", "true");
  view.rerender(workspace("en", { active: false }));
  expect(screen.queryByRole("heading")).toBeNull();
  view.rerender(workspace());
  expect(screen.getByRole("button", { name: "Detailed", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(localStorage.getItem("rock-calculator.servers.cn.view-mode.v1")).toBeNull();
});


test("the original Global App persists unknown shared references and restores the same draft after refresh", async () => {
  const payload = createInitialState(UNVERIFIED_GLOBAL_SNAPSHOT);
  payload.sides.attacker.spiritId = "global-unverified-jini";
  payload.sides.attacker.nature = "global-unverified-nature";
  payload.sides.attacker.skills.four[0] = { skillId: "global-unverified-skill", context: { rainWeather: false } };
  payload.sides.attacker.traitValues = { unknown: { preserved: 23 } };
  payload.directions.forward.context.weatherRainTurns = 42;
  payload.directions.forward.context.weatherThunder = true;
  payload.directions.reverse.context.weatherRainTurns = 21;
  const hash = await encodeShareEnvelope({ serverId: "global", locale: "en", kind: "configuration-draft",
    gameVersion: null, dataVersion: null, rulesVersion: null, payload });
  history.replaceState({ sentinel: "keep" }, "", `/en/${hash}`);
  const view = render(workspace());
  const store = createCalculatorSessionStore({ serverId: "global" });
  await waitFor(() => expect(store.loadSession()?.present).toEqual(payload));
  expect(location.hash).toBe("");
  expect(history.state).toEqual({ sentinel: "keep" });
  expect(localStorage.getItem("rock-calculator.servers.cn.calculator.session.v1")).toBeNull();
  view.unmount();
  render(workspace());
  fireEvent.click(screen.getByRole("button", { name: "Swap both complete setups" }));
  await waitFor(() => expect(store.loadSession().present.sides.defender.spiritId).toBe("global-unverified-jini"));
  expect(store.loadSession().present.sides.defender).toEqual(payload.sides.attacker);
  expect(store.loadSession().present.directions.reverse).toEqual(payload.directions.reverse);
  expect(store.loadSession().present.directions.forward).toEqual(payload.directions.forward);
  expect(screen.getByRole("heading", { name: "Calculate damage in three steps" })).toBeVisible();
  expect([...new Set(fetch.mock.calls.map(([url]) => url))])
    .toEqual(["/data/global/presets/pvp-popular-configs.json"]);
  expect(getMissingUiMessages()).toEqual([]);
});


test.each(["#v1.foreign.deadbeef0000", "#v2.global.en.e30.000000000000"])("cancelled or damaged %s never discards the saved Global session", async (hash) => {
  const payload = createInitialState(UNVERIFIED_GLOBAL_SNAPSHOT);
  payload.sides.attacker.spiritId = "keep-global-session";
  const store = createCalculatorSessionStore({ serverId: "global" });
  store.saveSession({ present: payload, past: [], future: [] });
  history.replaceState(null, "", `/en/${hash}`);
  const view = render(workspace("en", { active: false }));
  history.replaceState(null, "", "/en/");
  view.rerender(workspace());
  fireEvent.click(screen.getByRole("button", { name: "Swap both complete setups" }));
  await waitFor(() => expect(store.loadSession().present.sides.defender.spiritId).toBe("keep-global-session"));
  expect(store.loadSession().past[0].state).toEqual(payload);
});


test("a new Global workspace saves unset nature and IVs instead of CN defaults", async () => {
  render(workspace());
  fireEvent.click(screen.getByRole("button", { name: "Swap both complete setups" }));
  const saved = createCalculatorSessionStore({ serverId: "global" }).loadSession();
  for (const side of Object.values(saved.present.sides)) {
    expect(side.nature).toBeNull();
    expect(Object.values(side.displayIvs)).toEqual([null, null, null, null, null, null]);
  }
  expect(getMissingUiMessages()).toEqual([]);
});
