import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";

// 原有用例按四种常用口径写成；新默认（只开极速）和记住口径另有用例。
const SPEED_PROFILE_KEYS = ["rock-calculator.servers.cn.settings.speed-rank-profiles.v1", "rock-calculator.servers.global.settings.speed-rank-profiles.v1"];
beforeEach(() => { for (const key of SPEED_PROFILE_KEYS) localStorage.setItem(key, JSON.stringify(["positive-max", "neutral-max", "neutral-zero", "negative-zero"])); });
afterEach(() => { for (const key of SPEED_PROFILE_KEYS) localStorage.removeItem(key); });

const snapshot = { meta: {}, spirits: [["water", "水测试", ["水"]], ["grass", "草测试", ["草"]], ["dragon", "龙测试", ["水", "龙"]]].map(([id, fullName, types], dexNo) => ({ id, fullName, types, dexNo, stage: "首领", sourceCategory: "首领形态", raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 } })) };

test("耐久特殊配置保留基础行，可关闭、搜索并查看强化后的面板", () => {
  const specialSnapshot = { ...snapshot, traits: [{ id: "stockpile", name: "囤积" }], spirits: [
    { ...snapshot.spirits[0], fullName: "蹦床松鼠", traitIds: ["stockpile"] },
  ] };
  render(<RankingsPanel kind="durability" snapshot={specialSnapshot} onClose={vi.fn()} />);
  expect(screen.getByLabelText("特殊配置")).toBeChecked();
  expect(screen.getAllByRole("button", { name: /蹦床松鼠/ })).toHaveLength(2);
  expect(screen.getByRole("status")).toHaveTextContent("2档");
  fireEvent.click(screen.getByRole("button", { name: /蹦床松鼠 · 10能量/ }));
  const detail = within(screen.getByRole("region", { name: "榜单配置详情" }));
  expect(detail.getByText(/当前能量10，双防\+100%/)).toHaveTextContent("物防 203→406 · 魔防 203→406");
  expect(detail.getByRole("columnheader", { name: "特性后耐久" })).toBeInTheDocument();
  fireEvent.click(detail.getByRole("button", { name: "返回榜单" }));
  fireEvent.click(screen.getByLabelText("特殊配置"));
  expect(screen.getAllByRole("button", { name: /蹦床松鼠/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "10能量" } });
  expect(screen.getAllByRole("button", { name: /蹦床松鼠/ })).toHaveLength(1);
});

test("速度榜全屏不重挂查询、口径、详情和种族视图，Escape逐层返回", () => {
  const close = vi.fn();
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={close} />);
  expect(screen.getByRole("button", { name: "关闭排行榜" })).toHaveFocus();
  const input = screen.getByLabelText("搜索速度榜精灵");
  fireEvent.change(input, { target: { value: "水测试" } });
  const rows = screen.getAllByRole("button", { name: /在速度表选择水测试/ });
  fireEvent.click(rows[0]);
  const detail = screen.getByRole("region", { name: "速度配置详情" });
  fireEvent.click(screen.getByRole("button", { name: "全屏展示" }));
  expect(screen.getByRole("dialog").parentElement).toHaveClass("is-expanded");
  expect(screen.getByLabelText("搜索速度榜精灵")).toBe(input);
  expect(input).toHaveValue("水测试");
  expect(screen.getByRole("region", { name: "速度配置详情" })).toBe(detail);
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })).toEqual(rows);
  fireEvent.keyDown(detail, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "速度配置详情" })).toBeNull();
  expect(screen.getByRole("dialog").parentElement).toHaveClass("is-expanded");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.getByRole("dialog").parentElement).not.toHaveClass("is-expanded");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
  const baseInput = screen.getByLabelText("搜索种族总览");
  fireEvent.change(baseInput, { target: { value: "水测试" } });
  fireEvent.click(screen.getByRole("button", { name: "全屏展示" }));
  expect(screen.getByRole("button", { name: "按种族速查" })).toHaveAttribute("aria-pressed", "true");
  expect(baseInput).toHaveValue("水测试");
  expect(screen.getByRole("slider", { name: "种族速度轴" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "退出全屏" }));
  fireEvent.keyDown(baseInput, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});

test.each([["en", "Expand view", "Restore view", "Speed navigator"], ["ja", "全画面表示", "元の表示に戻す", "素早さナビ"]])("国际服%s同步全屏与速度轴", (locale, expand, restore, axis) => {
  render(<RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}><RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} /></LocaleProvider></RuntimeProvider>);
  expect(screen.getByRole("slider", { name: axis })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: expand }));
  expect(screen.getByRole("button", { name: restore })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("dialog").parentElement).toHaveClass("is-expanded");
});

