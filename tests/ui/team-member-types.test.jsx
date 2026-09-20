import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TeamMemberEditor } from "../../src/components/TeamMemberEditor.jsx";
import snapshot from "../../data/snapshots/current.json";
import { createTeamMember } from "../../src/state/team-presets.js";

const spirit = (name) => snapshot.spirits.find((entry) => entry.fullName === name);
const skill = (type, category) => snapshot.skills.find((entry) => entry.type === type && (!category || entry.category === category));
const make = (name, four) => ({ ...createTeamMember(snapshot, spirit(name).id), skills: { four, single: skill("龙").id } });
const region = () => screen.getByRole("region", { name: "旧玩具队伍技能系别" });

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
