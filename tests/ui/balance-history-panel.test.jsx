import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import BalanceHistoryPanel from "../../src/features/balance-history/BalanceHistoryPanel.jsx";
import * as historyIndex from "../../src/features/balance-history/history-index.js";

const s4 = { id: "s4-2026-09-10", seasonId: "S4", label: "S4 月涌狂想", date: "2026.09.10", sourceUrl: "https://example.com/s4" };
const s5 = { id: "s5-2026-10-31", seasonId: "S5", label: "S5 圣龙宝藏", date: "2026.10.31", displayDate: "2026.11.05", sourceUrl: "urn:local:history" };
const hp = { kind: "stat", field: "hp", label: "生命", before: 122, after: 132 };
const power = { kind: "stat", field: "basePower", label: "四维降解·威力", before: 100, after: 110 };
function fixture() {
  return { meta: { serverId: "cn" }, spirits: [
    { id: "flower", fullName: "花衣蝶", dexNo: "101", aliases: ["蝴蝶"], changeInfo: { patch: s5, items: [{ ...hp, before: 132, after: 135 }], history: [
      { patch: s4, items: [hp, power, { kind: "learnset", label: "新增可学习技能", after: "振翅" }, { kind: "trait", label: "花精灵", before: "旧特性", after: "新特性" }] },
    ] } },
    { id: "forest", fullName: "森巨人", dexNo: "386", changeInfo: { patch: s5, items: [{ ...hp, before: 144, after: 164 }] } },
    { id: "quiet", fullName: "静静", dexNo: "999" },
  ], skills: [{ id: "power", name: "四维降解", changeInfo: { patch: s4, items: [{ ...power, label: "威力" }] } }] };
}
function Harness({ snapshot = fixture() }) {
  const [open, setOpen] = useState(true);
  return <><button type="button" onClick={() => setOpen(true)}>打开回顾</button><BalanceHistoryPanel snapshot={snapshot} open={open} onClose={() => setOpen(false)} /></>;
}

function familyFixture() {
  const shared = { kind: "trait", label: "家族特性", before: "原效果", after: "新效果" };
  return { meta: { serverId: "cn" }, spirits: [
    { id: "bud", fullName: "喵喵", dexNo: "002", evolutionChainIds: ["bud", "cat", "leaf"], changeInfo: { patch: s4, items: [shared, power] } },
    { id: "cat", fullName: "魔力猫", dexNo: "004", aliases: ["猫王"], pinyin: "molimao", initials: "mlm", changeInfo: { patch: s4, items: [shared, power, hp] } },
    { id: "leaf", fullName: "叶冕魔力猫", dexNo: "004", changeInfo: { patch: s4, items: [shared] } },
    { id: "unrelated", fullName: "独立精灵", dexNo: "004", changeInfo: { patch: s4, items: [shared] } },
  ], skills: [] };
}

test("家族只列一行，共同、部分成员和单独调整保留明确适用范围", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={familyFixture()} open onClose={vi.fn()} />);
  expect(document.querySelectorAll(".bh-entity")).toHaveLength(2);
  expect(screen.getByRole("button", { name: /喵喵家族.*3 位成员.*1 次调整$/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /独立精灵/ })).toBeVisible();
  const all = screen.getByRole("region", { name: "喵喵、魔力猫、叶冕魔力猫的调整" });
  expect(within(all).getByText("家族共同调整")).toBeVisible();
  expect(within(all).getByText("家族特性")).toBeVisible();
  const partial = screen.getByRole("region", { name: "喵喵、魔力猫的调整" });
  expect(within(partial).getByText("共同调整")).toBeVisible();
  expect(within(partial).getByRole("region", { name: "技能调整" })).toHaveTextContent("四维降解·威力100 → 110+10");
  const individual = screen.getByRole("region", { name: "魔力猫的调整" });
  expect(within(individual).getByText("仅魔力猫")).toBeVisible();
  expect(within(individual).getByRole("region", { name: "种族值" })).toHaveTextContent("生命122 → 132+10");
  expect(screen.getAllByText("四维降解·威力")).toHaveLength(1);
  expect(screen.getAllByText("家族特性")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "种族值", exact: true }));
  expect(screen.queryByText("家族共同调整")).not.toBeInTheDocument();
  expect(screen.getByText("仅魔力猫")).toBeVisible();
});

