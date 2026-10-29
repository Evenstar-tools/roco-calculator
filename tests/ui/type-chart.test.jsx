import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import snapshot from "../../public/data/global-runtime.json";
import { ELEMENT_TYPES, getTypeMultiplier } from "../../src/domain/type-chart.js";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { translateUi } from "../../src/i18n/messages.js";
import { localizeType } from "../../src/i18n/type-labels.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import TypeChartPanel from "../../src/features/type-query/TypeChartPanel.jsx";

afterEach(cleanup);

const chart = snapshot.typeChart;
const wrap = (locale, props = {}) => (
  <RuntimeProvider serverId="global" locale={locale}>
    <LocaleProvider locale={locale}>
      <TypeChartPanel typeChart={chart} onClose={vi.fn()} {...props} />
    </LocaleProvider>
  </RuntimeProvider>
);
const cell = (attack, defense) => screen.getAllByRole("gridcell")
  .find((node) => node.dataset.attack === attack && node.dataset.defense === defense);
const statusText = (locale, attack, defense, multiplier) => translateUi(
  locale, "{attack} → {defense}：{multiplier}×", {
    attack: localizeType(attack, locale), defense: localizeType(defense, locale), multiplier,
  },
);

test("国际服18系矩阵逐格使用当前快照和计算核心，不补造免疫或宝可梦关系", () => {
  render(wrap("zh-CN"));
  const grid = screen.getByRole("grid", { name: "18 系克制图" });
  const cells = within(grid).getAllByRole("gridcell");
  expect(cells).toHaveLength(324);
  expect(new Set(cells.map((node) => `${node.dataset.attack}/${node.dataset.defense}`)).size).toBe(324);
  for (const type of ELEMENT_TYPES) {
    expect(within(grid).getByRole("columnheader", { name: type, exact: true })).toBeVisible();
    expect(within(grid).getByRole("rowheader", { name: type, exact: true })).toBeVisible();
  }
  for (const node of cells) {
    expect(node.tagName).toBe("TD");
    expect(ELEMENT_TYPES).toContain(node.dataset.attack);
    expect(ELEMENT_TYPES).toContain(node.dataset.defense);
    expect(node.textContent).toBe(`${getTypeMultiplier(node.dataset.attack, [node.dataset.defense], chart)}×`);
  }
  expect(cells.some((node) => node.textContent === "0×")).toBe(false);
  expect(cell("普通", "幽")).toHaveTextContent(/^0\.5×$/);
  expect(cell("幽", "普通")).toHaveTextContent(/^0\.5×$/);
  expect(cell("地", "翼")).toHaveTextContent(/^1×$/);
  expect(screen.getByRole("status")).not.toHaveTextContent("普通 → 普通：1×");
});

test("传入矩阵调整后显示真实新倍率，包括零，不回退内置表", () => {
  const changed = structuredClone(chart);
  changed.matrix[changed.types.indexOf("火")][changed.types.indexOf("草")] = 0;
  const { rerender } = render(wrap("zh-CN"));
  fireEvent.click(cell("火", "草"));
  expect(screen.getByRole("status")).toHaveTextContent(statusText("zh-CN", "火", "草", 2));
  rerender(wrap("zh-CN", { typeChart: changed }));
  expect(cell("火", "草")).toHaveTextContent(/^0×$/);
  expect(cell("草", "火")).toHaveTextContent(/^0\.5×$/);
  expect(screen.getByRole("status")).toHaveTextContent(statusText("zh-CN", "火", "草", 0));
});

const invalidCharts = [
  ["未载入", () => undefined],
  ["空矩阵", () => ({ types: [], matrix: [] })],
  ["缺少攻击行", () => ({ ...chart, matrix: chart.matrix.slice(1) })],
  ["缺少防守格", () => ({ ...chart, matrix: chart.matrix.map((row, index) => index ? row : row.slice(1)) })],
  ["重复属性", () => ({ ...chart, types: chart.types.map((type, index) => index === 1 ? chart.types[0] : type) })],
  ["未知属性", () => ({ ...chart, types: chart.types.map((type, index) => index ? type : "不存在") })],
  ...[NaN, Infinity, -1, "2"].map((value) => [`非法倍率 ${String(value)} (${typeof value})`, () => {
    const invalid = structuredClone(chart);
    invalid.matrix[0][0] = value;
    return invalid;
  }]),
];

