import { expect, test } from "@playwright/test";
import { selectSpirit } from "./helpers/uiux-helpers.js";
import { CURRENT_USER_RELEASE } from "../../src/data/user-release-notes.js";

const currentHeading = new RegExp(`洛克计算器 · ${CURRENT_USER_RELEASE.seasonId}`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
  });
});

test("works offline after the service worker caches the production app", async ({
  context,
  page,
}) => {
  await page.goto("/");

  const serviceWorkerReady = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    return Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
    ]);
  });
  expect(serviceWorkerReady).toBe(true);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: currentHeading })).toBeVisible();
    const cachedRuntime = await page.evaluate(async () => {
      const response = await fetch("/data/runtime.json");
      const runtime = await response.json();
      return {
        ok: response.ok,
        skillCount: runtime.skills?.length ?? 0,
        spiritCount: runtime.spirits?.length ?? 0,
      };
    });
    expect(cachedRuntime.ok).toBe(true);
    expect(cachedRuntime.spiritCount).toBeGreaterThan(0);
    expect(cachedRuntime.skillCount).toBeGreaterThan(0);
  } finally {
    await context.setOffline(false);
  }
});

test("stays within cold warm and skill search budgets", async ({ page }) => {
  const coldStartedAt = Date.now();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: currentHeading })).toBeVisible();
  expect(Date.now() - coldStartedAt).toBeLessThan(10_000);

  const warmStartedAt = Date.now();
  await page.reload();
  await expect(page.getByRole("region", { name: "精灵配置" })).toBeVisible();
  expect(Date.now() - warmStartedAt).toBeLessThan(5_000);

  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "水灵");
  const searchableSkill = await page.evaluate(async () => {
    const runtime = await fetch("/data/runtime.json").then((response) => response.json());
    const spirit = runtime.spirits.find((entry) => entry.fullName === "音速犬");
    const learnset = runtime.learnsets.find((entry) => entry.spiritId === spirit.id);
    const first = learnset.skillIds[0];
    return (runtime.s5CompactRelations ? runtime.skills[first] : runtime.skills.find((entry) => entry.id === first)).name;
  });
  const skillPicker = page.getByRole("combobox", { name: "攻击方技能1" });
  const searchStartedAt = Date.now();
  await skillPicker.fill(searchableSkill.slice(0, 2));
  await expect(
    page.locator(`.skill-picker__option-name > strong:text-is(${JSON.stringify(searchableSkill)})`),
  ).toBeVisible();
  expect(Date.now() - searchStartedAt).toBeLessThan(1_500);
});
