import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { TeamMemberEditor } from "../../src/components/TeamMemberEditor.jsx";
import { getNature, getNatureMultipliers, STAT_LABELS } from "../../src/domain/natures.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { createTeamMember, teamPresetsRepository } from "../../src/state/team-presets.js";

const spirit = {
  id: "member", fullName: "面板成员", types: ["火"], stage: "三阶",
  raceStats: { hp: 85, physicalAttack: 128, magicalAttack: 46, speed: 120, physicalDefense: 101, magicalDefense: 82 },
};
const snapshot = {
  spirits: [spirit], traits: [],
  skills: [{ id: "attack", name: "攻击技能", type: "火", category: "physical", basePower: 80, cost: 1 }],
  learnsets: [{ spiritId: spirit.id, skillIds: ["attack"] }],
};
const makeMember = () => ({
  ...createTeamMember(snapshot, spirit.id),
  bloodlineType: "fire",
  displayIvs: { hp: 30, physicalAttack: 0, magicalAttack: 0, speed: 60, physicalDefense: 0, magicalDefense: 0 },
  skills: { single: "attack", four: [{ skillId: "attack", context: { energy: 3 }, hitCount: 2 }, null, null, null] },
  lineupSource: { source: "saved-preset", slot: 2 },
});

function EditorHarness({ member = makeMember(), onChange = () => {} }) {
  const [current, setCurrent] = useState(member);
  return <TeamMemberEditor index={0} member={current} snapshot={snapshot} onChange={next => {
    onChange(next);
    setCurrent(next);
  }} />;
}

function expectPanel(member) {
  const chart = screen.getByRole("figure", { name: "成员面板" });
  expect(within(chart).getAllByRole("checkbox")).toHaveLength(6);
  expect(screen.queryByRole("group", { name: "成员快捷个体" })).not.toBeInTheDocument();
  const panel = calculateAllPanelStats({ raceStats: spirit.raceStats, displayIvs: member.displayIvs,
    natureMultipliers: getNatureMultipliers(member.natureId), level: 60 });
  for (const [stat, value] of Object.entries(panel)) {
    const axis = within(chart).getByTitle(STAT_LABELS[stat]);
    expect(axis).toHaveAccessibleName(`${STAT_LABELS[stat]} ${value}`);
    expect(axis.querySelector("b")).toHaveTextContent(String(value));
    expect(axis.querySelector("b").classList.contains("stat-radar__iv-gain"))
      .toBe(member.displayIvs[stat] > 0);
    expect(axis.querySelector(".stat-icon--nature-gain") !== null)
      .toBe(getNature(member.natureId).upStat === stat);
    expect(within(axis).getByRole("checkbox", { name: `成员${STAT_LABELS[stat]}个体加点` }).checked)
      .toBe(member.displayIvs[stat] === 60);
  }
  return chart;
}

test("成员六维显示60级实际面板，性格仅点亮增益图标、个体仅点亮已加点数值", () => {
  const original = makeMember();
  const onChange = vi.fn();
  render(<EditorHarness member={original} onChange={onChange} />);
  expectPanel(original);
  expect(within(screen.getByRole("figure")).getByTitle("生命"))
    .not.toHaveAccessibleName(`生命 ${spirit.raceStats.hp}`);
  expect(onChange).not.toHaveBeenCalled();
  for (const [natureId, group, option] of [
    ["adamant", "物攻增益 +20%", "固执（+物攻 -魔攻）"],
    ["timid", "速度增益 +20%", "胆小（+速度 -物攻）"],
    ["neutral", null, "普通（无修正）"],
  ]) {
    fireEvent.click(screen.getByRole("combobox", { name: "成员性格" }));
    if (group) fireEvent.click(screen.getByRole("treeitem", { name: group }));
    fireEvent.click(screen.getByRole("treeitem", { name: option }));
    const expected = { ...original, natureId };
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expectPanel(expected);
  }
});