test("成员搜索定位家族，跳到更新概览后返回恢复筛选和滚动", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={familyFixture()} open onClose={vi.fn()} />);
  const search = screen.getByRole("textbox", { name: "名称、别名或图鉴号" });
  await user.type(search, "猫王");
  expect(document.querySelectorAll(".bh-entity")).toHaveLength(1);
  expect(screen.getByText("匹配：魔力猫")).toBeVisible();
  expect(screen.getByRole("heading", { name: /喵喵家族/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "技能调整", exact: true }));
  document.querySelector(".bh-scroll").scrollTop = 93;
  await user.click(screen.getByRole("button", { name: "查看本次全部调整" }));
  expect(screen.getByRole("textbox", { name: "在本次更新中查找精灵" })).toHaveValue("");
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  expect(document.querySelector(".bh-overview")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "返回按精灵回查" }));
  expect(screen.getByRole("textbox", { name: "名称、别名或图鉴号" })).toHaveValue("猫王");
  expect(screen.getByRole("button", { name: "技能调整", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(93);
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  await user.type(screen.getByRole("textbox", { name: "在本次更新中查找精灵" }), "猫王");
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "查看魔力猫历次调整" }));
  expect(screen.getByRole("heading", { name: /喵喵家族/ })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "名称、别名或图鉴号" })).toHaveValue("魔力猫");
  expect(screen.getByRole("region", { name: "魔力猫的调整" })).toHaveTextContent("仅魔力猫");
});

test("更新默认只列去重后的具体内容，数值直显，长文本折叠后可展开", async () => {
  const user = userEvent.setup();
  const snapshot = familyFixture();
  const long = { kind: "mechanic", field: "description", label: "薄纱环·技能效果",
    before: "选择时获得一种随机印记。".repeat(12), after: "选择时敌方获得随机负面印记，自己获得随机正面印记。".repeat(12) };
  snapshot.spirits[0].changeInfo.items.push(long);
  snapshot.spirits[1].changeInfo.items.push({ ...long });
  render(<BalanceHistoryPanel snapshot={snapshot} open onClose={vi.fn()} />);
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  const overview = document.querySelector(".bh-overview");
  expect(overview).toBeVisible();
  expect(document.querySelectorAll(".bh-owner-head, .bh-entity")).toHaveLength(0);
  expect(within(overview).getAllByText("家族特性")).toHaveLength(1);
  expect(within(overview).getAllByText("四维降解·威力")).toHaveLength(1);
  expect(within(overview).getByText("100 → 110")).toBeVisible();
  expect(within(overview).getByText("122 → 132")).toBeVisible();
  const details = within(overview).getByText("薄纱环·技能效果").closest("details");
  expect(details).not.toBeNull();
  const text = details.querySelectorAll(".bh-before-after p")[1];
  expect(text).toHaveTextContent(`调整后${long.after}`, { normalizeWhitespace: false });
  expect(details).not.toHaveAttribute("open");
  expect(text).not.toBeVisible();
  await user.click(details.querySelector("summary"));
  expect(details).toHaveAttribute("open");
  expect(text).toBeVisible();
});

test("概览行写明涉及哪只精灵：少量直接列名，多只展开可见名单", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={familyFixture()} open onClose={vi.fn()} />);
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  const overview = document.querySelector(".bh-overview");
  const hpRow = within(overview).getByText("122 → 132").closest(".bh-overview-metric");
  expect(hpRow).toHaveTextContent("魔力猫生命");
  expect(hpRow).not.toHaveTextContent("只精灵");
  expect(within(overview).getByText("四维降解·威力").closest(".bh-overview-metric")).toHaveTextContent("喵喵魔力猫四维降解·威力");
  const shared = within(overview).getByText("家族特性").closest("details");
  expect(shared.querySelector("summary")).toHaveTextContent("4 只精灵");
  const list = shared.querySelector(".bh-owner-list");
  expect(list).not.toBeVisible();
  await user.click(shared.querySelector("summary"));
  expect(list).toBeVisible();
  expect(list).toHaveTextContent("涉及 4 只精灵喵喵、魔力猫、叶冕魔力猫、独立精灵");
});