test("无结果时隐藏速度轴，关闭后耐久榜不继承全屏", () => {
  const { rerender } = render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "不存在的精灵" } });
  expect(screen.queryByRole("slider")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "全屏展示" }));
  rerender(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  expect(screen.getByRole("dialog").parentElement).not.toHaveClass("is-expanded");
  expect(screen.queryByRole("button", { name: "全屏展示" })).toBeNull();
});

test("独立耐久榜支持全选、半选、全不选、混合倍率和只读详情", () => {
  render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("承受属性"), {target:{value:"火"}});
  fireEvent.click(screen.getByRole("button",{name:"选抵抗"}));
  expect(screen.getByLabelText("全选").indeterminate).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("火系 · ×0.25 / ×0.5 · 2只");
  expect(screen.queryByRole("button",{name:/草测试/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("全选"));
  expect(screen.getByLabelText("全选")).toBeChecked();
  fireEvent.click(screen.getByLabelText("全选"));
  expect(screen.getByText("尚未勾选倍率")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("×0.5"));
  fireEvent.click(screen.getByLabelText("×2"));
  const button = screen.getByRole("button",{name:/草测试/});
  fireEvent.click(button);
  expect(screen.getByRole("region",{name:"榜单配置详情"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"返回榜单"}));
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"),{target:{value:"草测试"}});
  expect(within(screen.getByRole("table",{name:"标准耐久完整榜"})).getAllByRole("row")[1]).toHaveTextContent("2草测试");
});

test("关闭重开保留独立筛选，速度口径不串状态且无伪造参照", () => {
  const close = vi.fn();
  const {rerender} = render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={close} />);
  fireEvent.change(screen.getByLabelText("承受属性"),{target:{value:"火"}});
  fireEvent.click(screen.getByRole("button",{name:"选弱点"}));
  rerender(<RankingsPanel kind={null} snapshot={snapshot} onClose={close} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  rerender(<RankingsPanel kind="speed" snapshot={snapshot} onClose={close} />);
  expect(screen.getAllByRole("button",{name:/水测试/})).toHaveLength(4);
  expect(screen.queryByText(/当前速度/)).not.toBeInTheDocument();
  rerender(<RankingsPanel kind="durability" snapshot={snapshot} onClose={close} />);
  expect(screen.getByRole("status")).toHaveTextContent("火系 · ×2 / ×3 · 1只");
});

test("数字基准、种族速度和去字模式保留可点击详情", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  const input = screen.getByLabelText("搜索速度榜精灵");
  for (const value of ["-1", "2.5"]) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByRole("status")).toHaveTextContent("请输入非负整数速度值");
    expect(screen.queryByText("基准位置 · 没有同速配置")).not.toBeInTheDocument();
  }
  fireEvent.change(input, { target: { value: "0" } });
  expect(screen.getByRole("status")).toHaveTextContent("比 0 快 4 · 同速 0 · 慢 0 个配置");
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.queryByText("基准位置 · 没有同速配置")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "试查 267" })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "267" } });
  expect(screen.getByRole("status")).toHaveTextContent("比 267 快 0 · 同速 0 · 慢 12 个配置");
  expect(screen.getByText("基准位置 · 没有同速配置")).toBeInTheDocument();
  expect(screen.queryByLabelText("速度搜索方式")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "100" } });
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })).toHaveLength(4);
  expect(screen.getByRole("button", { name: "显示精灵文字" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })[0].querySelector("strong")).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: /在速度表选择水测试/ })[0]);
  expect(screen.getByRole("region", { name: "速度配置详情" })).toBeInTheDocument();
});

test("定位退出搜索并恢复完整榜单", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  const input = screen.getByLabelText("搜索速度榜精灵");
  fireEvent.change(input, { target: { value: "水测试" } });
  expect(screen.queryByRole("button", { name: /在速度表选择草测试/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "定位 水测试" }));
  expect(input).toHaveValue("");
  expect(screen.getAllByRole("button", { name: /在速度表选择草测试/ })).toHaveLength(4);
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ }).some(button => button.getAttribute("aria-pressed") === "true")).toBe(true);
  fireEvent.change(input, { target: { value: "267" } });
  fireEvent.click(screen.getByRole("button", { name: "定位 267" }));
  expect(input).toHaveValue("");
  expect(screen.getByText("基准位置 · 没有同速配置")).toBeInTheDocument();
});

