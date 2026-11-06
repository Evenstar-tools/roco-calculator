import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Toolbox } from "../../src/components/Toolbox.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { PluginAccess } from "../../src/runtime/PluginAccess.jsx";

const testUrl = window.location.href;
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules();
  globalThis.jsdom.reconfigure({ url: testUrl });
  document.cookie = "roco-cn-plugin-entry=; Max-Age=0; Path=/";
});
function renderUnlockable(children) {
  return render(<PluginAccess enabled><input aria-label="彩蛋搜索" type="search" defaultValue="龙骑士" />{children}</PluginAccess>);
}
const unlock = () => fireEvent.keyDown(screen.getByLabelText("彩蛋搜索"), { key: "Enter" });

test("加载阶段不开放会在就绪时消失的工具菜单", () => {
  const { rerender } = render(<Toolbox />);
  expect(screen.getByRole("button", { name: "工具箱" })).toBeDisabled();
  rerender(<Toolbox actions={{ types: vi.fn() }} />);
  expect(screen.getByRole("button", { name: "工具箱" })).toBeEnabled();
});

test("七项工具按分组打开，先收起并还原焦点再执行入口", () => {
  const ids = ["types", "skills", "balanceHistory", "deer", "transmission", "speed", "durability"];
  const actions = Object.fromEntries(ids.map(id => [id, vi.fn(() => {
    expect(screen.getByRole("button", {name:"工具箱"})).toHaveFocus();
  })]));
  render(<Toolbox actions={actions} />);
  for (const [index,id] of ids.entries()) {
    fireEvent.click(screen.getByRole("button", {name:"工具箱"}));
    const panel=screen.getByRole("navigation", {name:"工具箱"});
    expect(within(panel).getAllByRole("button")).toHaveLength(7);
    expect(within(within(panel).getByRole("region", { name: "查询" })).getAllByRole("button").map(button => button.textContent))
      .toEqual(["属性查询", "技能检索", "平衡调整回顾"]);
    expect(within(panel).getByRole("button", { name: "平衡调整回顾" })).toHaveStyle({ gridColumn: "1 / -1" });
    const nature = within(within(panel).getByRole("region", { name: "计算" })).getByRole("link", { name: "S5奇异性格计算" });
    expect(nature).toHaveAttribute("href", "/tools/s5-nature/index.html");
    expect(nature).toHaveClass("app-menu__nature-tool");
    expect(nature).not.toHaveAttribute("target");
    fireEvent.click(within(panel).getAllByRole("button")[index]);
    expect(actions[id]).toHaveBeenCalledOnce();
    expect(screen.queryByRole("navigation", {name:"工具箱"})).toBeNull();
  }
});

test("only warms the tool under pointer or keyboard focus", () => {
  const onWarm = vi.fn();
  render(<Toolbox actions={{ types: vi.fn(), skills: vi.fn() }} onWarm={onWarm} />);
  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  expect(onWarm).not.toHaveBeenCalledWith("skills");
  fireEvent.pointerEnter(screen.getByRole("button", { name: "技能检索" }));
  expect(onWarm).toHaveBeenCalledWith("skills");
});

test("Global 工具箱保留克制图，不显示国服平衡调整回顾入口", () => {
  const openChart = vi.fn();
  const openBalanceHistory = vi.fn();
  renderUnlockable(<RuntimeProvider serverId="global"><Toolbox actions={{ types: vi.fn(), typeChart: openChart, balanceHistory: openBalanceHistory }} /></RuntimeProvider>);
  unlock();
  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  expect(screen.queryByRole("link", { name: "S5 抢先体验" })).toBeNull();
  expect(screen.queryByRole("region", { name: "插件工具" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "野生精灵检测器" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "平衡调整回顾" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "S5奇异性格计算" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "18 系克制图" }));
  expect(openChart).toHaveBeenCalledOnce();
  expect(openBalanceHistory).not.toHaveBeenCalled();
});

