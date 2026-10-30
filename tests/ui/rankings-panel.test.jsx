import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";

const snapshot = { meta: {}, spirits: [["water", "水测试", ["水"]], ["grass", "草测试", ["草"]], ["dragon", "龙测试", ["水", "龙"]]].map(([id, fullName, types], dexNo) => ({ id, fullName, types, dexNo, stage: "首领", sourceCategory: "首领形态", raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 } })) };

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
  fireEvent.click(screen.getByRole("button", { name: "试查 267" }));
  expect(screen.getByRole("status")).toHaveTextContent("比 267 快 0 · 同速 0 · 慢 12 个配置");
  expect(screen.getByText("基准位置 · 没有同速配置")).toBeInTheDocument();
  expect(screen.queryByLabelText("速度搜索方式")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "100" } });
  expect(screen.getAllByRole("button", { name: /在速度表选择水测试/ })).toHaveLength(4);
  expect(screen.getByRole("button", { name: "显示精灵文字" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("table", { name: "速度档位表" })).queryByText("水测试")).not.toBeInTheDocument();
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

test("冥古龙四档速度各自展示、查看详情和定位，种族视图不合并等级", () => {
  render(<RankingsPanel kind="speed" snapshot={levelSnapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "冥古龙" } });
  for (const [level, max, positive] of [[99, 209, 241], [89, 199, 229], [79, 189, 217], [69, 179, 205]]) {
    expect(screen.getByRole("button", { name: `定位 冥古龙 · ${level}级` })).toBeInTheDocument();
    expect(screen.getByText(`满·${level}级`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${max}` }));
    const detail = screen.getByRole("region", { name: "速度配置详情" });
    expect(detail).toHaveTextContent(`冥古龙 · ${level}级`);
    expect(within(detail).getByRole("button", { name: `极速 ${positive}，定位实速` })).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button", { name: "极速 205，定位实速" }));
  expect(screen.getByRole("button", { name: "在速度表选择冥古龙 · 69级，速度205" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
  const table = screen.getByRole("table", { name: "种族速度档位表" });
  expect(within(table).getAllByRole("button", { name: /查看冥古龙.*标准速度详情/ })).toHaveLength(4);
  for (const level of [99, 89, 79, 69]) {
    fireEvent.click(within(table).getByRole("button", { name: `查看冥古龙 · ${level}级标准速度详情` }));
    expect(screen.getAllByRole("region", { name: "速度配置详情" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "速度配置详情" })).toHaveTextContent(`冥古龙 · ${level}级`);
  }
});

test("冥古龙99/89级零个体口径默认可见，详情定位与重置保持同一筛选", () => {
  render(<RankingsPanel kind="speed" snapshot={levelSnapshot} onClose={vi.fn()} />);
  for (const [level, neutral, negative] of [[99, 164, 153], [89, 157, 146]]) {
    expect(screen.getByRole("checkbox", { name: "无修正·0个体" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "减速·0个体" })).toBeChecked();
    expect(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${neutral}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `在速度表选择冥古龙 · ${level}级，速度${negative}` }));
    const detail = screen.getByRole("region", { name: "速度配置详情" });
    expect(within(detail).getByRole("button", { name: `减速·0个体 ${negative}，定位实速` })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(detail).getByRole("button", { name: `无修正·0个体 ${neutral}，定位实速` }));
    expect(screen.getByRole("checkbox", { name: "无修正·0个体" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "减速·0个体" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  }
  fireEvent.click(screen.getByRole("checkbox", { name: "减速·0个体" }));
  expect(screen.queryByRole("button", { name: "在速度表选择冥古龙 · 99级，速度153" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "在速度表选择冥古龙 · 99级，速度164" })).toBeInTheDocument();
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
  }
  fireEvent.click(screen.getByRole("button", { name: "筛选" }));
  expect(screen.getByText("含冥古龙等级面板及承伤；仅计注明的特性，不计天气和技能。")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("耐久榜模板"), { target: { value: "standard-neutral-v1" } });
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "69级" } });
  expect(within(screen.getByRole("table", { name: "标准耐久完整榜" })).getAllByRole("row")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /冥古龙 · 69级/ }));
  expect(screen.getByRole("region", { name: "榜单配置详情" })).toHaveTextContent("HP 457");
});