test("改前改后只标出差异，家族用基础形态命名，标题已含赛季时不重复标签", async () => {
  const user = userEvent.setup();
  const snapshot = familyFixture();
  snapshot.spirits[0] = { ...snapshot.spirits[0], fullName: "喵喵（春天的样子）", baseName: "喵喵", variantName: "春天的样子" };
  snapshot.spirits.splice(1, 0, { id: "plain", fullName: "喵喵", baseName: "喵喵", dexNo: "002", evolutionChainIds: ["bud"] });
  snapshot.spirits[1].changeInfo = { patch: s4, items: [{ kind: "trait", label: "特性·鼓气", before: "使用技能后获得攻防+20%。", after: "使用技能后获得双攻+30%。" }] };
  render(<BalanceHistoryPanel snapshot={snapshot} open onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: /^喵喵家族/ })).toBeVisible();
  expect(screen.queryByText(/喵喵（春天的样子）家族/)).not.toBeInTheDocument();
  expect(document.querySelector(".bh-season-tag")).toBeNull();
  const detail = screen.getByText("特性·鼓气").closest(".bh-detail");
  expect([...detail.querySelectorAll("mark.is-removed")].map(mark => mark.textContent)).toEqual(["防+20%"]);
  expect([...detail.querySelectorAll("mark.is-added")].map(mark => mark.textContent)).toEqual(["双", "+30%"]);
  expect(detail.querySelectorAll(".bh-before-after p")[0]).toHaveTextContent("调整前使用技能后获得攻防+20%。");
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  expect(screen.getByRole("heading", { name: "S4 月涌狂想" })).toBeVisible();
});

test("更新搜索仅返回实际成员，类型筛选不借用兄弟改动，清空恢复概览", async () => {
  const user = userEvent.setup();
  const snapshot = familyFixture();
  snapshot.spirits.push({ id: "quiet", fullName: "静静", evolutionChainIds: ["bud"] },
    { id: "later", fullName: "后续精灵", changeInfo: { patch: s5, items: [hp] } });
  render(<BalanceHistoryPanel snapshot={snapshot} open onClose={vi.fn()} />);
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  await user.click(screen.getByRole("button", { name: /2026.09.10.*S4 月涌狂想/ }));
  const search = screen.getByRole("textbox", { name: "在本次更新中查找精灵" });
  await user.type(search, "喵喵");
  expect(document.querySelector(".bh-overview")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /喵喵.*收起/ })).toBeVisible();
  expect(screen.getByText("四维降解·威力")).toBeVisible();
  expect(screen.queryByText("122 → 132")).not.toBeInTheDocument();
  expect(screen.queryByText("仅魔力猫")).not.toBeInTheDocument();
  await user.click(within(screen.getByRole("group", { name: "调整类型" })).getByRole("button", { name: "种族值", exact: true }));
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  expect(screen.getByRole("status")).toHaveTextContent("本次更新没有符合条件的精灵调整记录");
  await user.click(within(screen.getByRole("group", { name: "调整类型" })).getByRole("button", { name: "全部", exact: true }));
  expect(screen.getByText("四维降解·威力")).toBeVisible();
  for (const query of ["静静", "后续精灵", "不存在"]) {
    await user.clear(search);
    await user.type(search, query);
    expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("本次更新没有符合条件的精灵调整记录");
    expect(screen.queryByText("四维降解·威力")).not.toBeInTheDocument();
  }
  await user.click(screen.getByRole("button", { name: "清空在本次更新中查找精灵" }));
  expect(document.querySelector(".bh-overview")).toBeVisible();
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  expect(within(document.querySelector(".bh-overview")).getAllByText("四维降解·威力")).toHaveLength(1);
});