test("速度点选及详情定位只高亮具体配置，收起保留，数字定位与重置清除", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  const table = screen.getByRole("table", { name: "速度档位表" });
  const selectedCards = () => table.querySelectorAll('.ability-speed__tier-spirits button[aria-pressed="true"]');
  const water = within(table).getAllByRole("button", { name: /在速度表选择水测试/ })[0];
  fireEvent.click(water);
  expect([...selectedCards()]).toEqual([water]);
  fireEvent.click(screen.getByRole("button", { name: "收起速度详情" }));
  expect([...selectedCards()]).toEqual([water]);
  const grass = within(table).getAllByRole("button", { name: /在速度表选择草测试/ })[0];
  fireEvent.click(grass);
  expect([...selectedCards()]).toEqual([grass]);
  fireEvent.click(screen.getByRole("button", { name: "收起速度详情" }));
  const input = screen.getByLabelText("搜索速度榜精灵");
  fireEvent.change(input, { target: { value: "水测试" } });
  fireEvent.click(screen.getAllByRole("button", { name: /在速度表选择水测试/ })[0]);
  const maxSpeed = within(screen.getByRole("region", { name: "速度配置详情" })).getByRole("button", { name: /^满速 \d+，定位实速$/ });
  fireEvent.click(maxSpeed);
  expect(input).toHaveValue("");
  expect(selectedCards()).toHaveLength(1);
  expect(selectedCards()[0]).toHaveAccessibleName(/在速度表选择水测试/);
  expect(within(table).getAllByRole("button", { name: /在速度表选择草测试/ })).toHaveLength(1);
  expect(within(table).getByRole("button", { name: /在速度表选择草测试/ })).toHaveAttribute("aria-pressed", "false");
  fireEvent.change(input, { target: { value: "267" } });
  fireEvent.click(screen.getByRole("button", { name: "定位 267" }));
  expect(selectedCards()).toHaveLength(0);
  fireEvent.change(input, { target: { value: "水测试" } });
  fireEvent.click(screen.getByRole("button", { name: "定位 水测试" }));
  expect(selectedCards()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  expect(selectedCards()).toHaveLength(0);
});

test("耐久详情返回后高亮所选行，切指标保留，筛选和重置不冒用其他行", () => {
  render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  const table = screen.getByRole("table", { name: "标准耐久完整榜" });
  const selectedRows = () => table.querySelectorAll('tbody tr[aria-current="true"]');
  for (const name of ["水测试", "草测试"]) {
    fireEvent.click(within(table).getByRole("button", { name: new RegExp(name) }));
    fireEvent.click(screen.getByRole("button", { name: "返回榜单" }));
    expect(selectedRows()).toHaveLength(1);
    expect(selectedRows()[0]).toHaveTextContent(name);
  }
  fireEvent.click(screen.getByRole("button", { name: "物理耐久", exact: true }));
  expect(selectedRows()[0]).toHaveTextContent("草测试");
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "水测试" } });
  expect(selectedRows()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "" } });
  expect(selectedRows()[0]).toHaveTextContent("草测试");
  fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  expect(selectedRows()).toHaveLength(0);
});

test("仅命中种族速度时定位完整种族表，不创建空实速档", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "100" } });
  expect(screen.queryByRole("button", { name: "定位 100" })).not.toBeInTheDocument();
  expect(screen.queryByText("基准位置 · 没有同速配置")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "定位种族 100" }));
  expect(screen.getByRole("button", { name: "按种族速查" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("搜索种族总览")).toHaveValue("");
  const table = screen.getByRole("table", { name: "种族速度档位表" });
  expect(table.querySelector('tr[aria-current="true"]')).toHaveTextContent("100");
  expect(within(table).getAllByRole("button", { name: /标准速度详情/ })).toHaveLength(3);
});

const levelSnapshot = { ...snapshot, spirits: [{
  ...snapshot.spirits[2], id: "ming", fullName: "冥古龙",
  previewIdentity: { catalogId: "s5-ranking-test", key: "minggulong", mechanicKey: "minggulong" },
  raceStats: { hp: 118, physicalAttack: 128, magicalAttack: 42, physicalDefense: 81, magicalDefense: 63, speed: 70 },
}] };

