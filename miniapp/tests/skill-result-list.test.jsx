import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SingleSkillResultRow from "../src/components/SingleSkillResultRow.jsx";

const skill = {
  basePower: 80,
  category: "magical",
  cost: 2,
  id: "skill-light",
  name: "光球",
  type: "光",
};

describe("single skill result row", () => {
  test("separates skill replacement from opening its damage details", () => {
    const onOpenResult = vi.fn();
    render(
      <SingleSkillResultRow
        choices={[skill]}
        fallbackSkill={skill}
        label="攻击方单技能"
        onChange={vi.fn()}
        onOpenResult={onOpenResult}
        row={{
          hpPercent: 18.5,
          skillName: "光球",
          status: "exact",
          totalDamage: 79,
        }}
        selected
        value="skill-light"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "选择攻击方单技能" }),
    );
    expect(screen.getByRole("dialog", { name: "攻击方单技能选项" }))
      .toBeInTheDocument();
    fireEvent.click(
      screen.getAllByLabelText("关闭攻击方单技能选项")[0],
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "查看光球伤害 79 18.5% HP",
      }),
    );
    expect(onOpenResult).toHaveBeenCalledTimes(1);
  });

  test("uses compact centered metric styles for long damage results", () => {
    const { container } = render(
      <SingleSkillResultRow
        choices={[skill]}
        fallbackSkill={skill}
        label="攻击方单技能"
        onChange={vi.fn()}
        row={{
          hpPercent: 999.9,
          skillName: "光球",
          status: "exact",
          totalDamage: 1234567,
        }}
        value="skill-light"
      />,
    );

    expect(container.querySelector(".skill-result-row__result"))
      .toHaveClass("skill-result-row__result--long");
    expect(container.querySelector(".skill-result-row__damage"))
      .toHaveClass("skill-result-row__damage--tight");
    expect(container.querySelector(".skill-result-row__percent"))
      .toHaveClass("skill-result-row__percent--compact");
  });

});
