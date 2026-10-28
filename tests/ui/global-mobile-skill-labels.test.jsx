import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { translateCalculatorText } from "../../src/i18n/calculator-text.js";
import { translateUi } from "../../src/i18n/messages.js";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { BurstSourceControls } from "../../src/components/SingleSkillEditor.jsx";
import { WorkspaceOverlays } from "../../src/components/WorkspaceOverlays.jsx";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import snapshot from "../../data/snapshots/global/s3-midseason.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("mobile CSS labels switch from Chinese to English and Japanese without resetting the current skill draft", () => {
  vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const skill = snapshot.skills.find(entry => entry.category === "physical");
  const burst = snapshot.skills.find(entry => entry.name === "雷暴");
  const onSelect = vi.fn();
  const selected = [skill, null, null, null];
  const content = <>
    <FourSkillEditor attackerName="Dimo" attackerSkills={selected} defenderName="Meodow" defenderSkills={selected} skills={[skill]} onSkillSelect={onSelect} />
    <BurstSourceControls inputs={getSkillEffectInputs(burst)} />
    <WorkspaceOverlays menu={{}} share={{}} team={{}} toast={{}} mobileResult={{ configurationReady: true, viewMode: "four", result: { attackerName: "Dimo", defenderName: "Meodow", selectedSkillName: skill.name, selectedResult: { status: "exact", totalDamage: 24, hpPercent: 10 } } }} />
  </>;
  const wrap = locale => <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{content}</LocaleProvider></RuntimeProvider>;
  const { container, rerender } = render(wrap("zh-CN"));
  const power = container.querySelector(".four-skill-side--attacker .skill-slot__power-input input");
  fireEvent.change(power, { target: { value: "123" } });
  for (const locale of ["zh-CN", "en", "ja"]) {
    rerender(wrap(locale));
    const side = container.querySelector(".four-skill-side--attacker");
    for (const [kind, source] of [["kind", "属性"], ["cost", "耗"], ["power", "威力"], ["hits", "连击"]]) {
      expect(side.style.getPropertyValue(`--skill-row-${kind}-label`)).toBe(JSON.stringify(translateCalculatorText(source, locale)));
    }
    expect(container.querySelector(".burst-source-controls__menu")).toHaveAttribute("data-hint", translateUi(locale, "悬停或聚焦选项查看效果。"));
    expect(container.querySelector(".mobile-result-bar__percent")).toHaveAttribute("data-last-valid", translateUi(locale, "上次有效结果"));
    expect(container.querySelector(".four-skill-side--attacker .skill-slot__power-input input")).toBe(power);
    expect(power).toHaveValue(123);
  }
  expect(onSelect).not.toHaveBeenCalled();
  // Pseudo-elements must consume the locale-bound values in both responsive layouts.
  const mobileCss = readFileSync("src/styles/13-responsive-mobile.css", "utf8");
  for (const kind of ["kind", "cost", "power", "hits"]) expect(mobileCss).toContain(`content: var(--skill-row-${kind}-label)`);
  expect(mobileCss).not.toMatch(/content:\s*"(?:耗|威力|连击|属性)"/);
  expect(readFileSync("src/styles/05-skills.css", "utf8")).toContain("content: attr(data-hint)");
  expect(readFileSync("src/styles/24-damage-comparison.css", "utf8")).toContain("content: attr(data-last-valid)");
});