test("四维降解的威力归技能段，精灵六维、学习面与特性分别展示和筛选", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog");
  const stats = within(panel).getAllByRole("region", { name: "种族值" });
  expect(stats).toHaveLength(2);
  for (const region of stats) expect(region).not.toHaveTextContent("四维降解");
  expect(within(panel).getByRole("region", { name: "技能调整" })).toHaveTextContent("四维降解·威力100 → 110+10");
  expect(within(panel).getByRole("region", { name: "学习面调整" })).toHaveTextContent("振翅");
  expect(within(panel).getByRole("region", { name: "特性调整" })).toHaveTextContent("旧特性");
  await user.click(within(panel).getByRole("button", { name: "种族值", exact: true }));
  expect(within(panel).queryByRole("region", { name: "技能调整" })).not.toBeInTheDocument();
  expect(within(panel).getByText("122 → 132")).toBeVisible();
  await user.click(within(panel).getByRole("button", { name: "技能调整", exact: true }));
  expect(within(panel).queryByRole("region", { name: "种族值" })).not.toBeInTheDocument();
  expect(within(panel).getByText("四维降解·威力")).toBeVisible();
});

test("搜索支持别名与无历史实体，未命中时清空旧详情，清除后可恢复", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  const search = screen.getByRole("textbox", { name: "名称、别名或图鉴号" });
  await user.type(search, "蝴蝶");
  expect(screen.getByRole("heading", { name: /花衣蝶/ })).toBeVisible();
  await user.clear(search);
  await user.type(search, "静静");
  expect(screen.getByRole("status")).toHaveTextContent("尚未收录静静的平衡调整记录");
  await user.clear(search);
  await user.type(search, "不存在");
  expect(screen.getByRole("status")).toHaveTextContent("没有匹配的精灵");
  expect(screen.queryByRole("heading", { name: /静静|花衣蝶/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "清空名称、别名或图鉴号" }));
  expect(screen.getByRole("heading", { name: /花衣蝶/ })).toBeVisible();
});

test("互跳定位同一批次和精灵，返回恢复之前筛选与滚动位置", async () => {
  const user = userEvent.setup();
  const { container } = render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  const search = screen.getByRole("textbox", { name: "名称、别名或图鉴号" });
  await user.type(search, "蝴蝶");
  await user.selectOptions(screen.getByRole("combobox", { name: "筛选赛季" }), "S4");
  const scroll = document.querySelector(".bh-scroll");
  scroll.scrollTop = 127;
  await user.click(screen.getByRole("button", { name: "查看本次全部调整" }));
  expect(screen.getByRole("tab", { name: "按更新浏览" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "S4 月涌狂想" })).toBeVisible();
  expect(document.querySelector(".bh-overview")).toBeVisible();
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "返回按精灵回查" }));
  expect(screen.getByRole("combobox", { name: "筛选赛季" })).toHaveValue("S4");
  expect(screen.getByRole("textbox", { name: "名称、别名或图鉴号" })).toHaveValue("蝴蝶");
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(127);
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  await user.type(screen.getByRole("textbox", { name: "在本次更新中查找精灵" }), "花衣蝶");
  await user.click(screen.getByRole("button", { name: "查看花衣蝶历次调整" }));
  expect(screen.getByRole("tab", { name: "按精灵回查" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: /花衣蝶/ })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "名称、别名或图鉴号" })).toHaveValue("花衣蝶");
  expect(container).toBeEmptyDOMElement();
});