test("高等级速度只在特殊口径显示，详情定位保留开关，种族视图只保留60级", () => {
  render(<RankingsPanel kind="speed" snapshot={levelSnapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "冥古龙" } });
  expect(screen.queryByRole("button", { name: /在速度表选择冥古龙 · \d+级/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "在速度表选择冥古龙，速度170" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "特殊口径" }));
  for (const [level, max, positive] of [[99, 209, 241], [89, 199, 229], [79, 189, 217], [69, 179, 205]]) {
    expect(screen.getByRole("button", { name: `定位 冥古龙 · ${level}级` })).toBeInTheDocument();
    expect(screen.getByText(`满·特·${level}级`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${max}，${level}级` }));
    const detail = screen.getByRole("region", { name: "速度配置详情" });
    expect(detail).toHaveTextContent(`冥古龙 · ${level}级`);
    expect(within(detail).getByRole("button", { name: `极速 ${positive}，定位实速` })).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button", { name: "极速 205，定位实速" }));
  expect(screen.getByRole("checkbox", { name: "特殊口径" })).toBeChecked();
  expect(screen.getByRole("button", { name: "在速度表选择冥古龙 · 69级，速度205，69级" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "在速度表选择冥古龙 · 79级，速度217，79级" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
  const table = screen.getByRole("table", { name: "种族速度档位表" });
  expect(within(table).getAllByRole("button", { name: /查看冥古龙.*标准速度详情/ })).toHaveLength(1);
  fireEvent.click(within(table).getByRole("button", { name: "查看冥古龙标准速度详情" }));
  expect(within(screen.getByRole("region", { name: "速度配置详情" })).getAllByRole("button", { name: /定位实速/ })).toHaveLength(5);
});

test("冥古龙高等级零个体档随特殊开关显示，切换培养与重置不会漏档", () => {
  render(<RankingsPanel kind="speed" snapshot={levelSnapshot} onClose={vi.fn()} />);
  for (const [level, neutral, negative] of [[99, 164, 153], [89, 157, 146]]) {
    // 重置后回到默认极速，第二轮先重新打开零个体两档。
    for (const name of ["无修正·0个体", "减速·0个体"]) if (!screen.getByRole("checkbox", { name }).checked) fireEvent.click(screen.getByRole("checkbox", { name }));
    fireEvent.click(screen.getByRole("checkbox", { name: "特殊口径" }));
    expect(screen.getByRole("checkbox", { name: "无修正·0个体" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "减速·0个体" })).toBeChecked();
    expect(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${neutral}，${level}级` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${negative}，${level}级` }));
    const detail = screen.getByRole("region", { name: "速度配置详情" });
    expect(within(detail).getByRole("button", { name: `减速·0个体 ${negative}，定位实速` })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(detail).getByRole("button", { name: `无修正·0个体 ${neutral}，定位实速` }));
    expect(screen.getByRole("checkbox", { name: "无修正·0个体" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "减速·0个体" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "特殊口径" })).toBeChecked();
    expect(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${neutral}，${level}级` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
    expect(screen.getByRole("checkbox", { name: "特殊口径" })).not.toBeChecked();
  }
  expect(screen.queryByRole("button", { name: /在速度表选择冥古龙 · \d+级/ })).not.toBeInTheDocument();
  // 重置回到默认极速：只剩 60 级极速档，高等级档全部收起。
  expect(screen.getByRole("button", { name: /^在速度表选择冥古龙，速度\d+$/ })).toBeInTheDocument();
});

test("冥古龙四档耐久保留独立行及正确等级详情，切模板与搜索不串行", () => {
  render(<RankingsPanel kind="durability" snapshot={levelSnapshot} onClose={vi.fn()} />);
  for (const [level, hp] of [[99, 671], [89, 623], [79, 576], [69, 528]]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`冥古龙 · ${level}级`) }));
    const detail = screen.getByRole("region", { name: "榜单配置详情" });
    expect(detail).toHaveTextContent(`${level}级统一模板`);
    expect(detail).toHaveTextContent(`HP ${hp}`);
    expect(detail).toHaveTextContent(`对60级攻击方 · 等级特性承伤 ×${level < 80 ? 1.4 : 1}`);
    expect(within(detail).getByRole("columnheader", { name: "面板耐久" })).toBeInTheDocument();
    expect(within(detail).getByRole("columnheader", { name: "有效耐久" })).toBeInTheDocument();
    const physical = within(detail).getByRole("row", { name: /^物理耐久/ });
    const values = within(physical).getAllByRole("cell").map(cell => Number(cell.textContent.replaceAll(",", "")));
    expect(values[1]).toBe(Math.round(values[0] / (level < 80 ? 1.4 : 1)));
    fireEvent.click(within(detail).getByRole("button", { name: "返回榜单" }));
    const selectedRows = screen.getByRole("table", { name: "标准耐久完整榜" }).querySelectorAll('tbody tr[aria-current="true"]');
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0]).toHaveTextContent(`冥古龙 · ${level}级`);
  }
  fireEvent.click(screen.getByRole("button", { name: "筛选" }));
  expect(screen.getByText("含特殊等级面板及承伤；仅计注明的特性，不计天气和技能。")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("耐久榜模板"), { target: { value: "standard-neutral-v1" } });
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "69级" } });
  expect(within(screen.getByRole("table", { name: "标准耐久完整榜" })).getAllByRole("row")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /冥古龙 · 69级/ }));
  expect(screen.getByRole("region", { name: "榜单配置详情" })).toHaveTextContent("HP 457");
  fireEvent.click(screen.getByRole("button", { name: "返回榜单" }));
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "特殊配置" }));
  expect(screen.queryByRole("button", { name: /冥古龙 · \d+级/ })).not.toBeInTheDocument();
  expect(within(screen.getByRole("table", { name: "标准耐久完整榜" })).getAllByRole("row")).toHaveLength(2);
  expect(screen.getByRole("button", { name: /^冥古龙 水/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "特殊配置" }));
  expect(within(screen.getByRole("table", { name: "标准耐久完整榜" })).getAllByRole("row")).toHaveLength(6);
});

