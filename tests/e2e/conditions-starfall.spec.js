import { expect, test } from "@playwright/test";
import { resetUiuxStorage, selectSpirit, setViewMode } from "./helpers/uiux-helpers.js";

async function selectSkill(page, name, index = 1) {
  const input = page.getByRole("combobox", { name: `攻击方技能${index}`, exact: true });
  await input.fill(name);
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
}

async function configureCounter(page) {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectSpirit(page, "攻击方", "烈火战神");
  await selectSpirit(page, "防御方", "玳塔");
  await selectSkill(page, "暗突袭");
  return page.locator(".compact-skill-side--attacker .compact-skill__damage").first();
}

test("compact conditions preserve edits across detailed mode, undo and reload", async ({ page }) => {
  const damage = await configureCounter(page);
  const initial = Number(await damage.innerText());
  const trigger = page.getByRole("button", { name: "攻击方技能1条件", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const counter = dialog.getByRole("checkbox", { name: /触发应对/ });
  await expect(counter).not.toBeChecked();
  await counter.check();
  await expect.poll(async () => Number(await damage.innerText())).toBeGreaterThan(initial);
  const boosted = Number(await damage.innerText());
  await page.keyboard.press("Tab");
  await expect(page.locator(".app-header--compact")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await setViewMode(page, "具体版");
  await expect(page.getByRole("checkbox", { name: /攻击方技能1触发应对/ })).toBeChecked();
  await setViewMode(page, "精简版");
  await expect(damage).toHaveText(String(boosted));
  await page.getByRole("button", { name: /撤回上一步/ }).click();
  await expect(damage).toHaveText(String(initial));
  await trigger.click();
  await dialog.getByRole("checkbox", { name: /触发应对/ }).check();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(damage).toHaveText(String(boosted));
  await trigger.click();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: /触发应对/ })).toBeChecked();
});

test("compact conditions keep trait and skill starfall inputs on the same target", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectSpirit(page, "攻击方", "祭礼巨像");
  await selectSpirit(page, "防御方", "玳塔");
  await selectSkill(page, "多维击打");
  const skillTrigger = page.getByRole("button", { name: "攻击方技能1条件", exact: true });
  await skillTrigger.click();
  const dialog = page.getByRole("dialog");
  const skillStacks = dialog.getByRole("spinbutton", { name: "敌方星陨印记", exact: true });
  await skillStacks.fill("3");
  await skillStacks.press("Tab");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "攻击方特性条件", exact: true }).click();
  const traitStacks = dialog.getByRole("spinbutton", { name: "敌方星陨层数", exact: true });
  await expect(traitStacks).toHaveValue("3");
  await traitStacks.fill("5");
  await traitStacks.press("Tab");
  await page.keyboard.press("Escape");
  await skillTrigger.click();
  await expect(skillStacks).toHaveValue("5");
});

test("compact conditions keep numeric trait controls readable in a narrow viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const damage = await configureCounter(page);
  const initial = Number(await damage.innerText());
  await page.getByRole("button", { name: "攻击方特性条件", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const uses = dialog.getByRole("spinbutton", { name: "火系技能使用次数", exact: true });
  await uses.fill("1");
  await uses.press("Tab");
  await expect.poll(async () => Number(await damage.innerText())).toBeGreaterThan(initial);
  const labels = await dialog.locator("label").evaluateAll((nodes) => nodes.map((node) => ({
    readable: Number.parseFloat(getComputedStyle(node).fontSize) >= 14,
    fits: node.scrollWidth <= node.clientWidth,
  })));
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(({ readable, fits }) => readable && fits)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("compact-trait-390-light.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "攻击方特性条件", exact: true })).toContainText("1");
});

for (const [width, height, theme] of [[1920, 1080, "light"], [390, 844, "light"], [320, 740, "dark"]]) {
  test(`compact conditions keep inputs and damage readable ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await configureCounter(page);
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const trigger = page.getByRole("button", { name: "攻击方技能1条件", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: /触发应对/ })).toBeVisible();
    const bounds = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { fits: node.scrollWidth <= node.clientWidth,
        inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        documentFits: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(bounds).toEqual({ fits: true, inViewport: true, documentFits: true });
    await page.screenshot({ path: testInfo.outputPath(`compact-${width}-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
