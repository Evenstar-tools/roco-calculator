import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { CompactFourSkillEditor, CompactSingleSkillEditor } from "../../src/components/CompactSkillEditor.jsx";
import { FirstRunGuide } from "../../src/components/FirstRunGuide.jsx";
import { QuickIvPicker } from "../../src/components/QuickIvPicker.jsx";
import { QuickNaturePicker } from "../../src/components/QuickNaturePicker.jsx";
import { TeamMemberEditor } from "../../src/components/TeamMemberEditor.jsx";
import { TeamRoster } from "../../src/components/TeamRoster.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages, translateUi } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { createTeamMember } from "../../src/state/team-presets.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";

const snapshot = globalPlaceholderCatalog();
const wrap = (locale, children) => <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;
const translator = (locale) => (source, values) => translateUi(locale, source, values);
beforeEach(() => { clearMissingUiMessages(); localStorage.clear(); });

test("placeholder imported IV 120 survives focus/blur and explicit edits are uncapped, nonnegative and nullable", () => {
  const base = createTeamMember(snapshot, snapshot.spirits[0].id);
  const onChange = vi.fn();
  function Editor() {
    const [member, setMember] = useState({ ...base, displayIvs: { ...base.displayIvs, physicalAttack: 120 } });
    return <TeamMemberEditor index={0} member={member} snapshot={snapshot} onChange={(next) => { onChange(next); setMember(next); }} />;
  }
  render(wrap("en", <Editor />));
  const input = screen.getByRole("spinbutton", { name: "Atk IV" });
  expect(input).toHaveValue(120);
  expect(input).not.toHaveAttribute("max");
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(input).toHaveValue(120);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "150" } });
  fireEvent.blur(input);
  expect(input).toHaveValue(150);
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.lastCall[0].displayIvs.physicalAttack).toBe(150);
  fireEvent.change(input, { target: { value: "-5" } });
  fireEvent.blur(input);
  expect(input).toHaveValue(0);
  expect(onChange.mock.lastCall[0].displayIvs.physicalAttack).toBe(0);
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.blur(input);
  expect(input).toHaveValue(null);
  expect(onChange.mock.lastCall[0].displayIvs.physicalAttack).toBeNull();
});

test.each(["zh-CN", "en", "ja"])("%s placeholder member can set and clear nature, IVs and skills without calculated values or defaults", (locale) => {
  const t = translator(locale);
  const initial = createTeamMember(snapshot, snapshot.spirits[0].id);
  const onChange = vi.fn();
  function Editor() {
    const [member, setMember] = useState(initial);
    return <TeamMemberEditor index={0} member={member} snapshot={snapshot} onChange={(next) => { onChange(next); setMember(next); }} />;
  }
  const { container } = render(wrap(locale, <Editor />));
  expect(onChange).not.toHaveBeenCalled();
  const nature = screen.getByRole("combobox", { name: t("成员性格") });
  expect(nature).toHaveTextContent(t("未设置"));
  expect(screen.getAllByRole("spinbutton")).toHaveLength(6);
  for (const input of screen.getAllByRole("spinbutton")) expect(input).toHaveValue(null);
  expect(container.querySelector(".team-member-editor__durability")).not.toBeInTheDocument();
  expect(container.querySelector(".team-member-editor__bloodline")).not.toBeInTheDocument();
  expect(container.querySelector(".team-member-editor__analysis-cta")).not.toBeInTheDocument();
  for (const panel of container.querySelectorAll(".stat-tile__panel")) expect(panel).toHaveTextContent("—");

  const attackIv = screen.getByRole("spinbutton", { name: t("{label}个体", { label: t("物攻") }) });
  fireEvent.change(attackIv, { target: { value: "60" } });
  expect(onChange.mock.lastCall[0].displayIvs).toEqual({ ...initial.displayIvs, physicalAttack: 60 });
  fireEvent.change(attackIv, { target: { value: "" } });
  fireEvent.blur(attackIv);
  expect(onChange.mock.lastCall[0].displayIvs.physicalAttack).toBeNull();

  fireEvent.click(nature);
  fireEvent.click(screen.getByRole("treeitem", { name: t("{stat}增益（国服参考）", { stat: t("物攻") }) }));
  fireEvent.click(screen.getByRole("treeitem", { name: `${t("物攻")}↑ ${t("魔攻")}↓` }));
  expect(onChange.mock.lastCall[0].natureId).toBe("adamant");
  expect(screen.queryByRole("img", { name: /20%/ })).not.toBeInTheDocument();
  expect(container.querySelector('[title*="20%"], [aria-label*="20%"], [alt*="20%"]')).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent(/20%|60.*(?:上限|cap|上限値)/);
  for (const input of screen.getAllByRole("spinbutton")) expect(input).not.toHaveAttribute("max", "60");
  fireEvent.click(nature);
  fireEvent.click(screen.getByRole("treeitem", { name: t("未设置"), exact: true }));
  expect(onChange.mock.lastCall[0].natureId).toBeNull();

  const skillLabel = t("成员技能{index}", { index: 1 });
  fireEvent.focus(screen.getByRole("combobox", { name: skillLabel }));
  const option = screen.getByRole("option", { name: /中文技能一/ });
  expect(option).not.toHaveTextContent(t("国服中文参考"));
  expect(option).not.toHaveTextContent("75");
  fireEvent.click(option);
  expect(onChange.mock.lastCall[0].skills.four[0]).toBe(snapshot.skills[0].id);
  expect(onChange.mock.lastCall[0].skills.single).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("清空{label}", { label: skillLabel }) }));
  expect(onChange.mock.lastCall[0].skills.four[0]).toBeNull();
  expect(onChange.mock.lastCall[0].natureId).toBeNull();
  expect(getMissingUiMessages()).toEqual([]);
});