test("超能阿布关闭耐久特殊配置后只留60级，重置恢复全部档位", () => {
  const abuSnapshot = { ...levelSnapshot, spirits: [{ ...levelSnapshot.spirits[0],
    id: "super-abu", fullName: "超能阿布", types: ["龙"],
    previewIdentity: { catalogId: "s5-ranking-test", key: "super-abu", mechanicKey: "super-abu" },
  }] };
  render(<RankingsPanel kind="durability" snapshot={abuSnapshot} onClose={vi.fn()} />);
  expect(screen.getAllByRole("button", { name: /超能阿布/ })).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "筛选" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "特殊配置" }));
  expect(screen.queryByRole("button", { name: /超能阿布 · \d+级/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /超能阿布/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  expect(screen.getByRole("checkbox", { name: "特殊配置" })).toBeChecked();
  expect(screen.getAllByRole("button", { name: /超能阿布/ })).toHaveLength(5);
});

test("60级阿布详情展示原生承伤倍率，关闭特殊配置也不漏算", () => {
  const abuSnapshot = { ...snapshot, spirits: [{ ...snapshot.spirits[0],
    fullName: "阿布", types: ["龙"],
    previewIdentity: { catalogId: "s5-ranking-test", key: "abu", mechanicKey: "abu" },
  }] };
  render(<RankingsPanel kind="durability" snapshot={abuSnapshot} onClose={vi.fn()} />);
  for (const includeSpecial of [true, false]) {
    if (!includeSpecial) fireEvent.click(screen.getByRole("checkbox", { name: "特殊配置" }));
    fireEvent.click(screen.getByRole("button", { name: /^阿布 龙/ }));
    const detail = screen.getByRole("region", { name: "榜单配置详情" });
    expect(detail).toHaveTextContent("60级统一模板");
    expect(detail).toHaveTextContent("等级特性承伤 ×1.3");
    expect(within(detail).getByRole("columnheader", { name: "面板耐久" })).toBeInTheDocument();
    expect(within(detail).getByRole("columnheader", { name: "有效耐久" })).toBeInTheDocument();
    const physical = within(detail).getByRole("row", { name: /^物理耐久/ });
    const [panel, effective] = within(physical).getAllByRole("cell").map(cell => Number(cell.textContent.replaceAll(",", "")));
    expect(effective).toBe(Math.round(panel / 1.3));
    fireEvent.click(within(detail).getByRole("button", { name: "返回榜单" }));
    const highlighted = screen.getByRole("table", { name: "标准耐久完整榜" }).querySelector('tr[aria-current="true"]');
    expect(highlighted).toHaveTextContent(effective.toLocaleString("zh-CN"));
  }
});


const largeRankingSnapshot = { ...snapshot, spirits: Array.from({ length: 100 }, (_, index) => ({
  ...snapshot.spirits[0], id: `batch-${index}`, dexNo: index + 1, fullName: `批次${String(index).padStart(3, "0")}`,
  raceStats: { ...snapshot.spirits[0].raceStats, hp: 200 - index, physicalDefense: 200 - index, magicalDefense: 200 - index },
})) };

test("long durability rankings append on approach without repeatedly observing a visible sentinel", () => {
  const observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe = vi.fn();
    disconnect = vi.fn();
  });
  try {
    const { container } = render(<RankingsPanel kind="durability" snapshot={largeRankingSnapshot} onClose={vi.fn()} />);
    const table = screen.getByRole("table", { name: "标准耐久完整榜" });
    expect(table).toHaveAttribute("aria-rowcount", "101");
    expect(table.tBodies[0].rows).toHaveLength(36);
    expect(screen.getByRole("status")).toHaveTextContent("100只");
    expect(observers).toHaveLength(1);
    expect(observers[0].options.root).toBe(table.parentElement);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(table.tBodies[0].rows).toHaveLength(72);
    // Recreating an observer here would immediately append the next batch too.
    expect(observers).toHaveLength(1);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(table.tBodies[0].rows).toHaveLength(100);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(container.querySelector(".rank-load-more")).toBeNull();
    fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "批次099" } });
    expect(table.tBodies[0].rows).toHaveLength(1);
    expect(table.tBodies[0].rows[0]).toHaveTextContent("100批次099");
  } finally { vi.unstubAllGlobals(); }
});

