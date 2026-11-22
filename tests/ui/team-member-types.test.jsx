import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TeamMemberEditor } from "../../src/components/TeamMemberEditor.jsx";
import snapshot from "../../data/snapshots/current.json";
import { createTeamMember, teamPresetsRepository, TEAM_BLOODLINE_OPTIONS } from "../../src/state/team-presets.js";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { translateUi } from "../../src/i18n/messages.js";
import { localizeType } from "../../src/i18n/type-labels.js";
import globalSnapshot from "../../data/snapshots/global/s3-midseason.json";

const spirit = (name) => snapshot.spirits.find((entry) => entry.fullName === name);
const skill = (type, category) => snapshot.skills.find((entry) => entry.type === type && (!category || entry.category === category));
const make = (name, four) => ({ ...createTeamMember(snapshot, spirit(name).id), skills: { four, single: skill("龙").id } });
const region = () => screen.getByRole("region", { name: "旧玩具队伍技能系别" });

test.each([["en", "Common"], ["ja", "ノーマル"]])("%s bloodline choices use type names instead of neutral-nature text", (locale, common) => {
  const selected = globalSnapshot.spirits.find((entry) => entry.fullName === "迪莫");
  const member = { ...createTeamMember(globalSnapshot, selected.id), bloodlineType: "normal" };
  const onChange = vi.fn();
  render(<RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>
    <TeamMemberEditor index={0} member={member} snapshot={globalSnapshot} onChange={onChange} />
  </LocaleProvider></RuntimeProvider>);
  const bloodline = screen.getByRole("combobox", { name: translateUi(locale, "血脉") });
  expect(bloodline.selectedOptions[0].textContent).toBe(common);
  for (const { label, value } of TEAM_BLOODLINE_OPTIONS) {
    expect(bloodline.querySelector(`option[value="${value}"]`).textContent)
      .toBe(value === "boss" ? translateUi(locale, "首领") : localizeType(label, locale));
  }
  fireEvent.change(bloodline, { target: { value: "boss" } });
  expect(onChange).toHaveBeenCalledWith({ ...member, bloodlineType: "boss" });
});

test.each(["布灵", "布灵布灵"])("%s includes self, defense and status skills, deduplicates types and stays read-only", (name) => {
  const member = make(name, [skill("光").id, { skillId: skill("水", "defense").id }, { id: skill("普通", "status").id }, null]);
  const members = [member, null, make("加尔", [skill("光").id, "missing", skill("火").id])];
  const before = JSON.stringify(members);
  const onChange = vi.fn();
  render(<TeamMemberEditor index={0} member={member} members={members} snapshot={snapshot} onChange={onChange} />);
  expect(within(region()).getByText("4 种")).toBeInTheDocument();
  for (const type of ["光", "水", "普通", "火"]) expect(within(region()).getByText(type)).toBeInTheDocument();
  expect(within(region()).queryByText("龙")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(members)).toBe(before);
});

test("updates on loadout or team changes, ignores extra slots and hides for other members", () => {
  const member = make("布灵布灵", [skill("光").id, null, null, null, skill("龙").id]);
  const props = { index: 0, member, snapshot, onChange: vi.fn() };
  const { rerender } = render(<TeamMemberEditor {...props} members={[member, null, null, null, null, null, make("加尔", [skill("火").id])]} />);
  expect(within(region()).getByText("1 种")).toBeInTheDocument();
  rerender(<TeamMemberEditor {...props} members={[member, make("加尔", [skill("水").id])]} />);
  expect(within(region()).getByText("2 种")).toBeInTheDocument();
  const empty = make("布灵布灵", [null, "missing"]);
  rerender(<TeamMemberEditor {...props} member={empty} members={[empty]} />);
  expect(within(region()).getByText("0 种")).toBeInTheDocument();
  rerender(<TeamMemberEditor {...props} member={make("加尔", [])} members={[member]} />);
  expect(screen.queryByRole("region", { name: "旧玩具队伍技能系别" })).not.toBeInTheDocument();
});

test("配招换位保存完整技能设置，支持空槽并保留单技能选择", () => {
  const first = snapshot.skills.find((entry) => entry.name === "能量炮");
  const second = snapshot.skills.find((entry) => entry.name === "许愿星");
  const configured = { skillId: first.id, hitCount: 2, context: { energy: 3 } };
  const member = {
    ...createTeamMember(snapshot, spirit("加尔").id),
    skills: { single: configured, four: [configured, second.id, null, null] },
  };
  const storage = new Map();
  const repository = teamPresetsRepository({
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    idFactory: () => "swap-team",
  });
  let state = repository.create(repository.load(snapshot), "换位测试");
  state = repository.updateMember(state, state.activeTeamId, 0, member);
  const onChange = vi.fn((next) => {
    state = repository.updateMember(state, state.activeTeamId, 0, next);
  });
  const renderMember = (value) =>
    <TeamMemberEditor index={0} member={value} snapshot={snapshot} onChange={onChange} />;
  const move = (slot) =>
    fireEvent.keyDown(screen.getByRole("button", { name: `拖动技能${slot}换位` }), { key: "ArrowDown", altKey: true });
  const readMember = () => repository.load(snapshot).teams[0].members[0];
  const { rerender } = render(renderMember(member));

  expect(screen.getByRole("button", { name: "拖动技能3换位" })).toBeDisabled();
  move(1);
  expect(readMember().skills).toEqual({ ...member.skills, four: [second.id, configured, null, null] });

  rerender(renderMember(readMember()));
  move(2);
  const restored = readMember();
  expect(restored.skills).toEqual({ ...member.skills, four: [second.id, null, configured, null] });
  rerender(renderMember(restored));
  expect(screen.getByRole("combobox", { name: "成员技能1" })).toHaveValue(second.name);
  expect(screen.getByRole("combobox", { name: "成员技能2" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "成员技能3" })).toHaveValue(first.name);
  expect(onChange).toHaveBeenCalledTimes(2);
});