test("guide targets the visible server workspace when the other server remains mounted", () => {
  const getRect = (top) => ({ top, bottom: top + 60, left: 20, right: 220, width: 200, height: 60, x: 20, y: top });
  const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
    return getRect(this.closest("[hidden], [inert]") ? 10 : 120);
  });
  try {
    const { container } = render(wrap("en", <>
      <section hidden inert><div data-guide-target="attacker" /></section>
      <section><div data-guide-target="attacker" /></section>
      <FirstRunGuide open step={0} onBack={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />
    </>));
    expect(container.querySelector(".first-run-guide__spotlight")).toHaveStyle({ top: "114px" });
  } finally { rectSpy.mockRestore(); }
});

test.each(["en", "ja"])("%s compact placeholder slots remain editable but never activate skills or expose injected battle results", (locale) => {
  const t = translator(locale);
  const onSkillActivate = vi.fn();
  const canSkillActivate = vi.fn(() => true);
  const onSkillFocus = vi.fn();
  const onSkillSelect = vi.fn();
  const referenceSkill = { ...snapshot.skills[0], category: "status", basePower: 9876, cost: 321, type: "普通" };
  const result = { status: "exact", damage: 9876, percent: 81.2, skillCost: 321, hitCount: 9, formulaSteps: [], usageSummary: { count: 5 } };
  const { container } = render(wrap(locale, <CompactFourSkillEditor
    placeholder activeSide="attacker" activeSkillIndex={0}
    attackerName="中文占位一" defenderName="中文占位二"
    attackerSkills={[referenceSkill]} defenderSkills={[]}
    attackerSkillChoices={[referenceSkill]} defenderSkillChoices={[referenceSkill]}
    attackerResults={[result]} attackerTraitDamage={{ name: "不应展示特性", hitCount: 9, basePower: 111 }}
    traitEditors={{ attacker: <p>不应展示特性</p> }}
    canSkillActivate={canSkillActivate} onSkillActivate={onSkillActivate} onSkillFocus={onSkillFocus} onSkillSelect={onSkillSelect}
  />));
  expect(container).not.toHaveTextContent(/9876|321|81\.2|不应展示特性/);
  expect(container.querySelector(".compact-skill__cost")).not.toBeInTheDocument();
  expect(container.querySelector(".skill-follow-up")).not.toBeInTheDocument();
  expect(canSkillActivate).not.toHaveBeenCalled();
  expect(screen.queryByText(t("待核验"))).not.toBeInTheDocument();
  expect(container.querySelector(".compact-skill__result")).not.toBeInTheDocument();
  const selectedRow = screen.getByRole("group", { name: t("{label}技能{index}，当前选中", { label: t("攻击方"), index: 1 }) });
  fireEvent.click(selectedRow);
  expect(onSkillFocus).toHaveBeenLastCalledWith("attacker", 0);
  expect(onSkillActivate).not.toHaveBeenCalled();
  const secondLabel = t("{label}技能{index}", { label: t("攻击方"), index: 2 });
  fireEvent.focus(screen.getByRole("combobox", { name: secondLabel }));
  fireEvent.click(screen.getByRole("option", { name: /中文技能一/ }));
  expect(onSkillSelect).toHaveBeenLastCalledWith("attacker", 1, referenceSkill.id);
  expect(onSkillActivate).not.toHaveBeenCalled();
  expect(getMissingUiMessages()).toEqual([]);
});

