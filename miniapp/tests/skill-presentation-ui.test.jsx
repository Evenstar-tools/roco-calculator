import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SkillConditionEditor from "../src/components/SkillConditionEditor.jsx";
import SkillSlots from "../src/components/SkillSlots.jsx";
import TraitConditionEditor from "../src/components/TraitConditionEditor.jsx";

describe("skill and trait presentation UI", () => {
  test("shows one note for the selected four-skill row", () => {
    render(
      <SkillSlots
        choices={[]}
        fallbackSkills={[
          { id: "a", name: "A", type: "\u5149" },
          { id: "b", name: "B", type: "\u706b" },
        ]}
        label={"\u653b\u51fb\u65b9"}
        onChange={vi.fn()}
        onSelect={vi.fn()}
        presentation={{
          description: "\u5f53\u524d\u6280\u80fd\u8bf4\u660e",
          effectHint: "\u5f53\u524d\u89c4\u5219\u63d0\u793a",
        }}
        rows={[]}
        selectedIndex={0}
        values={["a", "b"]}
      />,
    );

    expect(screen.getByLabelText("\u653b\u51fb\u65b9\u5f53\u524d\u6280\u80fd\u8bf4\u660e"))
      .toHaveTextContent("\u5f53\u524d\u6280\u80fd\u8bf4\u660e");
    expect(screen.getByText("\u5f53\u524d\u89c4\u5219\u63d0\u793a")).toBeInTheDocument();
  });

  test("shows description and effect before skill controls", () => {
    render(
      <SkillConditionEditor
        context={{}}
        direction={{ hitCount: 1, overrides: {} }}
        onContextChange={vi.fn()}
        onDirectionChange={vi.fn()}
        presentation={{
          description: "\u6280\u80fd\u539f\u59cb\u8bf4\u660e",
          effectHint: "\u5b9e\u65f6\u89e3\u7b97\u63d0\u793a",
          inputs: [],
        }}
        skill={{ id: "skill", name: "\u6d4b\u8bd5\u6280\u80fd" }}
      />,
    );

    expect(screen.getByText("\u6280\u80fd\u539f\u59cb\u8bf4\u660e")).toBeInTheDocument();
    expect(screen.getByText("\u5b9e\u65f6\u89e3\u7b97\u63d0\u793a")).toBeInTheDocument();
  });

  test("keeps a bonus-only trait visible", () => {
    render(
      <TraitConditionEditor
        onChange={vi.fn()}
        values={{}}
        views={{
          attacker: {
            automaticStack: null,
            controls: [],
            description: "\u81ea\u5df1\u643a\u5e26\u7684\u97f3\u6ce2\u6280\u80fd\u5a01\u529b\u63d0\u5347\u3002",
            name: "\u6362\u789f",
            ownerSide: "attacker",
            skillPowerBonuses: [
              { fixedPowerAdd: 15, perHit: false, skillName: "\u97f3\u6ce2\u5f39" },
            ],
            sourceDescription: "\u81ea\u5df1\u643a\u5e26\u7684\u97f3\u6ce2\u6280\u80fd\u5a01\u529b\u63d0\u5347\u3002",
          },
          defender: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "\u5c55\u5f00\u7279\u6027\u4e0e\u72b6\u6001",
    }));
    expect(screen.getByText("\u97f3\u6ce2\u5f39 +15")).toBeInTheDocument();
  });
});