test("按更新的技能搜索使用技能名，保留独立技能身份和安全来源", async () => {
  const user = userEvent.setup();
  const snapshot = fixture();
  snapshot.skills.push({ id: "second-power", name: "另一技能", changeInfo: { patch: s4, items: [{ ...power, label: "威力" }] } });
  const original = structuredClone(snapshot);
  render(<BalanceHistoryPanel snapshot={snapshot} open onClose={vi.fn()} />);
  expect(screen.getByText("资料展示日期 · 历史记录日期 2026.10.31")).toBeVisible();
  expect(screen.getByRole("link", { name: "资料来源" })).toHaveAttribute("href", "https://example.com/s4");
  expect(screen.getByText("资料来源未提供在线链接")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  await user.click(screen.getByRole("button", { name: /2026.09.10.*S4 月涌狂想/ }));
  await user.click(screen.getByRole("button", { name: "种族值", exact: true }));
  await user.click(within(screen.getByRole("group", { name: "更新对象" })).getByRole("button", { name: "技能", exact: true }));
  const search = screen.getByRole("textbox", { name: "在本次更新中查找技能" });
  expect(document.querySelector(".bh-overview")).toBeVisible();
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  expect(screen.queryByRole("group", { name: "调整类型" })).not.toBeInTheDocument();
  expect(within(document.querySelector(".bh-overview")).getByText("四维降解·威力")).toBeVisible();
  expect(within(document.querySelector(".bh-overview")).getByText("另一技能·威力")).toBeVisible();
  expect(document.querySelectorAll(".bh-overview-metric")).toHaveLength(2);
  await user.type(search, "四维降解");
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(1);
  expect(document.querySelector(".bh-overview")).not.toBeInTheDocument();
  expect(screen.getByText("四维降解·威力")).toBeVisible();
  expect(screen.queryByText("另一技能·威力")).not.toBeInTheDocument();
  await user.clear(search);
  await user.type(search, "不存在");
  expect(screen.getByRole("status")).toHaveTextContent("本次更新没有符合条件的技能调整记录");
  expect(screen.queryByText("四维降解·威力")).not.toBeInTheDocument();
  await user.clear(search);
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  expect(within(document.querySelector(".bh-overview")).getByText("四维降解·威力")).toBeVisible();
  expect(within(document.querySelector(".bh-overview")).getByText("另一技能·威力")).toBeVisible();
  expect(snapshot).toEqual(original);
});

test("初次关闭不构造索引，Esc关闭再打开保留筛选及滚动", async () => {
  const user = userEvent.setup();
  const snapshot = fixture();
  const getIndex = vi.spyOn(historyIndex, "getBalanceHistoryIndex");
  const unopened = render(<BalanceHistoryPanel snapshot={snapshot} open={false} onClose={vi.fn()} />);
  expect(getIndex).not.toHaveBeenCalled();
  unopened.unmount();
  render(<Harness snapshot={snapshot} />);
  await user.selectOptions(screen.getByRole("combobox", { name: "筛选赛季" }), "S4");
  const scroll = document.querySelector(".bh-scroll");
  scroll.scrollTop = 93;
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe("hidden");
  await user.click(screen.getByRole("button", { name: "打开回顾" }));
  expect(screen.getByRole("combobox", { name: "筛选赛季" })).toHaveValue("S4");
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(93);
  expect(getIndex).toHaveBeenCalledTimes(1);
  getIndex.mockRestore();
});

test("候选与批次概览分批渲染，搜索能命中首批外的实际精灵", async () => {
  const user = userEvent.setup();
  const snapshot = { meta: { serverId: "cn" }, skills: [], spirits: Array.from({ length: 70 }, (_, index) => ({
    id: `extra-${index}`, fullName: `候补${index}`, dexNo: `${1000 + index}`,
    changeInfo: { patch: s4, items: [{ ...hp, label: `候补${index}·生命` }] },
  })) };
  render(<BalanceHistoryPanel snapshot={snapshot} open onClose={vi.fn()} />);
  expect(document.querySelectorAll(".bh-entity")).toHaveLength(24);
  document.querySelector(".bh-side").scrollTop = 82;
  document.querySelector(".bh-scroll").scrollTop = 64;
  await user.click(screen.getByRole("button", { name: "显示更多精灵" }));
  expect(document.querySelectorAll(".bh-entity")).toHaveLength(48);
  expect(document.querySelector(".bh-side").scrollTop).toBe(82);
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(64);
  fireEvent.change(screen.getByRole("textbox", { name: "名称、别名或图鉴号" }), { target: { value: "候补69" } });
  expect(screen.getByRole("heading", { name: /候补69/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查看本次全部调整" }));
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(0);
  expect(within(document.querySelector(".bh-overview")).getAllByText(/^候补\d+·生命$/)).toHaveLength(24);
  document.querySelector(".bh-scroll").scrollTop = 145;
  await user.click(screen.getByRole("button", { name: /显示更多调整/ }));
  expect(within(document.querySelector(".bh-overview")).getAllByText(/^候补\d+·生命$/)).toHaveLength(48);
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(145);
  fireEvent.change(screen.getByRole("textbox", { name: "在本次更新中查找精灵" }), { target: { value: "候补68" } });
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^候补68.*收起$/ })).toHaveAttribute("aria-expanded", "true");
});
