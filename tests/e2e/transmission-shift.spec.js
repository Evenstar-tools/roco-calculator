import { expect, test } from "@playwright/test";

test("轮班暗第10回合：额外层合入回合传动，撤回重算一致", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rock-calculator.first-run-guide.v1", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  await page.getByRole("button", { name: "传动计算器", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "传动计算器", exact: true });
  await panel.getByLabel("推演精灵", { exact: true }).fill("帕帕斯卡");
  await panel.getByRole("option", { name: /^帕帕斯卡/ }).click();
  for (const [index, name] of ["钢铁洪流", "轮班", "加固", "传感器"].entries()) {
    await panel.getByLabel(`初始${index + 1}号位技能`, { exact: true }).fill(name);
    await panel.getByRole("option").filter({ hasText: name }).click();
  }
  const order = panel.getByRole("list", { name: "当前技能槽位" }).locator("strong");
  const action = panel.getByLabel("本回合行动", { exact: true });
  const next = panel.getByRole("button", { name: "推演下一回合", exact: true });
  const settled = (round) => expect(panel.getByRole("heading", { name: `第 ${round} 回合 · 传动后顺序`, exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "开始", exact: true }).click();
  await settled(1);
  await expect(order).toHaveText(["传感器", "轮班", "加固", "钢铁洪流"]);
  await action.selectOption({ label: "轮班 · 额外传动" });
  for (let round = 2; round <= 9; round += 1) {
    await next.click();
    await settled(round);
  }
  await expect(order).toHaveText(["传感器", "加固", "轮班", "钢铁洪流"]);
  await action.selectOption({ label: "轮班 · 额外传动" });
  await next.click();
  await settled(10);
  await expect(order).toHaveText(["轮班", "钢铁洪流", "传感器", "加固"]);
  await panel.getByRole("button", { name: "回到上回合", exact: true }).click();
  await settled(9);
  await expect(action).toHaveValue("2:drive");
  await expect(order).toHaveText(["传感器", "加固", "轮班", "钢铁洪流"]);
  await next.click();
  await settled(10);
  await expect(order).toHaveText(["轮班", "钢铁洪流", "传感器", "加固"]);
});
