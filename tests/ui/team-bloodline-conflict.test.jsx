import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TeamMemberEditor } from "../../src/components/TeamMemberEditor.jsx";
import { TeamRoster } from "../../src/components/TeamRoster.jsx";
import { createTeamMember } from "../../src/state/team-presets.js";

const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
const snapshot = {
  spirits: [{ id: "pet", fullName: "测试精灵", stage: "三阶", types: ["普通"], raceStats }, { id: "boss", fullName: "测试首领", stage: "首领", types: ["普通"], raceStats }],
  skills: [{ id: "blood", name: "血脉招式", type: "普通", category: "defense", cost: 1 },
    { id: "native", name: "自学招式", type: "火", category: "physical", basePower: 80, cost: 2 }],
  learnsets: ["pet", "boss"].map(spiritId => ({ spiritId, skillIds: ["blood", "native"], acquisitions: {
    blood: ["普通系血脉 Lv.15"], native: ["火系血脉 Lv.15", "默认学习 Lv.1"],
  } })),
};
const member = { ...createTeamMember(snapshot, "pet"), bloodlineType: "normal", skills: { four: ["blood", "native", null, null], single: "blood" } };

test("技能选单和已选技能明确标记血脉来源，普通技能仍显示可学习", () => {
  render(<TeamMemberEditor index={0} member={member} snapshot={snapshot} onChange={vi.fn()} />);
  expect(screen.getByText("血脉技能")).toBeInTheDocument();
  fireEvent.focus(screen.getByRole("combobox", { name: "成员技能1" }));
  const list = screen.getByRole("listbox");
  expect(within(list).getByRole("option", { name: /血脉招式.*血脉技能/ })).toBeInTheDocument();
  expect(within(list).getByRole("option", { name: /自学招式.*可学习/ })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("切换首领立即提示且不自动删除配招，恢复普通或移除冲突技能后消失", () => {
  const onChange = vi.fn();
  const props = { index: 0, snapshot, onChange };
  const { rerender } = render(<TeamMemberEditor {...props} member={member} />);
  fireEvent.change(screen.getByRole("combobox", { name: "血脉", exact: true }), { target: { value: "boss" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...member, bloodlineType: "boss" });
  const boss = onChange.mock.calls.at(-1)[0];
  rerender(<TeamMemberEditor {...props} member={boss} />);
  expect(screen.getByRole("alert")).toHaveTextContent("首领化／首领形态不能携带血脉技能：血脉招式");
  expect(screen.getByText("血脉技能 · 冲突")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "血脉", exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("combobox", { name: "成员技能1" })).toHaveValue("血脉招式");
  rerender(<TeamMemberEditor {...props} member={member} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  rerender(<TeamMemberEditor {...props} member={{ ...boss, skills: { four: ["native", null, null, null] } }} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("首领形态即使血脉字段普通也提示，未选中的冲突队员仍有标记", () => {
  const boss = { ...member, spiritId: "boss" };
  const props = { index: 1, snapshot, onChange: vi.fn() };
  const { rerender } = render(<><TeamRoster members={[member, boss]} snapshot={snapshot} selectedIndex={0} onSelect={vi.fn()} onApply={vi.fn()} /><TeamMemberEditor {...props} member={boss} /></>);
  expect(screen.getByRole("alert")).toHaveTextContent("血脉招式");
  expect(within(screen.getByRole("button", { name: "编辑测试首领" })).getByText("血脉技能冲突")).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "编辑测试首领" })).getByRole("img", { name: "血脉技能与首领冲突" })).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "编辑测试精灵" })).queryByText("血脉技能冲突")).not.toBeInTheDocument();
  const repaired = { ...boss, skills: { four: ["native"] } };
  rerender(<TeamRoster members={[member, repaired]} snapshot={snapshot} selectedIndex={0} onSelect={vi.fn()} onApply={vi.fn()} />);
  expect(screen.queryByText("血脉技能冲突")).not.toBeInTheDocument();
});
