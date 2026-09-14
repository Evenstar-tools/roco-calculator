import { render, screen, fireEvent, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import TypeCandidates from "../../src/components/TypeCandidates.jsx";
import { createDurabilityRanking, getDurabilityMultipliers } from "../../src/features/team-ability/domain/durability-ranking.js";

const snapshot = { spirits: [80, 140, 100].map((hp, index) => ({ id: String(index), fullName: `候选${index}`, types: ["水"], stage: "首领", sourceCategory: "首领形态", raceStats: { hp, physicalDefense: 110, magicalDefense: 90, physicalAttack: 80, magicalAttack: 80, speed: 90 } })) };

test("候选顺序复用耐久榜，筛选与模板代入保持一致", () => {
  const apply = vi.fn();
  render(<TypeCandidates type="火" snapshot={snapshot} onClose={vi.fn()} onApply={apply} />);
  for (const metric of ["combined", "physical", "magical"]) {
    fireEvent.change(screen.getByLabelText("候选排序"), { target: { value: metric } });
    const expected = createDurabilityRanking({ spirits: snapshot.spirits, attackType: "火", multipliers: getDurabilityMultipliers().filter(value => value < 1), sortBy: metric });
    expect(screen.getAllByRole("button", { name: /^查看候选/ }).map(button => button.textContent.match(/候选\d/)[0])).toEqual(expected.rows.map(row => row.spirit.fullName));
  }
  fireEvent.change(screen.getByLabelText("搜索抗性候选"), { target: { value: "候选1" } });
  fireEvent.click(screen.getByRole("button", { name: /^查看候选1/ }));
  fireEvent.click(screen.getByRole("button", { name: "代入防御方复算" }));
  expect(apply).toHaveBeenCalledWith(snapshot.spirits[1], expect.objectContaining({ natureId: "grounded", displayIvs: expect.objectContaining({ hp: 60 }) }));
  expect(within(screen.getByRole("region")).getAllByRole("button", { name: /^查看候选/ })).toHaveLength(1);
});
