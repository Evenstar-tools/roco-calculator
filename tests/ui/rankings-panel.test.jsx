import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";

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

test("无结果时隐藏速度轴，关闭后耐久榜不继承全屏", () => {
  const { rerender } = render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: "不存在的精灵" } });
  expect(screen.queryByRole("slider")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "全屏展示" }));
  rerender(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  expect(screen.getByRole("dialog").parentElement).not.toHaveClass("is-expanded");
  expect(screen.queryByRole("button", { name: "全屏展示" })).toBeNull();
});

test("速度详情展示五档口径，零个体定位和重置沿用一致筛选", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "无修正·0个体" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "减速·0个体" })).toBeChecked();
  fireEvent.click(screen.getAllByRole("button", { name: /在速度表选择水测试/ })[0]);
  const detail = within(screen.getByRole("region", { name: "速度配置详情" }));
  for (const label of ["减速·0个体", "无修正·0个体", "仅速度性格", "满速", "极速"]) {
    expect(detail.getByRole("button", { name: new RegExp(`^${label} .*定位实速$`) })).toBeInTheDocument();
  }
  fireEvent.click(detail.getByRole("button", { name: /^无修正·0个体 .*定位实速$/ }));
  expect(screen.getByRole("checkbox", { name: "无修正·0个体" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "减速·0个体" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "重置", exact: true }));
  expect(screen.getByRole("checkbox", { name: "减速·0个体" })).toBeChecked();
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
