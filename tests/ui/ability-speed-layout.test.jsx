import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";

const snapshot = {
  meta: { id: "speed-layout" }, skills: [], learnsets: [],
  spirits: [120, 90].map((speed, i) => ({
    id: `speed-${i}`, fullName: i ? "对比精灵" : "当前精灵", stage: "首领", sourceCategory: "首领形态",
    raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed },
  })),
};
const configuration = {
  spiritId: "speed-0", natureId: "neutral", skills: { four: [], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
};
function open(config = configuration) {
  const apply = vi.fn();
  const view = render(<AbilityWorkbench configuration={config} snapshot={snapshot} source={{ kind: "member", index: 0 }} onApplyMember={apply} />);
  return { ...view, apply };
}

test("速度轴常显；微调默认收起，展开和收起不会应用草稿", () => {
  const { apply } = open();
  const rail = screen.getByRole("region", { name: "速度排行榜横轴" });
  const manual = screen.getByText("手动微调").closest("details");
  expect(rail).toBeVisible();
  expect(rail.closest("details")).toBeNull();
  expect(manual).not.toHaveAttribute("open");
  expect(manual).toHaveTextContent("普通 · 生命 60 / 物防 60 / 魔防 60");
  fireEvent.click(screen.getByText("手动微调"));
  expect(manual).toHaveAttribute("open");
  expect(screen.getByLabelText("能力分析性格")).toBeVisible();
  fireEvent.change(screen.getByLabelText("能力分析性格"), { target: { value: "silent" } });
  fireEvent.click(screen.getByText("手动微调"));
  expect(manual).not.toHaveAttribute("open");
  expect(manual).toHaveTextContent("沉默");
  expect(apply).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("草稿未应用");
});

test.each([
  ["当前精灵", 192, "无速度", "equal", "同速需拼速"],
  ["当前精灵", 260, "极速", "slower", "无法先手"],
  ["对比精灵", 159, "无速度", "faster", "可以先手"],
])("当前速度与 %s %s 的比较语义准确", (name, speed, profile, relation, text) => {
  open();
  const input = screen.getByRole("combobox", { name: "速度目标精灵" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByRole("option", { name: `选择${name} ${speed} ${profile}`, exact: true }));
  const status = document.querySelector(".ability-speed__comparison");
  expect(status).toHaveAttribute("data-relation", relation);
  expect(status).toHaveTextContent(`当前 192 / 目标 ${speed} · ${text}`);
  expect(screen.getByRole("button", { name: /速度一览/ })).toHaveTextContent("同优先度，仅比较速度");
});

test("非法历史分配自动展开微调，保留修正入口", () => {
  open({ ...configuration, displayIvs: { ...configuration.displayIvs, speed: 30 } });
  expect(screen.getByText("手动微调").closest("details")).toHaveAttribute("open");
  expect(screen.getByRole("alert")).toHaveTextContent("历史配置不符合个体值分配规则");
  expect(screen.getByLabelText("能力分析性格")).toBeVisible();
});

test("速度轴拖动后首次键盘激活不被吞掉，拖动产生的鼠标点击仍被拦截", () => {
  open();
  const rail = screen.getByRole("region", { name: "速度排行榜横轴" });
  const target = within(rail).getByRole("listitem", { name: "选择速度目标当前精灵，速度260", exact: true });
  const drag = () => {
    fireEvent(rail, new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, clientX: 120 }));
    fireEvent(rail, new MouseEvent("pointermove", { bubbles: true, buttons: 1, clientX: 200 }));
    fireEvent(rail, new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 200 }));
  };
  drag();
  fireEvent.click(target, { detail: 1 });
  expect(target).not.toHaveAttribute("aria-current", "true");
  drag();
  fireEvent.click(target, { detail: 0 });
  expect(target).toHaveAttribute("aria-current", "true");
});

test("屏幕变化重新定位速度标记，卸载清理观察器", () => {
  let resize;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const scrollTo = vi.fn();
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  HTMLElement.prototype.scrollTo = scrollTo;
  try {
    const { unmount } = open();
    const rail = screen.getByRole("region", { name: "速度排行榜横轴" });
    expect(observe).toHaveBeenCalledWith(rail);
    const current = within(rail).getByText("当前配置").parentElement;
    const target = rail.querySelector('[aria-current="true"]');
    Object.defineProperty(rail, "clientWidth", { configurable: true, value: 390 });
    Object.defineProperty(current, "offsetLeft", { configurable: true, value: 600 });
    Object.defineProperty(current, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(target, "offsetLeft", { configurable: true, value: 700 });
    Object.defineProperty(target, "offsetWidth", { configurable: true, value: 100 });
    resize();
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "smooth", left: 505 });
    unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally {
    HTMLElement.prototype.scrollTo = originalScrollTo;
    vi.unstubAllGlobals();
  }
});
