import { expect, test } from "@playwright/test";

test.describe("Global preset updates", () => {
  test.use({ serviceWorkers: "block" });
  for (const locale of ["en", "ja"]) {
    test(`${locale} filters missing Jinies, previews imports and stays silent after refresh`, async ({ page, request }) => {
      const path = "/global-assets/data/global/presets/pvp-popular-configs.json";
      const library = await (await request.get(path)).json();
      const snapshot = await (await request.get("/global-assets/data/global-runtime.json")).json();
      const knownSpirits = new Set(snapshot.spirits.map((spirit) => spirit.id));
      const knownSkills = new Set(snapshot.skills.map((skill) => skill.id));
      expect(library.entries.length).toBeGreaterThan(0);
      for (const entry of library.entries) {
        expect(knownSpirits.has(entry.spiritId)).toBe(true);
        expect(entry.skills.every((id) => knownSkills.has(id))).toBe(true);
      }
      // A stale or malformed resource must not promote an unsupported Jini.
      const unknownId = "cn-placeholder:spirit_future_s5_not_in_global";
      const withUnknown = { ...library, entries: [...library.entries, { ...library.entries[0], spiritId: unknownId }] };
      await page.route(`**${path}`, (route) => route.fulfill({ json: withUnknown }));
      await page.setViewportSize(locale === "en" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
      await page.goto(locale === "en" ? "/en/" : "/jp/");
      const notice = page.locator(".preset-update-notice");
      await expect(notice).toContainText(locale === "en"
        ? `Recommended setups: ${library.entries.length} to import`
        : `おすすめ設定を読み込めます（${library.entries.length}件）`);
      await notice.getByRole("button", { name: locale === "en" ? "View" : "表示", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: locale === "en" ? "Popular Jini setups" : "よく使われる設定", exact: true });
      await expect(dialog).toBeVisible();
      const importButton = dialog.getByRole("button", { name: locale === "en"
        ? `Import setups (${library.entries.length})` : `設定を読み込む（${library.entries.length}）`, exact: true });
      await expect(importButton).toBeEnabled();
      await importButton.click();
      await expect(dialog).not.toBeVisible();
      const configs = () => page.evaluate(() => {
        const key = Object.keys(localStorage).find((name) => name.includes("servers.global.") && name.endsWith("spirit-configs.v2"));
        return key ? JSON.parse(localStorage.getItem(key)).configs : {};
      });
      await expect.poll(async () => Object.keys(await configs()).length).toBe(library.entries.length);
      expect(Object.hasOwn(await configs(), unknownId)).toBe(false);
      const checked = page.waitForResponse((response) => response.url().endsWith(path));
      await page.reload();
      await checked;
      await expect(page.getByRole("combobox", { name: locale === "en" ? "Attacker Jini" : "攻撃側のジニ", exact: true })).toBeVisible();
      await expect(notice).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
