import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { createProductInitialState } from "../../src/state/calculator-session.js";
import { decodeShareEnvelope } from "../../src/state/share.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";

beforeEach(() => {
  localStorage.clear(); history.replaceState(null, "", "/global/zh-CN/");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const snapshot = globalPlaceholderCatalog();
function workspace(props = {}) {
  return <RuntimeProvider serverId="global" locale="zh-CN"><LocaleProvider locale="zh-CN">
    <App initialSnapshot={snapshot} {...props} />
  </LocaleProvider></RuntimeProvider>;
}
async function choose(user, label, name) {
  const input = screen.getByRole("combobox", { name: label, exact: true });
  await user.clear(input); await user.type(input, name);
  await user.click(screen.getByRole("option", { name: new RegExp(name) }));
}

test("Chinese references support selecting, configuring, restoring and sharing without CN defaults or rules", async () => {
  const user = userEvent.setup();
  localStorage.setItem("rock-calculator.teams.v1", "CN sentinel");
  const initial = createProductInitialState(snapshot);
  initial.directions.forward.context = { weatherRainTurns: 42, weatherThunder: true };
  initial.directions.reverse.context = { weatherRainTurns: 21 };
  const view = render(workspace({ initialWorkspace: { state: initial } }));
  await choose(user, "攻击方精灵", "中文占位一");
  await choose(user, "防御方精灵", "中文占位二");
  expect(screen.getByRole("region", { name: "即时配置" })).toBeVisible();
  await choose(user, "攻击方技能2", "中文技能一");
  fireEvent.click(screen.getByRole("checkbox", { name: "攻击方物攻个体加点", exact: true }));
  const store = createCalculatorSessionStore({ serverId: "global" });
  const saved = store.loadSession().present;
  expect(saved.sides.attacker.spiritId).toBe("cn-placeholder:first");
  expect(saved.sides.attacker.skills.four[1]).toBe("cn-placeholder:first-skill");
  expect(saved.sides.attacker.nature).toBeNull();
  expect(saved.sides.attacker.displayIvs.physicalAttack).toBe(60);
  expect(saved.sides.attacker.displayIvs.hp).toBeNull();
  expect(saved.directions.forward.context).toEqual(initial.directions.forward.context);
  expect(saved.directions.reverse.context).toEqual(initial.directions.reverse.context);
  expect(view.container.querySelector(".result-column")).toBeNull();
  expect(screen.queryByText("使用技能")).toBeNull();
  view.unmount(); render(workspace());
  expect(screen.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue("中文占位一");
  expect(screen.getByRole("combobox", { name: "攻击方技能2" })).toHaveValue("中文技能一");
  await user.click(screen.getByRole("button", { name: "打开菜单", exact: true }));
  await user.click(screen.getByRole("button", { name: "分享当前配置", exact: true }));
  const link = screen.getByRole("textbox", { name: "当前配置链接" });
  await waitFor(() => expect(link.value).toContain("#v2.global."));
  const shared = await decodeShareEnvelope(new URL(link.value).hash);
  expect(shared.serverId).toBe("global");
  expect(shared.dataVersion).toBeNull(); expect(shared.rulesVersion).toBeNull();
  expect(shared.payload.sides.attacker).toEqual(saved.sides.attacker);
  expect(shared.payload.directions.forward.context).toEqual(initial.directions.forward.context);
  expect(localStorage.getItem("rock-calculator.teams.v1")).toBe("CN sentinel");
  expect(localStorage.getItem("rock-calculator.servers.cn.calculator.session.v1")).toBeNull();
});


test("Global original toolbox queries its own released catalog without changing calculator state", async () => {
  const released = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
  const catalog = JSON.parse(readFileSync("public/data/global/skill-query/catalog.json", "utf8"));
  fetch.mockResolvedValue({ ok: true, json: async () => catalog });
  const user = userEvent.setup();
  render(<RuntimeProvider serverId="global" locale="zh-CN"><LocaleProvider locale="zh-CN"><App initialSnapshot={released} /></LocaleProvider></RuntimeProvider>);
  const before = createCalculatorSessionStore({ serverId: "global" }).loadSession();
  await user.click(screen.getByRole("button", { name: "工具箱", exact: true }));
  await user.click(screen.getByRole("button", { name: "技能检索", exact: true }));
  const search = await screen.findByRole("textbox", { name: "搜索技能或精灵" });
  await user.type(search, "地刺");
  await user.click(screen.getByRole("button", { name: "添加地刺", exact: true }));
  expect(document.querySelectorAll(".sq-family-main").length).toBeGreaterThan(0);
  expect(fetch).toHaveBeenCalledWith("/data/global/skill-query/catalog.json");
  expect(fetch.mock.calls.map(([url]) => String(url)).filter(url => url.includes("/data/skill-query/") || url.includes("popular-pvp"))).toEqual([]);
  await user.click(screen.getByRole("button", { name: "关闭技能查询", exact: true }));
  expect(createCalculatorSessionStore({ serverId: "global" }).loadSession()).toEqual(before);
});