test("single placeholder skill suppresses numbers, mechanisms and activation while retaining reference description", () => {
  const selected = { ...snapshot.skills[0], description: "国服中文技能说明", cost: 321, basePower: 9876 };
  const { container } = render(wrap("en", <CompactSingleSkillEditor placeholder canActivateSkill attackName="中文占位一" defenseName="中文占位二"
    selectedSkill={selected} skills={[selected]} onSkillSelect={vi.fn()} onSkillActivate={vi.fn()}
    result={{ status: "exact", damage: 9876, percent: 81.2, skillCost: 321 }} />));
  expect(container).toHaveTextContent("国服中文技能说明");
  expect(container).not.toHaveTextContent("Unverified");
  expect(container.querySelector(".compact-skill__result")).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent(/9876|321|81\.2|使用技能/);
  expect(getMissingUiMessages()).toEqual([]);
});

test.each(["en", "ja"])("%s quick fields and roster do not turn unset values into neutral or zero", (locale) => {
  const t = translator(locale);
  const member = createTeamMember(snapshot, snapshot.spirits[0].id);
  const onNatureChange = vi.fn();
  const onIvChange = vi.fn();
  render(wrap(locale, <>
    <QuickNaturePicker label={t("攻击方")} value={null} displayIvs={member.displayIvs} onChange={onNatureChange} placeholder side="attacker" showOptionLabels />
    <QuickIvPicker label={t("攻击方")} values={member.displayIvs} onChange={onIvChange} placeholder side="attacker" showOptionLabels />
    <TeamRoster members={[member, { ...member, natureId: "adamant" }, { ...member, natureId: "unknown-nature" }]} selectedIndex={0} snapshot={snapshot} onApply={vi.fn()} onSelect={vi.fn()} />
  </>));
  const natureGroup = screen.getByRole("group", { name: t("{label}快捷性格", { label: t("攻击方") }) });
  for (const button of within(natureGroup).getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "false");
  const ivGroup = screen.getByRole("group", { name: t("{label}快捷个体", { label: t("攻击方") }) });
  for (const input of within(ivGroup).getAllByRole("checkbox")) {
    expect(input).not.toBeChecked();
    expect(input.closest("label").title).toContain("—");
  }
  expect(onNatureChange).not.toHaveBeenCalled();
  expect(onIvChange).not.toHaveBeenCalled();
  const roster = screen.getByRole("list", { name: t("队伍成员") });
  expect(roster).toHaveTextContent(t("未设置"));
  expect(roster).toHaveTextContent(`${t("物攻")}↑ ${t("魔攻")}↓`);
  expect(roster).toHaveTextContent("unknown-nature");
  expect(getMissingUiMessages()).toEqual([]);
});

test.each(["en", "ja"])("%s Global guide preserves the six-step original flow but ends with save/share rather than CN import", (locale) => {
  const t = translator(locale);
  const actions = { onBack: vi.fn(), onNext: vi.fn(), onSkip: vi.fn(), onImport: vi.fn(), onOpenDetailed: vi.fn() };
  const { rerender } = render(wrap(locale, <FirstRunGuide open step={0} {...actions} />));
  expect(screen.getByRole("dialog")).toHaveTextContent(t("从国服中文占位资料中选择攻击方精灵。"));
  fireEvent.click(screen.getByRole("button", { name: t("下一步") }));
  expect(actions.onNext).toHaveBeenCalledOnce();
  rerender(wrap(locale, <FirstRunGuide open step={4} {...actions} />));
  expect(screen.getByRole("dialog")).toHaveTextContent(t("保存配置"));
  expect(screen.queryByText(t("前往具体版"))).not.toBeInTheDocument();
  rerender(wrap(locale, <FirstRunGuide open step={5} {...actions} />));
  expect(screen.getByRole("dialog")).toHaveTextContent(t("分享配置"));
  expect(screen.queryByText(t("导入热门配置"))).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("完成引导") }));
  expect(actions.onSkip).toHaveBeenCalledOnce();
  expect(actions.onImport).not.toHaveBeenCalled();
  expect(actions.onOpenDetailed).not.toHaveBeenCalled();
  expect(getMissingUiMessages()).toEqual([]);
});
