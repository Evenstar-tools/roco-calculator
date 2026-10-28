import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { translateCalculatorText, useCalculatorLocale } from "../../src/i18n/calculator-text.js";
import { translateUi } from "../../src/i18n/messages.js";
import { getGlobalEntityText, localizeGlobalSpirit } from "../../src/runtime/global-entity-localization.js";
import { buildCalculatorViewModel, getTraitView } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { selectSingleSkill } from "../../src/state/calculator-session.js";
import { ResultRail } from "../../src/components/ResultRail.jsx";
import { createTeamMember } from "../../src/state/team-presets.js";
import { TraitHint } from "../../src/components/TraitHint.jsx";
import DamageRangeFilter from "../../src/components/DamageRangeFilter.jsx";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";
import snapshot from "../../data/snapshots/global/s3-midseason.json";

const wrap = (locale, children) => <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;
afterEach(cleanup);
function Probe({ inspect }) { inspect(useCalculatorLocale()); return null; }
function untranslated(container) {
  return [...container.querySelectorAll("*")].flatMap(node => [
    ...(node.children.length ? [] : [node.textContent]),
    ...["title", "aria-label", "aria-valuetext", "placeholder"].map(key => node.getAttribute(key)),
  ]).filter(value => value && /[\u3400-\u9fff]/u.test(value));
}

test.each(["en", "ja"])("%s resolves every S3 trait view through its canonical entity and preserves engine data", locale => {
  let ui;
  render(wrap(locale, <Probe inspect={value => { ui = value; }} />));
  const before = JSON.stringify(snapshot.traits);
  let checked = 0;
  for (const spirit of snapshot.spirits) for (const side of ["attacker", "defender"]) {
    const view = getTraitView(snapshot, spirit, side);
    if (!view) continue;
    const canonical = view.previewTraitEntity;
    const expectedName = getGlobalEntityText("trait", canonical, "name", locale);
    const expectedDescription = getGlobalEntityText("trait", canonical, "description", locale);
    if (canonical.inheritedFrom) {
      expect(ui.entityName("trait", view)).toBe(translateCalculatorText(view.name, locale));
      expect(ui.entityDescription("trait", view)).toBe(translateCalculatorText(view.description, locale));
      if (locale === "en") expect(ui.entityDescription("trait", view)).not.toMatch(/[\u3400-\u9fff]/u);
      checked += 1;
      continue;
    }
    expect(expectedName).toBeTruthy();
    expect(expectedDescription).toBeTruthy();
    expect(ui.entityName("trait", view), `${spirit.fullName}:${side}`).toBe(expectedName);
    expect(ui.entityDescription("trait", view), `${spirit.fullName}:${side}`).toBe(expectedDescription);
    checked += 1;
  }
  expect(checked).toBe(snapshot.spirits.length * 2);
  expect(JSON.stringify(snapshot.traits)).toBe(before);
  for (const spirit of snapshot.spirits) {
    const name = spirit.fullName;
    const display = localizeGlobalSpirit(spirit, locale);
    expect(ui.entityName("spirit", spirit)).toBe(display.fullName);
    expect([display.fullName, display.baseName]).toContain(ui.entityName("spirit", { fullName: name }));
  }
  for (const name of ["迪莫", "魔力猫"]) expect(translateCalculatorText(name, locale)).toBe(ui.entityName("spirit", { name }));
  const form = snapshot.spirits.find(entry => localizeGlobalSpirit(entry, locale).variantName);
  expect(form).toBeTruthy();
  expect(ui.entityName("spirit", form)).toBe(localizeGlobalSpirit(form, locale).fullName);
  expect(ui.entityName("spirit", { name: form.fullName })).toBe(localizeGlobalSpirit(form, locale).fullName);
});

test("real trait tooltip switches official description without reconstructing its view", () => {
  const spirit = snapshot.spirits.find(entry => entry.fullName === "迪莫");
  const view = getTraitView(snapshot, spirit, "attacker");
  const child = <TraitHint trait={view} name={view.name} description={view.description} />;
  const { container, rerender } = render(wrap("en", child));
  fireEvent.focus(container.querySelector(".trait-hint"));
  expect(screen.getByRole("tooltip")).toHaveTextContent(getGlobalEntityText("trait", view.previewTraitEntity, "description", "en"));
  rerender(wrap("ja", child));
  expect(screen.getByRole("tooltip")).toHaveTextContent(getGlobalEntityText("trait", view.previewTraitEntity, "description", "ja"));
});