test("keyboard-accessible durability batches keep scroll and filters when closed and reopened", async () => {
  const close = vi.fn();
  const { rerender } = render(<RankingsPanel kind="durability" snapshot={largeRankingSnapshot} onClose={close} />);
  const table = screen.getByRole("table", { name: "标准耐久完整榜" });
  fireEvent.click(screen.getByRole("button", { name: "显示更多 · 36 / 100" }));
  expect(table.tBodies[0].rows).toHaveLength(72);
  await waitFor(() => expect(within(table).getByRole("button", { name: /批次036/ })).toHaveFocus());
  table.parentElement.scrollTop = 750;
  rerender(<RankingsPanel kind={null} snapshot={largeRankingSnapshot} onClose={close} />);
  rerender(<RankingsPanel kind="durability" snapshot={largeRankingSnapshot} onClose={close} />);
  expect(table.tBodies[0].rows).toHaveLength(72);
  expect(table.parentElement.scrollTop).toBe(750);
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "批次099" } });
  fireEvent.click(screen.getByRole("button", { name: /批次099/ }));
  fireEvent.click(screen.getByRole("button", { name: "返回榜单" }));
  expect(table.querySelector('tr[aria-current="true"]')).toHaveTextContent("批次099");
  expect(screen.getByLabelText("搜索耐久榜精灵")).toHaveValue("批次099");
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "物理耐久", exact: true }));
  expect(table.querySelector('tr[aria-current="true"]')).toHaveTextContent("100批次099");
});


const portraitSnapshot = { ...snapshot, spirits: snapshot.spirits.map((spirit, index) => ({
  ...spirit, raceStats: { ...spirit.raceStats, speed: 100 - index * 10 },
  asset: { localUrl: `/assets/spirits/${spirit.id}.png` },
})) };

function mockPortraitObservers() {
  const observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  return observers;
}

test("actual speed portraits withhold offscreen sources through searches and target location", async () => {
  const observers = mockPortraitObservers();
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  try {
    render(<RankingsPanel kind="speed" snapshot={portraitSnapshot} onClose={vi.fn()} />);
    const table = screen.getByRole("table", { name: "速度档位表" });
    const observer = observers.find(item => item.options.root === table.parentElement);
    expect(observers).toHaveLength(1);
    expect(table.querySelector("img")).toBeNull();
    const water = within(table).getAllByRole("button", { name: /在速度表选择水测试/ })[0];
    expect(water.firstElementChild).toHaveClass("speed-portrait-placeholder");
    expect(water.firstElementChild).not.toHaveClass("spirit-image-fallback");
    expect(water.firstElementChild).toBeEmptyDOMElement();
    expect(water.firstElementChild).toHaveAttribute("aria-hidden", "true");
    act(() => observer.callback([{ target: water, isIntersecting: true }]));
    expect(water.querySelector("img")).toHaveAttribute("src", "/assets/spirits/water.png");
    expect(water.querySelector("img")).toHaveAttribute("loading", "eager");
    expect(water.querySelector(".spirit-image-fallback")).toHaveTextContent("水测试");
    fireEvent.load(water.querySelector("img"));
    expect(water.querySelector(".spirit-image-fallback")).toBeNull();
    for (const target of within(table).getAllByRole("button", { name: /在速度表选择草测试/ })) expect(target.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示精灵文字" }));
    fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "草测试" } });
    const grass = within(table).getAllByRole("button", { name: /在速度表选择草测试/ })[0];
    expect(grass.firstElementChild).toHaveClass("speed-portrait-placeholder");
    expect(grass.querySelector("img")).toBeNull();
    expect(observer.observe).toHaveBeenCalledWith(grass);
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "定位 草测试" }));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const located = scrollIntoView.mock.contexts.at(-1);
    expect(table).toContainElement(located);
    expect(located).toHaveAttribute("data-deferred-portrait", "/assets/spirits/grass.png");
    expect(located.querySelector("img")).toBeNull();
    act(() => observer.callback([{ target: located, isIntersecting: true }]));
    expect(located.querySelector("img")).toHaveAttribute("src", "/assets/spirits/grass.png");
    fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "龙测试" } });
    const dragon = within(table).getAllByRole("button", { name: /在速度表选择龙测试/ })[0];
    expect(observer.observe).toHaveBeenCalledWith(dragon);
    expect(dragon.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
    act(() => observer.callback([{ target: dragon, isIntersecting: true }]));
    expect(dragon.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "实速排行" }));
    act(() => observer.callback([{ target: dragon, isIntersecting: true }]));
    expect(dragon.querySelector("img")).toHaveAttribute("src", "/assets/spirits/dragon.png");
    expect(observers.filter(item => item.options.root === table.parentElement)).toHaveLength(1);
  } finally {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.unstubAllGlobals();
  }
});

