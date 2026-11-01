import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import StarfallThresholdDialog from "../../src/components/StarfallThresholdDialog.jsx";
import { CompactConditionDialog, CompactConditionTrigger, CompactSkillState } from "../../src/components/CompactConditions.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { translateUi } from "../../src/i18n/messages.js";
import { translateCalculatorText } from "../../src/i18n/calculator-text.js";
import { getGlobalEntityText } from "../../src/runtime/global-entity-localization.js";
import { createInitialState } from "../../src/state/defaults.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { findStarfallThreshold, withStarfallStacks } from "../../src/domain/starfall-thresholds.js";
import { WhatsNewDialog } from "../../src/components/WhatsNewDialog.jsx";
import { DataSourceDialog } from "../../src/components/DataSourceDialog.jsx";
import { GLOBAL_RELEASE_SUMMARY } from "../../src/data/global-release-summary.js";
import { App } from "../../src/App.jsx";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

const full = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
const snapshot = { ...full, spirits: full.spirits.filter((spirit) => ["迪莫", "魔力猫"].includes(spirit.fullName)) };
const wrap = (locale, children) => <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;
afterEach(cleanup);

function sourceFixture() {
  const state = createInitialState(snapshot);
  state.mode = "single";
  state.sides.attacker.spiritId = snapshot.spirits.find((spirit) => spirit.fullName === "迪莫").id;
  state.sides.defender.spiritId = snapshot.spirits.find((spirit) => spirit.fullName === "魔力猫").id;
  state.sides.attacker.skills.single = snapshot.skills.find((skill) => skill.name === "闪光").id;
  state.directions.forward.currentHp = 30;
  return { state, direction: "forward" };
}

test.each([["cn", "zh-CN"], ["global", "en"], ["global", "ja"]])("%s %s 星陨工具仅在任一方有实际印记时显示", (serverId, locale) => {
  localStorage.clear();
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
  const t = (key) => translateUi(locale, key);
  const tc = (key, values) => translateCalculatorText(key, locale, values);
  render(<RuntimeProvider serverId={serverId} locale={locale}><LocaleProvider locale={locale}>
    <App initialSnapshot={{ ...snapshot, meta: { ...snapshot.meta, serverId } }} initialWorkspace={{ state: sourceFixture().state, viewMode: "detailed", advancedOptionsOpen: true }} />
  </LocaleProvider></RuntimeProvider>);
  const entry = { name: tc("星陨斩杀线"), exact: true };
  const desktopResult = () => screen.getByRole("complementary", { name: tc("伤害结果") });
  expect(screen.queryByRole("button", entry)).not.toBeInTheDocument();

  for (const sideLabel of ["进攻方", "防御方"]) {
    const mark = () => screen.getByRole("combobox", { name: tc("{v0}{v1}印记", { v0: sideLabel, v1: "负面" }) });
    fireEvent.change(mark(), { target: { value: "poison" } });
    expect(screen.queryByRole("button", entry)).not.toBeInTheDocument();
    fireEvent.change(mark(), { target: { value: "starfall" } });
    const stacks = () => screen.getByRole("spinbutton", { name: tc(`${sideLabel}星陨层数`).trim() });
    fireEvent.change(stacks(), { target: { value: "2" } });
    expect(within(desktopResult()).getByRole("button", entry)).toBeVisible();

    fireEvent.click(within(desktopResult()).getByRole("button", { name: tc("切换计算方向") }));
    expect(within(desktopResult()).getByRole("button", entry)).toBeVisible();
    expect(stacks()).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: t("精简版") }));
    expect(within(desktopResult()).getByRole("button", entry)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("展开伤害结果") }));
    const mobileResult = screen.getByRole("dialog", { name: t("完整伤害结果") });
    expect(within(mobileResult).getByRole("button", entry)).toBeVisible();
    fireEvent.click(within(mobileResult).getByRole("button", { name: t("关闭伤害结果") }));

    fireEvent.click(screen.getByRole("button", { name: t("具体版") }));
    fireEvent.change(stacks(), { target: { value: "0" } });
    expect(screen.queryByRole("button", entry)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("展开伤害结果") }));
    expect(within(screen.getByRole("dialog", { name: t("完整伤害结果") })).queryByRole("button", entry)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("关闭伤害结果") }));
    fireEvent.change(stacks(), { target: { value: "1" } });
    expect(within(desktopResult()).getByRole("button", entry)).toBeVisible();
    fireEvent.change(mark(), { target: { value: "" } });
    expect(screen.queryByRole("button", entry)).not.toBeInTheDocument();
  }
});

