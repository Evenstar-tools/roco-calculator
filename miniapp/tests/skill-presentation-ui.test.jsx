import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SkillConditionEditor from "../src/components/SkillConditionEditor.jsx";
import SkillIcon from "../src/components/SkillIcon.jsx";
import SkillSlots from "../src/components/SkillSlots.jsx";
import TraitConditionEditor from "../src/components/TraitConditionEditor.jsx";
import {
  getStatusSkillTriggerPreview,
  resolveSkillStatusActivation,
} from "../src/shared/domain/skill-status-effects.js";

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

  test("replaces power controls with repeatable status trigger controls", () => {
    const onTriggerCountChange = vi.fn();
    const feather = {
      basePower: 0,
      category: "status",
      id: "feather",
      name: "\u7fbd\u5316\u52a0\u901f",
    };

    render(
      <SkillConditionEditor
        context={{}}
        direction={{ hitCount: 2, overrides: {} }}
        onContextChange={vi.fn()}
        onDirectionChange={vi.fn()}
        skill={feather}
        statusActivation={{
          active: true,
          available: true,
          onToggle: vi.fn(),
          onTriggerCountChange,
        }}
      />,
    );

    expect(screen.getByLabelText("\u72b6\u6001\u89e6\u53d1\u4e0e\u6548\u679c\u9884\u89c8"))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "\u53d6\u6d88\u72b6\u6001\u89e6\u53d1" }))
      .toHaveTextContent("\u5df2\u89e6\u53d1");
    expect(screen.getByLabelText("\u72b6\u6001\u89e6\u53d1\u6b21\u6570"))
      .toHaveValue(2);
    expect(screen.getByText("\u5168\u6280\u80fd\u5a01\u529b +40")).toBeInTheDocument();
    expect(screen.queryByLabelText("\u9759\u6001\u5a01\u529b")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("\u663e\u793a\u5a01\u529b")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "\u589e\u52a0\u72b6\u6001\u89e6\u53d1\u6b21\u6570",
    }));
    expect(onTriggerCountChange).toHaveBeenCalledWith(3);
  });

  test("uses status trigger count in the resolved cumulative effect", () => {
    const feather = {
      basePower: 0,
      category: "status",
      name: "\u7fbd\u5316\u52a0\u901f",
    };

    expect(getStatusSkillTriggerPreview(feather, { triggerCount: 2 }))
      .toMatchObject({
        cumulativeEffect: "\u5168\u6280\u80fd\u5a01\u529b +40",
        repeatable: true,
        unitEffect: "\u5168\u6280\u80fd\u5a01\u529b +20",
      });
    expect(resolveSkillStatusActivation(feather, { effectiveHitCount: 2 }))
      .toMatchObject({ deltas: { ownFixedPower: 40 } });
  });

  test("keeps a status skill's trigger count separate from its hit coefficient", () => {
    const onHitCountChange = vi.fn();
    const onTriggerCountChange = vi.fn();
    const flower = {
      basePower: 0,
      category: "status",
      description: "2连击，每次连击自己获得魔攻+60%。",
      id: "fireworks",
      name: "花炮",
    };

    render(
      <SkillConditionEditor
        context={{}}
        direction={{ hitCount: 3, statusTriggerCount: 2, overrides: {} }}
        onContextChange={vi.fn()}
        onDirectionChange={vi.fn()}
        skill={flower}
        statusActivation={{
          active: true,
          available: true,
          onHitCountChange,
          onToggle: vi.fn(),
          onTriggerCountChange,
        }}
      />,
    );

    expect(screen.getByLabelText("状态触发次数")).toHaveValue(2);
    expect(screen.getByLabelText("每次连击数")).toHaveValue(3);
    expect(screen.getByText("己方双攻 +36层")).toBeInTheDocument();
    expect(screen.getByText("每次触发（3 连击）：己方双攻 +18层"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "增加每次连击数",
    }));
    expect(onHitCountChange).toHaveBeenCalledWith(4);
  });

  test("keeps base power and default hit count visible beside the resolved power controls", () => {
    render(
      <SkillConditionEditor
        context={{}}
        direction={{ overrides: {} }}
        onContextChange={vi.fn()}
        onDirectionChange={vi.fn()}
        result={{ hitCount: 5, staticPower: 140 }}
        skill={{
          basePower: 20,
          category: "magical",
          description: "造成魔伤，5连击。",
          id: "midnight-noise",
          name: "午夜噪音",
        }}
      />,
    );

    expect(screen.getByLabelText("基础技能参数"))
      .toHaveTextContent("基础威力 20");
    expect(screen.getByLabelText("基础技能参数"))
      .toHaveTextContent("技能默认 5 连击");
    expect(screen.getByLabelText("连击数")).toHaveValue(5);
    expect(screen.getByLabelText("静态威力")).toHaveValue(140);
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

describe("skill icon presentation", () => {
  test("falls back to the element icon after an image error", () => {
    const { container } = render(
      <SkillIcon
        className="skill-picker__trigger-icon"
        skill={{
          iconUrl: "https://images.example.test/skill.png",
          type: "光",
        }}
      />,
    );

    const image = container.querySelector(".skill-icon");
    expect(image).toHaveAttribute("src", "https://images.example.test/skill.png");
    fireEvent.error(image);

    const fallback = container.querySelector(".skill-icon--fallback");
    expect(fallback).toBeInTheDocument();
    expect(fallback.querySelector(".element-icon"))
      .toHaveAttribute("alt", "光系图标");
  });

  test("uses the element icon when a skill has no secure image", () => {
    const { container } = render(<SkillIcon skill={{ type: "水" }} />);

    expect(container.querySelector(".skill-icon--fallback"))
      .toBeInTheDocument();
    expect(container.querySelector(".element-icon"))
      .toHaveAttribute("alt", "水系图标");
  });
});