test.each(invalidCharts)("%s时不展示误导的常规倍率表", (_, makeChart) => {
  render(wrap("zh-CN", { typeChart: makeChart() }));
  expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
  expect(screen.getByText("国际服属性关系待核验，暂不可查询。")).toBeVisible();
  expect(screen.getByRole("button", { name: "关闭克制图" })).toBeEnabled();
});

test("英日属性名、点击和焦点反馈完整本地化，换语言保留选中关系", () => {
  const { rerender } = render(wrap("en"));
  const grid = screen.getByRole("grid", { name: translateUi("en", "18 系克制图") });
  for (const type of ELEMENT_TYPES) {
    expect(within(grid).getByRole("columnheader", { name: localizeType(type, "en"), exact: true })).toBeVisible();
    expect(within(grid).getByRole("rowheader", { name: localizeType(type, "en"), exact: true })).toBeVisible();
  }
  fireEvent.click(cell("火", "草"));
  expect(screen.getByRole("status")).toHaveTextContent(statusText("en", "火", "草", 2));
  expect(screen.getByRole("dialog").textContent).not.toMatch(/[\u3400-\u9fff]/u);

  rerender(wrap("ja"));
  const japaneseGrid = screen.getByRole("grid", { name: translateUi("ja", "18 系克制图") });
  for (const type of ELEMENT_TYPES) {
    expect(within(japaneseGrid).getByRole("columnheader", { name: localizeType(type, "ja"), exact: true })).toBeVisible();
    expect(within(japaneseGrid).getByRole("rowheader", { name: localizeType(type, "ja"), exact: true })).toBeVisible();
  }
  expect(cell("火", "草")).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("status")).toHaveTextContent(statusText("ja", "火", "草", 2));
  act(() => cell("幽", "普通").focus());
  expect(screen.getByRole("status")).toHaveTextContent(statusText("ja", "幽", "普通", 0.5));
  expect(cell("幽", "普通")).toHaveAttribute("data-attack", "幽");
  expect(cell("幽", "普通")).toHaveAttribute("data-defense", "普通");
});

test("矩阵仅一个Tab入口，方向/Home/End按行列移动，Ctrl跳首尾且边界不越界", () => {
  render(wrap("en"));
  const types = chart.types;
  const last = types.length - 1;
  const expectActive = (row, column) => {
    const active = cell(types[row], types[column]);
    expect(active).toHaveFocus();
    expect(active).toHaveAttribute("tabindex", "0");
    expect(screen.getAllByRole("gridcell").filter((node) => node.tabIndex === 0)).toEqual([active]);
    expect(screen.getByRole("status")).toHaveTextContent(statusText(
      "en", types[row], types[column], getTypeMultiplier(types[row], [types[column]], chart),
    ));
  };
  expect(screen.getAllByRole("gridcell").filter((node) => node.tabIndex === 0)).toEqual([cell(types[0], types[0])]);
  act(() => cell(types[0], types[0]).focus());
  expectActive(0, 0);
  for (const [key, row, column, ctrlKey = false] of [
    ["ArrowRight", 0, 1], ["ArrowDown", 1, 1], ["End", 1, last],
    ["Home", 1, 0], ["ArrowUp", 0, 0], ["ArrowLeft", 0, 0],
    ["End", last, last, true], ["ArrowRight", last, last], ["ArrowDown", last, last],
    ["Home", 0, 0, true],
  ]) {
    fireEvent.keyDown(document.activeElement, { key, ctrlKey });
    expectActive(row, column);
  }
});

test.each(["en", "ja"])("%s关闭按钮和Escape可用，退出恢复滚动与工具触发焦点", (locale) => {
  const onClose = vi.fn();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "auto";
  let unmount;
  try {
    ({ unmount } = render(wrap(locale, { onClose })));
    expect(document.body.style.overflow).toBe("hidden");
    act(() => cell("火", "草").focus());
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: translateUi(locale, "关闭克制图"), exact: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    expect(trigger).toHaveFocus();
  } finally {
    unmount?.();
    trigger.remove();
    document.body.style.overflow = overflow;
  }
});