test.each(["en", "ja"])("Global %s starfall uses real S3 damage, translated controls and canonical state", async (locale) => {
  const source = sourceFixture(), before = structuredClone(source.state), onApply = vi.fn();
  const t = (key, values) => translateUi(locale, key, values);
  const threshold = findStarfallThreshold({ snapshot, ...source });
  expect(threshold).toMatchObject({ status: "found", minimum: 2, current: { damage: 23 } });
  const prepared = withStarfallStacks(source.state, source.direction, threshold.minimum);
  expect(threshold.threshold.damage).toBe(buildCalculatorViewModel({ snapshot, state: prepared, activeDirection: source.direction }).result.selectedResult.totalDamage);
  expect(translateCalculatorText("星陨斩杀线", locale)).toBe(t("星陨斩杀线"));
  const { container } = render(wrap(locale, <StarfallThresholdDialog snapshot={snapshot} source={source} onClose={vi.fn()} onApply={onApply} />));
  const dialog = screen.getByRole("dialog", { name: t("星陨斩杀线") });
  const fill = await within(dialog).findByRole("button", { name: t("填入 {count} 层", { count: 2 }) });
  const defender = snapshot.spirits.find((spirit) => spirit.fullName === "魔力猫");
  const name = getGlobalEntityText("spirit", defender, "fullName", locale);
  await waitFor(() => expect(within(dialog).getByText(t("{count} 只精灵／形态", { count: 2 }))).toBeVisible());
  expect(within(dialog).getByRole("combobox", { name: t("星陨计算技能") }).selectedOptions[0].textContent)
    .toBe(getGlobalEntityText("skill", snapshot.skills.find((skill) => skill.name === "闪光"), "name", locale));
  fireEvent.change(within(dialog).getByRole("textbox", { name: t("搜索星陨斩杀精灵") }), { target: { value: name } });
  expect(container.querySelectorAll(".starfall-item")).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: t("选择{name}培养", { name }) }));
  expect(within(dialog).getByRole("button", { name: new RegExp(t("代入{template}", { template: t("纯肉") })) })).toBeVisible();
  expect(container.textContent).not.toMatch(/Translation unavailable|翻訳未対応/);
  if (locale === "en") expect(container.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  else expect(container.textContent).not.toMatch(/星陨|斩杀|培养|防守方|计算依据|暂无/);
  expect(source.state).toEqual(before);
  fireEvent.click(fill);
  expect(onApply).toHaveBeenCalledOnce();
  expect(onApply.mock.calls[0][0].marks.defender.negative).toMatchObject({ id: "starfall", stacks: 2 });
  expect(onApply.mock.calls[0][1].notice).toBe(t("已填入 {count} 层星陨", { count: 2 }));
});

test("Global compact Gear Torque conditions switch languages without changing the saved key or count", () => {
  const skill = full.skills.find((entry) => entry.name === "齿轮扭矩");
  const inputs = getSkillEffectInputs(skill), input = inputs[0], onChange = vi.fn();
  const model = { key: skill.id, title: "攻击方 · 齿轮扭矩条件", triggerLabel: "攻击方技能1条件", inputs,
    context: { [input.id]: 21 }, description: skill.description, onChange };
  const children = <><CompactConditionTrigger model={model} onOpen={vi.fn()} /><CompactConditionDialog model={model} onClose={vi.fn()} /></>;
  const { rerender } = render(wrap("en", children));
  let control = screen.getByRole("spinbutton", { name: translateCalculatorText("位置变化次数", "en") });
  expect(control).toHaveValue(21);
  expect(control).not.toHaveAttribute("max");
  expect(document.body.textContent).toContain("Gear Torque");
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  rerender(wrap("ja", children));
  control = screen.getByRole("spinbutton", { name: translateCalculatorText("位置变化次数", "ja") });
  expect(control).toHaveValue(21);
  expect(document.body.textContent).toContain("ギアトルク");
  fireEvent.change(control, { target: { value: "22" } });
  expect(onChange).toHaveBeenLastCalledWith("skill.positionChangeCount.30de2dc0", 22);
  expect(skill.name).toBe("齿轮扭矩");
});

test("Global compact applied-state summaries translate counts and gains separately", () => {
  const result = { usageSummary: { count: 2, appliedEffects: ["威力+30"], nextHint: "使用后可得：威力+15" } };
  const { container, rerender } = render(wrap("en", <CompactSkillState result={result} details />));
  expect(container).toHaveTextContent("Used 2 times");
  expect(container.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  rerender(wrap("ja", <CompactSkillState result={result} details />));
  expect(container).toHaveTextContent("2回使用済み");
  expect(container.textContent).not.toMatch(/已用|本次可得|使用后可得/);
});

test.each(["en", "ja"])("Global %s introduction and release record show the delivered features without S5 content", (locale) => {
  const t = (key) => translateUi(locale, key), onOpenFeature = vi.fn();
  const { rerender } = render(wrap(locale, <WhatsNewDialog open onClose={vi.fn()} onOpenFeature={onOpenFeature} />));
  const intro = screen.getByRole("dialog", { name: t("新功能介绍") });
  for (const item of GLOBAL_RELEASE_SUMMARY.items) expect(within(intro).getByText(t(item.title))).toBeVisible();
  fireEvent.click(within(intro).getByRole("button", { name: `${t("打开")} ${t("18 系克制图")}` }));
  expect(onOpenFeature).toHaveBeenLastCalledWith("typeChart");
  fireEvent.click(within(intro).getByRole("button", { name: `${t("打开")} ${t("全屏速度线")}` }));
  expect(onOpenFeature).toHaveBeenLastCalledWith("speed");
  expect(intro.textContent).not.toContain("S5");
  if (locale === "en") expect(intro.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  rerender(wrap(locale, <DataSourceDialog open initialView="release" onClose={vi.fn()} />));
  const record = screen.getByRole("dialog", { name: t("完整版本记录") });
  expect(within(record).getByText(GLOBAL_RELEASE_SUMMARY.date)).toBeVisible();
  expect(record).toHaveTextContent(t("采用 S3 季中数值与规则。"));
  for (const item of GLOBAL_RELEASE_SUMMARY.items) expect(within(record).getByText(t(item.title))).toBeVisible();
  expect(record.textContent).not.toContain("S5");
  expect(record.textContent).not.toMatch(/Translation unavailable|翻訳未対応/);
  if (locale === "en") expect(record.textContent).not.toMatch(/[\u3400-\u9fff]/u);
});
