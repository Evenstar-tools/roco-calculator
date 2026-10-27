import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ElementIcon } from "../../src/components/ElementIcon.jsx";
import { StatIcon } from "../../src/components/StatIcon.jsx";
import { SkillIcon } from "../../src/components/SkillIcon.jsx";
import { PresetBrowseProvider, usePresetBrowseMode, PRESET_BROWSE_STORAGE_KEY } from "../../src/components/PresetBrowseMode.jsx";

afterEach(() => {
  localStorage.removeItem(PRESET_BROWSE_STORAGE_KEY);
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules();
});

test("central icons use mounted paths for element, stat mask, skill and wish-power images", () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const { container } = render(<>
    <ElementIcon type="火" label />
    <StatIcon stat="physicalAttack" label />
    <StatIcon stat="physicalDefense" gain />
    <SkillIcon skill={{ id: "hit", name: "测试", iconUrl: "/assets/skills/skill_1234567890abcdef.png" }} label />
    <SkillIcon skill={{ id: "calculator_wish_power_fire", name: "心愿" }} label />
    <SkillIcon skill={{ id: "projected", name: "已投影", iconUrl: "/pre/assets/skills/skill_abcdef1234567890.png" }} label />
  </>);
  expect(screen.getByAltText("火")).toHaveAttribute("src", "/pre/assets/elements/fire.png");
  expect(screen.getByAltText("物攻")).toHaveAttribute("src", "/pre/assets/stats/physical-attack.png");
  expect(container.querySelector(".stat-icon--nature-gain").style.getPropertyValue("--stat-icon-url"))
    .toBe("url(/pre/assets/stats/physical-defense.png)");
  expect(screen.getByAltText("测试图标")).toHaveAttribute("src", "/pre/assets/skills/skill_1234567890abcdef.png");
  expect(screen.getByAltText("心愿图标")).toHaveAttribute("src", "/pre/assets/skills/wish-power/7700003.png");
  expect(screen.getByAltText("已投影图标")).toHaveAttribute("src", "/pre/assets/skills/skill_abcdef1234567890.png");
});

test("theme scene variables and character source both use mounted resources", async () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const { getSeasonTheme, getSeasonThemeVariables } = await import("../../src/theme/season-themes.js");
  expect(getSeasonTheme("s1").character.src).toBe("/pre/assets/season/s1-longxipaer.webp");
  expect(getSeasonThemeVariables("s5")["--season-scene-image"])
    .toBe('url("/pre/assets/season/s5-dragon-treasure.webp")');
});

function PresetSwitch() {
  const presets = usePresetBrowseMode();
  return <button onClick={() => presets.setEnabled(true)}>启用预设浏览</button>;
}

test("preset browsing fetch stays under the preview mount", async () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ entries: [] }) }));
  vi.stubGlobal("fetch", fetcher);
  render(<PresetBrowseProvider><PresetSwitch /></PresetBrowseProvider>);
  fireEvent.click(screen.getByRole("button", { name: "启用预设浏览" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/pre/data/presets/pvp-popular-configs.json", expect.objectContaining({ signal: expect.any(AbortSignal) })));
});


test("S5具名技能原图在pre挂载下可显示，加载失败仍回退属性图标", () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const { rerender } = render(<SkillIcon label skill={{ id: "skill_preview_s5_barren-devour", name: "荒芜之噬", type: "龙",
    iconUrl: "/assets/skills/skill_preview_s5_barren-devour.png" }} />);
  const icon = screen.getByAltText("荒芜之噬图标");
  expect(icon).toHaveAttribute("src", "/pre/assets/skills/skill_preview_s5_barren-devour.png");
  fireEvent.error(icon);
  expect(screen.getByAltText("龙")).toBeVisible();
  rerender(<SkillIcon label skill={{ name: "测试", type: "龙", iconUrl: "/assets/skills/../skill_preview_s5_bad.png" }} />);
  expect(screen.queryByAltText("测试图标")).not.toBeInTheDocument();
  expect(screen.getByAltText("龙")).toBeVisible();
});