test("整块数值牌、勾选框和Space每次只切换一次0/60，保存时保留旧部分加点、血脉、配招和其它成员", async () => {
  const user = userEvent.setup();
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = teamPresetsRepository({ storage, idFactory: () => "team", now: () => "2026-11-02T00:00:00Z" });
  let state = store.create(store.load(snapshot), "测试队伍");
  const original = makeMember();
  const other = { ...makeMember(), natureId: "timid" };
  state = store.updateMember(state, state.activeTeamId, 0, original);
  state = store.updateMember(state, state.activeTeamId, 1, other);
  const onChange = vi.fn(next => { state = store.updateMember(state, state.activeTeamId, 0, next); });
  const view = render(<EditorHarness member={original} onChange={onChange} />);
  expectPanel(original);
  expect(onChange).not.toHaveBeenCalled();
  const read = () => teamPresetsRepository({ storage }).load(snapshot).teams[0].members;
  const expected = structuredClone(original);
  for (const [stat, value] of [["physicalAttack", 60], ["physicalAttack", 0], ["hp", 60], ["hp", 0]]) {
    const checkbox = screen.getByRole("checkbox", { name: `成员${STAT_LABELS[stat]}个体加点` });
    const axis = checkbox.closest("label");
    const previousCalls = onChange.mock.calls.length;
    fireEvent.click(value === 60 ? stat === "hp" ? axis.querySelector("b") : axis : checkbox);
    expected.displayIvs[stat] = value;
    expect(checkbox.checked).toBe(value === 60);
    expect(onChange).toHaveBeenCalledTimes(previousCalls + 1);
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expectPanel(expected);
    const restored = read();
    expect(restored[0]).toEqual(expected);
    expect(restored[1]).toEqual(other);
  }
  const speed = screen.getByRole("checkbox", { name: "成员速度个体加点" });
  speed.focus();
  expect(speed).toHaveFocus();
  for (const value of [0, 60]) {
    const previousCalls = onChange.mock.calls.length;
    await user.keyboard(" ");
    expected.displayIvs.speed = value;
    expect(onChange).toHaveBeenCalledTimes(previousCalls + 1);
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expectPanel(expected);
    expect(read().slice(0, 2)).toEqual([expected, other]);
  }
  view.unmount();
  render(<EditorHarness member={read()[0]} />);
  expectPanel(expected);
  expect(screen.getByRole("checkbox", { name: "成员速度个体加点" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "成员生命个体加点" })).not.toBeChecked();
});

test.each([
  ["缺失", { raceStats: undefined }],
  ["不完整", { raceStats: { hp: 85 } }],
  ["待核实", { calculationStatus: "pending-race-stats" }],
  ["占位种族值", { previewIdentity: { raceStatsPlaceholder: true } }],
])("%s数据不生成成员面板图", (_label, overrides) => {
  const onChange = vi.fn();
  render(<TeamMemberEditor index={0} member={makeMember()} snapshot={{ ...snapshot, spirits: [{ ...spirit, ...overrides }] }} onChange={onChange} />);
  expect(screen.queryByRole("figure", { name: "成员面板" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "成员快捷个体" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /^成员.+个体加点$/ })).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test("国际服占位配置保留可编辑草稿，不生成面板或把未设置个体改为0", () => {
  const draft = { ...makeMember(), natureId: null,
    displayIvs: Object.fromEntries(Object.keys(spirit.raceStats).map(stat => [stat, null])) };
  const onChange = vi.fn();
  render(<RuntimeProvider serverId="global"><TeamMemberEditor index={0} member={draft}
    snapshot={{ ...snapshot, meta: { serverId: "global", placeholderSource: "cn" } }} onChange={onChange} /></RuntimeProvider>);
  expect(screen.queryByRole("figure", { name: "成员面板" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "成员快捷个体" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /^成员.+个体加点$/ })).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(null);
  expect(onChange).not.toHaveBeenCalled();
});