test("base speed portraits withhold offscreen sources until the shared scroll observer sees them", () => {
  const observers = mockPortraitObservers();
  try {
    render(<RankingsPanel kind="speed" snapshot={portraitSnapshot} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
    const table = screen.getByRole("table", { name: "种族速度档位表" });
    const targets = [...table.querySelectorAll("[data-deferred-portrait]")];
    expect(targets).toHaveLength(3);
    expect(table.querySelector("img")).toBeNull();
    for (const target of targets) {
      expect(target.firstElementChild).toHaveStyle({ width: "64px", height: "64px" });
      expect(target.firstElementChild).toBeEmptyDOMElement();
      expect(target.querySelector(".spirit-image-fallback")).toBeNull();
    }
    expect(observers.filter(item => item.options.root === table.parentElement)).toHaveLength(1);
    const observer = observers.find(item => item.options.root === table.parentElement);
    expect(observer.options).toEqual({ root: table.parentElement, rootMargin: "256px 0px" });
    expect(observer.observe.mock.calls.map(([target]) => target)).toEqual(targets);
    act(() => observer.callback([{ target: targets[0], isIntersecting: false }]));
    expect(table.querySelector("img")).toBeNull();
    act(() => observer.callback([{ target: targets[0], isIntersecting: true }]));
    const image = targets[0].querySelector("img");
    expect(image).toHaveAttribute("src", "/assets/spirits/water.png");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("width", "64");
    expect(image).toHaveAttribute("height", "64");
    expect(targets[0].querySelector(".spirit-image-fallback")).toHaveTextContent("水测试");
    fireEvent.load(image);
    expect(targets[0].querySelector(".spirit-image-fallback")).toBeNull();
    expect(observer.unobserve).toHaveBeenCalledWith(targets[0]);
    expect(targets[1].querySelector("img")).toBeNull();
    fireEvent.scroll(table.parentElement, { target: { scrollTop: 500 } });
    act(() => observer.callback([{ target: targets[1], isIntersecting: true }]));
    expect(targets[1].querySelector("img")).toHaveAttribute("src", "/assets/spirits/grass.png");
    expect(targets[2].querySelector("img")).toBeNull();
    expect(observers.filter(item => item.options.root === table.parentElement)).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); }
});