test("国服正式版插件入口默认隐藏，解锁后点击才发导航凭据并收起菜单", () => {
  globalThis.jsdom.reconfigure({ url: "https://rococalc.top/cn/" });
  document.cookie = "roco-cn-plugin-entry=; Max-Age=0; Path=/";
  const actions = { types: vi.fn(), skills: vi.fn() };
  renderUnlockable(<Toolbox actions={actions} />);
  const trigger = screen.getByRole("button", { name: "工具箱" });
  fireEvent.click(trigger);
  expect(screen.queryByRole("region", { name: "插件工具" })).toBeNull();
  expect(screen.queryByRole("link", { name: "野生精灵检测器" })).toBeNull();
  expect(screen.getByRole("link", { name: "S5奇异性格计算" })).toBeVisible();
  fireEvent.click(trigger);
  unlock();
  expect(document.cookie).not.toContain("roco-cn-plugin-entry=");
  fireEvent.click(trigger);
  const plugins = screen.getByRole("region", { name: "插件工具" });
  const link = within(plugins).getByRole("link", { name: "野生精灵检测器" });
  expect(link).toHaveAttribute("href", "/plugins/wild-spirit-detector/");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(link).toHaveStyle({ minHeight: "44px" });
  const setCookie = vi.spyOn(document, "cookie", "set");
  link.addEventListener("click", event => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(document.cookie).toContain("roco-cn-plugin-entry=1");
  expect(setCookie).toHaveBeenCalledWith(expect.stringMatching(/^roco-cn-plugin-entry=1; Max-Age=\d+; Path=\/; SameSite=Strict; Secure$/));
  expect(screen.queryByRole("navigation", { name: "工具箱" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(actions.types).not.toHaveBeenCalled();
  expect(actions.skills).not.toHaveBeenCalled();
});

test("已解锁入口仅为左键或中键导航发放凭据，普通打开菜单和右键不发放", () => {
  renderUnlockable(<Toolbox actions={{ types: vi.fn() }} />);
  unlock();
  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  const link = screen.getByRole("link", { name: "野生精灵检测器" });
  expect(document.cookie).not.toContain("roco-cn-plugin-entry=");
  fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 2 }));
  expect(document.cookie).not.toContain("roco-cn-plugin-entry=");
  fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  expect(document.cookie).toContain("roco-cn-plugin-entry=1");
});

test("桌面 app 协议不显示国服网页专属工具", () => {
  globalThis.jsdom.reconfigure({ url: "app://calculator/cn/" });
  renderUnlockable(<Toolbox actions={{ types: vi.fn() }} />);
  unlock();
  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  expect(screen.queryByRole("region", { name: "插件工具" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "野生精灵检测器" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "S5奇异性格计算" })).not.toBeInTheDocument();
});

test("正式版隐藏抢先入口，重复点击、外部点击、Esc 关闭，键盘焦点在工具与插件链接间循环", () => {
  const actions=Object.fromEntries(["types","skills","balanceHistory","deer","transmission","speed","durability"].map(id=>[id,vi.fn()]));
  renderUnlockable(<Toolbox actions={actions} />);
  unlock();
  const trigger=screen.getByRole("button",{name:"工具箱"});
  fireEvent.click(trigger);
  const buttons=within(screen.getByRole("navigation")).getAllByRole("button");
  const plugin=screen.getByRole("link", { name: "野生精灵检测器" });
  expect(screen.queryByRole("link", { name: "S5 抢先体验" })).toBeNull();
  expect(screen.queryByRole("link", { name: "返回正式版" })).toBeNull();
  expect(buttons[0]).toHaveFocus();
  fireEvent.keyDown(document,{key:"Tab",shiftKey:true});
  expect(plugin).toHaveFocus();
  fireEvent.keyDown(document,{key:"Tab"});
  expect(buttons[0]).toHaveFocus();
  fireEvent.keyDown(document,{key:"Escape"});
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded","false");
  fireEvent.click(trigger); fireEvent.click(trigger);
  expect(screen.queryByRole("navigation")).toBeNull();
  fireEvent.click(trigger); fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("navigation")).toBeNull();
});


test("抢先版工具箱返回正式版，链接参与键盘焦点循环", async () => {
  vi.stubEnv("MODE", "pre");
  vi.resetModules();
  const { Toolbox: PreviewToolbox } = await import("../../src/components/Toolbox.jsx");
  const { PluginAccess: PreviewAccess } = await import("../../src/runtime/PluginAccess.jsx");
  const actions = Object.fromEntries(["types", "skills", "balanceHistory", "deer", "transmission", "speed", "durability"].map(id => [id, vi.fn()]));
  render(<PreviewAccess enabled><input aria-label="彩蛋搜索" type="search" defaultValue="龙骑士" /><PreviewToolbox actions={actions} /></PreviewAccess>);
  unlock();
  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  const panel = screen.getByRole("navigation", { name: "工具箱" });
  const first = within(panel).getAllByRole("button")[0];
  const back = within(panel).getByRole("link", { name: "返回正式版" });
  expect(back).toHaveAttribute("href", "/cn/");
  expect(within(panel).queryByRole("link", { name: "S5 抢先体验" })).toBeNull();
  expect(within(panel).queryByRole("region", { name: "插件工具" })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("link", { name: "野生精灵检测器" })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("link", { name: "S5奇异性格计算" })).not.toBeInTheDocument();
  expect(first).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(back).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(first).toHaveFocus();
});