function RangeHarness() { const [range, setRange] = useState([25, 75]); return <DamageRangeFilter value={range} onChange={setRange} />; }
test("damage range translates labels and retains a changed slider value across languages", () => {
  const { container, rerender } = render(wrap("en", <RangeHarness />));
  expect(untranslated(container)).toEqual([]);
  fireEvent.keyDown(screen.getByRole("slider", { name: "Minimum damage percentage" }), { key: "ArrowLeft" });
  expect(screen.getByRole("slider", { name: "Minimum damage percentage" })).toHaveValue("0");
  rerender(wrap("ja", <RangeHarness />));
  expect(screen.getByRole("slider", { name: "被ダメージ割合の下限" })).toHaveValue("0");
  expect(screen.getByRole("slider", { name: "被ダメージ割合の上限" })).toHaveValue("75");
});

test("ability analysis localizes speed-target labels, metadata and searches by official name", () => {
  const reduced = { ...snapshot, spirits: snapshot.spirits.filter(entry => ["迪莫", "魔力猫", "音速犬", "波普鹿"].includes(entry.fullName)) };
  const configuration = createTeamMember(snapshot, reduced.spirits.find(entry => entry.fullName === "迪莫").id);
  const { container } = render(wrap("en", <AbilityWorkbench snapshot={reduced} configuration={configuration} source={{ kind: "member", index: 0 }} onApplyMember={vi.fn()} />));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(translateUi("en", "速度一览")) }));
  const input = screen.getByRole("combobox", { name: translateUi("en", "速度目标精灵") });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Meodow" } });
  const options = within(screen.getByRole("listbox", { name: translateUi("en", "速度目标候选") })).getAllByRole("option");
  expect(options.length).toBeGreaterThan(0);
  fireEvent.click(options[0]);
  expect(input.value).toContain("Meodow");
  expect(untranslated(container).join("\n")).toBe("");
});

test("core stat and battle labels retain the official English and Japanese terminology", () => {
  const terms = {
    物攻: ["P. ATK", "物攻"], 魔攻: ["M. ATK", "魔攻"], 物防: ["P. DEF", "物防"], 魔防: ["M. DEF", "魔防"],
    速度: ["SPD", "速さ"], 生命: ["HP", "HP"], 特性: ["Trait", "特性"], 个体: ["Ind. Apt.", "個体資質"],
    威力: ["Power", "威力"], 连击: ["Combo", "連撃"],
  };
  for (const [zh, [en, ja]] of Object.entries(terms)) {
    expect(translateUi("en", zh)).toBe(en); expect(translateUi("ja", zh)).toBe(ja);
  }
});

// These messages come from real supported skills with their required conditions unset.
// Keep the engine result in Chinese; only the displayed diagnostic follows the locale.
test.each([
  ["穿膛", "需要条件数值才能确定技能威力"],
  ["械斗", "需要技能位置才能确定技能威力"],
  ["六自由度", "需要两侧相邻技能的当前显示威力"],
  ["传感器", "向心力需要技能位置才能确定威力加成"],
  ["怨力打击", "需要敌方技能威力"],
  ["鸩毒", "需要层数上下文"],
  ["坟场搏击", "需要敌方能量"],
  ["灾厄", "默认对自身造成伤害，开启应对后计算对敌伤害"],
])("%s keeps its real missing-condition diagnostic localized after switching languages", (skillName, reason) => {
  const skill = snapshot.skills.find(entry => entry.name === skillName);
  const learnset = snapshot.learnsets.find(entry => entry.skillIds.includes(skill.id));
  let state = createInitialState(snapshot);
  state.sides.attacker.spiritId = learnset.spiritId;
  state = selectSingleSkill(state, { direction: "forward", side: "attacker", skillId: skill.id, snapshot }).state;
  const result = buildCalculatorViewModel({ activeDirection: "forward", snapshot, state, serverId: "global" }).result;
  expect(result.selectedResult).toMatchObject({ status: "needs_input", reason, totalDamage: null });
  const before = JSON.stringify(result);
  const child = <ResultRail result={result} />;
  const { container, rerender } = render(wrap("en", child));
  for (const locale of ["en", "ja"]) {
    if (locale !== "en") rerender(wrap(locale, child));
    const expected = translateUi(locale, reason);
    expect(expected).not.toBe(reason);
    expect(expected).not.toMatch(/Translation unavailable|翻訳未対応/u);
    expect(container.querySelector(".result-rail__lethal")).toHaveTextContent(expected);
    expect(container.querySelector(".result-rail__lethal")).not.toHaveTextContent(reason);
  }
  expect(JSON.stringify(result)).toBe(before);
});
