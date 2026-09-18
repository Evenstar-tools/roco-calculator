import { expect } from "@playwright/test";

export async function waitForAppReady(page) {
  await expect(page.locator(".loading-state")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "工具箱", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "工具箱", exact: true })).toBeEnabled();
}

export async function resetUiuxStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-storage-initialized")) return;
    localStorage.removeItem("rock-calculator.spirit-configs.v1");
    localStorage.removeItem("rock-calculator.spirit-configs.v2");
    localStorage.removeItem("rock-calculator.favorites.v1");
    localStorage.removeItem("rock-calculator.teams.v1");
    localStorage.removeItem("rock-calculator.settings.type-coverage.v1");
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
    sessionStorage.setItem("e2e-storage-initialized", "1");
  });
}

export async function selectSpirit(page, side, name) {
  const picker = page.getByRole("combobox", { name: `${side}精灵` });
  await picker.fill(name);
  await page
    .getByRole("option", { name: new RegExp(`^${name}`) })
    .click();
}

export async function selectDefaultSpirits(page) {
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "水灵");
}

export async function openDetailedMode(page) {
  await setViewMode(page, "具体版");
  await page.getByRole("tab", { name: "单技能" }).click();
}

export async function setViewMode(page, name) {
  await waitForAppReady(page);
  await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).waitFor();
  const group = page.getByRole("group", { name: "界面模式" });
  const toggle = group.getByRole("button", { name: /^当前/ });
  if (await toggle.count()) {
    if (!(await toggle.getAttribute("aria-label")).startsWith(`当前${name}`)) await toggle.click();
  } else {
    await group.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.locator(`.app-header--${name === "具体版" ? "detailed" : "compact"}`)).toBeVisible();
}

export async function inspectDetailedSkillMenu(page, side, slot) {
  const picker = page.getByRole("combobox", {
    name: `${side}技能${slot}`,
  });
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  const options = picker.locator("xpath=..").locator(".skill-picker__options");
  await expect(options).toBeVisible();

  const layout = await options.evaluate((node) => {
    const menu = node.getBoundingClientRect();
    const picker = node.parentElement.getBoundingClientRect();
    const clippingAncestors = [];
    let ancestor = node.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = ["auto", "clip", "hidden", "scroll"].includes(
        style.overflowX,
      );
      const clipsY = ["auto", "clip", "hidden", "scroll"].includes(
        style.overflowY,
      );
      if (clipsX || clipsY) {
        const box = ancestor.getBoundingClientRect();
        if (
          (clipsX && (menu.left < box.left - 1 || menu.right > box.right + 1)) ||
          (clipsY && (menu.top < box.top - 1 || menu.bottom > box.bottom + 1))
        ) {
          clippingAncestors.push(ancestor.className || ancestor.tagName);
        }
      }
      ancestor = ancestor.parentElement;
    }

    const name = node.querySelector(".skill-picker__option-name strong");
    const text = name?.textContent?.slice(0, 4) ?? "";
    const style = name ? getComputedStyle(name) : null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (style) {
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    }

    return {
      clippingAncestors,
      menuBottom: menu.bottom,
      menuTop: menu.top,
      nameWidth: name?.getBoundingClientRect().width ?? 0,
      placement: node.dataset.placement,
      pickerBottom: picker.bottom,
      pickerTop: picker.top,
      requiredNameWidth: context.measureText(text).width,
      viewportHeight: window.innerHeight,
    };
  });

  await page.keyboard.press("Escape");
  return layout;
}