test("base speed portrait observation follows searches, retained views and source changes, then cleans up", () => {
  const observers = mockPortraitObservers();
  try {
    const close = vi.fn();
    const { rerender, unmount } = render(<RankingsPanel kind="speed" snapshot={portraitSnapshot} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
    const table = screen.getByRole("table", { name: "种族速度档位表" });
    const observer = observers.find(item => item.options.root === table.parentElement);
    const water = within(table).getByRole("button", { name: "查看水测试标准速度详情" });
    const oldDragon = within(table).getByRole("button", { name: "查看龙测试标准速度详情" });
    act(() => observer.callback([{ target: water, isIntersecting: true }]));
    fireEvent.change(screen.getByLabelText("搜索种族总览"), { target: { value: "草测试" } });
    const grass = within(table).getByRole("button", { name: "查看草测试标准速度详情" });
    expect(observer.unobserve).toHaveBeenCalledWith(oldDragon);
    expect(observer.observe).toHaveBeenLastCalledWith(grass);
    expect(grass.querySelector("img")).toBeNull();
    act(() => observer.callback([{ target: oldDragon, isIntersecting: true }, { target: grass, isIntersecting: true }]));
    expect(grass.querySelector("img")).toHaveAttribute("src", "/assets/spirits/grass.png");
    fireEvent.change(screen.getByLabelText("搜索种族总览"), { target: { value: "" } });
    expect(within(table).getByRole("button", { name: "查看水测试标准速度详情" }).querySelector("img")).toHaveAttribute("src", "/assets/spirits/water.png");
    const dragon = within(table).getByRole("button", { name: "查看龙测试标准速度详情" });
    expect(dragon.querySelector("img")).toBeNull();
    expect(observer.observe).toHaveBeenCalledWith(dragon);
    rerender(<RankingsPanel kind={null} snapshot={portraitSnapshot} onClose={close} />);
    act(() => observer.callback([{ target: dragon, isIntersecting: true }]));
    expect(dragon.querySelector("img")).toBeNull();
    rerender(<RankingsPanel kind="speed" snapshot={portraitSnapshot} onClose={close} />);
    act(() => observer.callback([{ target: dragon, isIntersecting: true }]));
    expect(dragon.querySelector("img")).toHaveAttribute("src", "/assets/spirits/dragon.png");
    const updatedSnapshot = { ...portraitSnapshot, spirits: portraitSnapshot.spirits.map(spirit => spirit.id === "water" ? { ...spirit, asset: { localUrl: "/assets/spirits/water-new.png" } } : spirit) };
    rerender(<RankingsPanel kind="speed" snapshot={updatedSnapshot} onClose={close} />);
    const updatedWater = within(table).getByRole("button", { name: "查看水测试标准速度详情" });
    expect(updatedWater.querySelector("img")).toBeNull();
    expect(observer.observe).toHaveBeenLastCalledWith(updatedWater);
    expect(observers.filter(item => item.options.root === table.parentElement)).toHaveLength(1);
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(observer.unobserve).toHaveBeenCalledWith(updatedWater);
    const callsAfterCleanup = observer.unobserve.mock.calls.length;
    act(() => observer.callback([{ target: updatedWater, isIntersecting: true }]));
    expect(observer.unobserve).toHaveBeenCalledTimes(callsAfterCleanup);
  } finally { vi.unstubAllGlobals(); }
});

test("speed table portraits remain available without IntersectionObserver", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  try {
    render(<RankingsPanel kind="speed" snapshot={portraitSnapshot} onClose={vi.fn()} />);
    expect(screen.getByRole("table", { name: "速度档位表" }).querySelectorAll("img").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
    const table = screen.getByRole("table", { name: "种族速度档位表" });
    const images = table.querySelectorAll("img");
    expect(images).toHaveLength(3);
    expect(table.querySelector("[data-deferred-portrait]")).toBeNull();
    for (const image of images) {
      expect(image.getAttribute("src")).toMatch(/^\/assets\/spirits\//);
      expect(image).toHaveAttribute("loading", "lazy");
    }
  } finally { vi.unstubAllGlobals(); }
});

test("速度线排行默认只开极速，玩家改过的口径关闭重开后沿用，重置回到极速", () => {
  for (const key of SPEED_PROFILE_KEYS) localStorage.removeItem(key);
  const { unmount } = render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  const pills = within(screen.getByRole("group", { name: "速度口径" }));
  expect(pills.getByRole("checkbox", { name: "极速" })).toBeChecked();
  expect(pills.getByRole("checkbox", { name: "极速" })).toBeDisabled();
  expect(pills.getByRole("checkbox", { name: "满速" })).not.toBeChecked();
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })).toHaveLength(1);
  expect(screen.queryByText(/极 \/ 满 \/ 性/)).not.toBeInTheDocument();
  fireEvent.click(pills.getByRole("checkbox", { name: "满速" }));
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem(SPEED_PROFILE_KEYS[0]))).toEqual(["positive-max", "neutral-max"]);
  unmount();
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "满速" })).toBeChecked();
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  expect(screen.getByRole("checkbox", { name: "满速" })).not.toBeChecked();
  expect(JSON.parse(localStorage.getItem(SPEED_PROFILE_KEYS[0]))).toEqual(["positive-max"]);
});

test("损坏或未知的已存口径回到默认极速", () => {
  localStorage.setItem(SPEED_PROFILE_KEYS[0], JSON.stringify(["unknown"]));
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "极速" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "满速" })).not.toBeChecked();
});

test("视图切换在标题行，切换时收起详情", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  const heading = screen.getByRole("dialog").querySelector(".rank-dialog__heading");
  expect(within(heading).getByRole("group", { name: "速度榜视图" })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /在速度表选择水测试/ })[0]);
  expect(screen.getByRole("region", { name: "速度配置详情" })).toBeInTheDocument();
  fireEvent.click(within(heading).getByRole("button", { name: "按种族速查" }));
  fireEvent.click(within(heading).getByRole("button", { name: "实速排行" }));
  expect(screen.queryByRole("region", { name: "速度配置详情" })).toBeNull();
});
