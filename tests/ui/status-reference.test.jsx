import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AdvancedOptions } from "../../src/components/AdvancedOptions.jsx";
import { MARK_DEFINITIONS } from "../../src/domain/marks.js";

beforeEach(() => {
  // jsdom 不实现原生模态框；键盘与背景隔离另用浏览器验收。
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => {
  delete HTMLDialogElement.prototype.showModal;
  delete HTMLDialogElement.prototype.close;
});

function setup(negativeStatusEnabled = true) {
  const onMarkChange = vi.fn();
  const onNegativeStatusChange = vi.fn();
  render(<AdvancedOptions open negativeStatusEnabled={negativeStatusEnabled}
    negativeStatuses={{ defender: { poison: 3 } }} marks={{ attacker: { positive: { id: "momentum", stacks: 2 } } }}
    finalMultiplier={1} reductionPercent={0} onMarkChange={onMarkChange} onNegativeStatusChange={onNegativeStatusChange} />);
  return { user: userEvent.setup(), onMarkChange, onNegativeStatusChange };
}

test("龙噬触发输入与加减独立于层数，换印记清除次数", async () => {
  function Harness() {
    const [marks, setMarks] = useState({ attacker: { positive: { id: "dragon-bite", stacks: 1, triggerCount: 0 } } });
    return <AdvancedOptions open marks={marks} finalMultiplier={1} reductionPercent={0}
      onMarkChange={(side, polarity, value) => setMarks({ ...marks, [side]: { ...marks[side], [polarity]: value } })} />;
  }
  const user = userEvent.setup();
  render(<Harness />);
  const count = screen.getByRole("spinbutton", { name: "进攻方龙噬触发次数" });
  expect(count).toHaveValue(0);
  await user.click(screen.getByRole("button", { name: "进攻方增加龙噬触发次数" }));
  expect(count).toHaveValue(1);
  expect(screen.getByText("双攻 +40%")).toBeVisible();
  fireEvent.change(count, { target: { value: "3" } });
  expect(screen.getByText("双攻 +120%")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "进攻方减少龙噬触发次数" }));
  expect(count).toHaveValue(2);
  const stacks = screen.getByRole("spinbutton", { name: "进攻方龙噬层数" });
  fireEvent.change(stacks, { target: { value: "2" } });
  expect(count).toHaveValue(2);
  fireEvent.change(stacks, { target: { value: "0" } });
  expect(count).toBeDisabled();
  expect(screen.getByText("双攻 +0%")).toBeVisible();
  const select = screen.getByRole("combobox", { name: "进攻方正面印记" });
  await user.selectOptions(select, "wet");
  expect(screen.queryByRole("spinbutton", { name: "进攻方龙噬触发次数" })).toBeNull();
  await user.selectOptions(select, "dragon-bite");
  expect(screen.getByRole("spinbutton", { name: "进攻方龙噬触发次数" })).toHaveValue(0);
});

test("印记问号打开说明、切换搜索和关闭均不修改配置；全部印记可查", async () => {
  const { user, onMarkChange, onNegativeStatusChange } = setup();
  const trigger = screen.getByRole("button", { name: "查看进攻方印记说明" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "异常与印记" });
  within(dialog).getByRole("button", { name: "关闭说明" }).focus();
  await user.tab({ shift: true });
  expect(within(dialog).getByRole("searchbox")).toHaveFocus();
  await user.tab();
  expect(within(dialog).getByRole("button", { name: "关闭说明" })).toHaveFocus();
  expect(within(dialog).getByRole("button", { name: "负面印记" })).toHaveAttribute("aria-pressed", "true");
  for (const polarity of ["negative", "positive"]) {
    await user.click(within(dialog).getByRole("button", { name: polarity === "negative" ? "负面印记" : "正面印记" }));
    for (const mark of MARK_DEFINITIONS[polarity]) expect(within(dialog).getByText(mark.id === "poison" ? "中毒印记" : mark.name, { exact: true })).toBeVisible();
  }
  await user.type(within(dialog).getByRole("searchbox"), "龙噬");
  expect(within(dialog).getByText("触发计数")).toBeVisible();
  expect(within(dialog).queryByText("蓄势", { exact: true })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "关闭说明" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  expect(screen.getByRole("spinbutton", { name: "进攻方蓄势层数" })).toHaveValue(2);
  expect(screen.getByRole("spinbutton", { name: "防御方中毒层数" })).toHaveValue(3);
  expect(onMarkChange).not.toHaveBeenCalled();
  expect(onNegativeStatusChange).not.toHaveBeenCalled();
  expect(document.body.style.overflow).not.toBe("hidden");
});

test("萌芽使用萌系图标，不误用草系图标", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "查看进攻方印记说明" }));
  const dialog = screen.getByRole("dialog", { name: "异常与印记" });
  await user.click(within(dialog).getByRole("button", { name: "正面印记" }));
  const row = within(dialog).getByText("萌芽", { exact: true }).closest("article");
  expect(row.querySelector("img")).toHaveAttribute("src", "/assets/elements/cute.png");
  expect(row.querySelector('img[src="/assets/elements/grass.png"]')).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "关闭说明" }));
});

test("异常问号定位持续异常；取消和遮罩关闭恢复焦点，重新打开重置分组和搜索", async () => {
  const { user } = setup();
  const trigger = screen.getByRole("button", { name: "查看负面状态说明" });
  await user.click(trigger);
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "持续异常" })).toHaveAttribute("aria-pressed", "true");
  expect(within(dialog).getByText("寄生", { exact: true })).toBeVisible();
  await user.type(within(dialog).getByRole("searchbox"), "不存在");
  expect(within(dialog).getByRole("status")).toHaveTextContent("未找到对应条目");
  fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "查看防御方印记说明" }));
  dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("searchbox")).toHaveValue("");
  expect(within(dialog).getByRole("button", { name: "负面印记" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(dialog);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("未开启异常结算时不新增异常配置；印记说明仍可打开", () => {
  setup(false);
  expect(screen.queryByRole("button", { name: "查看负面状态说明" })).toBeNull();
  expect(screen.getAllByRole("button", { name: /查看.+印记说明/ })).toHaveLength(2);
});
