import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const runtime = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const names = ["音速犬", "水灵", "迪莫", "伊兰亚龙", "火神", "白发路路"];
const members = names.map(name => {
  const spirit = runtime.spirits.find(entry => entry.fullName === name);
  if (!spirit) throw new Error(`Missing fixture: ${name}`);
  return { spiritId: spirit.id, natureId: "neutral", skills: { four: [null, null, null, null], single: null }, displayIvs: { hp: 60, physicalAttack: 0, physicalDefense: 60, magicalAttack: 0, magicalDefense: 60, speed: 0 } };
});
const output = "artifacts/web-roster-clip-fix-20260918";
mkdirSync(output, { recursive: true });
test.use({ serviceWorkers: "block" });

async function openAbility(page, width, theme, selectedMembers = members) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(value => {
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
    localStorage.setItem("rock-calculator.teams.v1", JSON.stringify({ schemaVersion: 1, activeTeamId: "roster-clip-regression", teams: [{ id: "roster-clip-regression", name: "成员栏验收", createdAt: "2026-09-18", updatedAt: "2026-09-18", members: value }] }));
  }, selectedMembers);
  await page.goto("/");
  await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).waitFor();
  if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: "切换主题", exact: true }).click();
  await page.getByRole("button", { name: "打开队伍", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "队伍", exact: true });
  await drawer.getByRole("button", { name: "能力分析", exact: true }).click();
  await expect(drawer).toHaveAttribute("data-compact-roster", "true");
  await page.evaluate(() => { document.querySelector(".team-drawer__editor-pane").scrollTop = 0; });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  return drawer;
}

async function inspect(roster) {
  return roster.evaluate(node => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const contained = (inner, outer) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1;
    return {
      viewportWidth: innerWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      roster: rect(node),
      cards: [...node.querySelectorAll(".team-slot")].map(card => {
        const button = card.querySelector(".team-slot__select");
        const cardBox = rect(card), buttonBox = rect(button);
        const children = [...button.querySelectorAll("img, .team-slot__empty, .team-slot__number, .team-slot__identity strong")].filter(child => child.getClientRects().length).map(child => {
          const childBox = rect(child);
          let ancestor = child.parentElement, fits = contained(childBox, cardBox);
          while (ancestor && ancestor !== document.body) {
            const style = getComputedStyle(ancestor), box = rect(ancestor);
            if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (childBox.x < box.x - 1 || childBox.right > box.right + 1)) fits = false;
            if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (childBox.y < box.y - 1 || childBox.bottom > box.bottom + 1)) fits = false;
            ancestor = ancestor.parentElement;
          }
          return { tag: child.tagName, className: child.className, fits, loaded: child.tagName !== "IMG" || (child.complete && child.naturalWidth > 0), box: childBox };
        });
        return { title: button.title, card: cardBox, button: buttonBox, gridColumns: getComputedStyle(card).gridTemplateColumns, children };
      }),
    };
  });
}

for (const width of [320, 390, 700, 1424]) {
  for (const theme of ["light", "dark"]) {
    test(`member card content is not clipped ${width} ${theme}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const drawer = await openAbility(page, width, theme);
      const roster = drawer.getByRole("list", { name: "队伍成员" });
      await expect(roster.locator(".team-slot")).toHaveCount(6);
      const geometry = await inspect(roster);
      expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
      for (const card of geometry.cards) {
        expect(card.children.every(child => child.fits && child.loaded), JSON.stringify(card)).toBe(true);
        if (width <= 1023) {
          expect(card.card.width).toBeGreaterThanOrEqual(44);
          expect(card.button.height).toBeGreaterThanOrEqual(44);
          expect(card.button.width).toBeGreaterThanOrEqual(card.card.width - 3);
          expect(card.gridColumns).toBe("none");
        }
      }
      if (width <= 1023) expect(new Set(geometry.cards.map(card => Math.round(card.card.y))).size).toBe(Math.ceil(6 / Math.min(6, Math.floor((geometry.roster.width + 4) / 96))));
      await page.screenshot({ path: `${output}/actual-${width}-${theme}.png`, animations: "disabled" });
      await drawer.locator(".team-drawer__roster-pane").screenshot({ path: `${output}/roster-${width}-${theme}.png`, animations: "disabled" });
      writeFileSync(`${output}/geometry-${width}-${theme}.json`, JSON.stringify(geometry, null, 2));
      const savedBefore = await page.evaluate(() => localStorage.getItem("rock-calculator.teams.v1"));
      for (let index = 0; index < names.length; index += 1) {
        await roster.getByRole("button", { name: `编辑${names[index]}`, exact: true }).click();
        await expect(drawer.locator(".team-workbench__identity h3")).toHaveText(`${index + 1}号位 · ${names[index]}`);
        await expect(roster.getByRole("button", { name: `编辑${names[index]}`, exact: true })).toHaveAttribute("aria-pressed", "true");
      }
      expect(await page.evaluate(() => localStorage.getItem("rock-calculator.teams.v1"))).toBe(savedBefore);
      if (width <= 1023) {
        await drawer.locator(".team-roster__current-actions > summary").click();
        await expect(drawer.locator(".team-roster__current-actions").getByRole("button", { name: "白发路路设为攻击方", exact: true })).toBeVisible();
        await drawer.locator(".team-roster__current-actions > summary").click();
      }
      await drawer.getByRole("button", { name: "成员配置", exact: true }).click();
      await expect(drawer).toHaveAttribute("data-compact-roster", "false");
      await expect(roster).not.toHaveClass(/team-roster--compact/);
      expect(errors).toEqual([]);
    });
  }
}

test("empty slot number and long names fit at 320px without losing selection", async ({ page }) => {
  const longest = runtime.spirits.filter(spirit => spirit.asset?.localUrl).reduce((best, spirit) => spirit.fullName.length > best.fullName.length ? spirit : best);
  const list = [members[0], { ...members[1], spiritId: longest.id }, null, null, null, null];
  const drawer = await openAbility(page, 320, "dark", list);
  const roster = drawer.getByRole("list", { name: "队伍成员" });
  const geometry = await inspect(roster);
  for (const card of geometry.cards) expect(card.children.every(child => child.fits && child.loaded), JSON.stringify(card)).toBe(true);
  await expect(roster.getByRole("button", { name: `编辑${longest.fullName}`, exact: true })).toHaveAttribute("title", `2号位 · ${longest.fullName}`);
  await roster.getByRole("button", { name: "编辑空位 6", exact: true }).click();
  await expect(drawer.locator(".team-workbench__identity h3")).toHaveText("6号位 · 待选择精灵");
  await drawer.locator(".team-roster__current-actions > summary").click();
  await expect(drawer.locator(".team-roster__current-actions").getByRole("button", { name: "空位 6设为攻击方", exact: true })).toBeDisabled();
  await page.screenshot({ path: `${output}/actual-320-empty-longname.png`, animations: "disabled" });
});
