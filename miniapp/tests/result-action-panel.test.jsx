import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ResultActionPanel from "../src/components/ResultActionPanel.jsx";

function actionsFixture() {
  return {
    defense: [
      {
        category: "defense",
        controls: [],
        description: "减伤80%",
        key: "skill:attacker:four:1",
        kind: "skill",
        name: "羽翼庇护",
        source: "技能",
      },
    ],
    modifiers: [
      {
        category: "modifiers",
        context: { applyAttackBoost: false },
        controls: [
          {
            defaultValue: false,
            id: "applyAttackBoost",
            key: "applyAttackBoost",
            label: "物攻提高",
            type: "boolean",
          },
        ],
        description: "提高物攻",
        key: "skill:attacker:four:0",
        kind: "skill",
        name: "蒸汽进行曲",
        source: "技能",
      },
      {
        category: "modifiers",
        control: {
          canonicalKey: "activated",
          defaultValue: false,
          id: "activated",
          label: "主动触发",
          type: "boolean",
        },
        controls: [],
        description: "触发特性",
        key: "trait:attacker:activated",
        kind: "trait",
        name: "勇猛",
        source: "特性",
        value: false,
      },
    ],
  };
}

describe("result action panel", () => {
  test("switches categories and applies a skill without changing the page", () => {
    const onApplyAction = vi.fn();
    const onControlChange = vi.fn();
    render(
      <ResultActionPanel
        actions={actionsFixture()}
        onApplyAction={onApplyAction}
        onControlChange={onControlChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    const action = screen.getByLabelText("蒸汽进行曲触发项");
    expect(within(action).getByText("未开启"))
      .toHaveClass("condition-editor__toggle-state");
    fireEvent.click(within(action).getByRole("button", { name: "物攻提高" }));
    expect(onControlChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "蒸汽进行曲" }),
      expect.objectContaining({ key: "applyAttackBoost" }),
      true,
    );

    fireEvent.click(
      within(action).getByRole("button", { name: "触发蒸汽进行曲" }),
    );
    expect(onApplyAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "skill", name: "蒸汽进行曲" }),
    );
  });

  test("toggles a trait trigger from the same action card", () => {
    const onApplyAction = vi.fn();
    render(
      <ResultActionPanel
        actions={actionsFixture()}
        onApplyAction={onApplyAction}
        onControlChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    fireEvent.click(
      screen.getByRole("button", { name: "触发勇猛" }),
    );
    expect(onApplyAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trait", value: false }),
    );
  });

  test("keeps long skill and trait toggles in compact aligned control slots", () => {
    const longToggle = {
      defaultValue: false,
      id: "counterTriggered",
      key: "counterTriggered",
      label: "触发应对状态",
      type: "boolean",
    };
    const action = {
      category: "modifiers",
      context: { counterTriggered: false },
      controls: [longToggle],
      description: "切换后更新技能结算。",
      key: "skill:attacker:four:0",
      kind: "skill",
      name: "跌落",
      source: "技能",
    };

    render(
      <ResultActionPanel
        actions={{ defense: [], modifiers: [action] }}
        onApplyAction={() => {}}
        onControlChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    const toggle = screen.getByRole("button", { name: "触发应对状态" });
    expect(toggle.parentElement)
      .toHaveClass("result-actions__control-slot--boolean");
    expect(within(toggle).getByText("触发应对状态"))
      .toHaveClass("condition-editor__toggle-label");
    expect(within(toggle).getByText("未开启"))
      .toHaveClass("condition-editor__toggle-state");
  });

  test("keeps the selected category when actions refresh", () => {
    const { rerender } = render(
      <ResultActionPanel
        actions={actionsFixture()}
        onApplyAction={() => {}}
        onControlChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "防御" }));

    rerender(
      <ResultActionPanel
        actions={{ ...actionsFixture() }}
        onApplyAction={() => {}}
        onControlChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "防御" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("opens skill parameters first and removes the duplicate status category", () => {
    render(
      <ResultActionPanel
        actions={actionsFixture()}
        onApplyAction={() => {}}
        onControlChange={() => {}}
        parameterContent={<span>应对攻击已开启</span>}
        parameterSummary="烈焰冲击"
      />,
    );

    expect(screen.getByRole("button", { name: "技能参数" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("应对攻击已开启")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "状态" }))
      .not.toBeInTheDocument();
  });

  test("explains an empty defense or modifier category by its future trigger types", () => {
    render(
      <ResultActionPanel
        actions={{ defense: [], modifiers: [] }}
        onApplyAction={() => {}}
        onControlChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "防御" }));
    expect(screen.getByText(
      "暂无防御类效果。可触发：防御技能、防守特性、应对成功后的附加增益。",
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    expect(screen.getByText(
      "暂无增减类效果。可触发：状态技能、攻击特性，以及能力或威力变化效果。",
    )).toBeInTheDocument();
  });

  test("renders one trait card with all of its parameter controls", () => {
    const onControlChange = vi.fn();
    const controls = [
      {
        canonicalKey: "trait.judgment.stacks",
        defaultValue: 0,
        id: "judgmentStacks",
        label: "触发层数",
        min: 0,
        type: "number",
      },
      {
        canonicalKey: "trait.judgment.attack",
        defaultValue: 20,
        id: "judgmentAttack",
        label: "每层攻防",
        min: 0,
        type: "number",
      },
    ];
    const action = {
      category: "modifiers",
      control: null,
      controls,
      description: "造成克制伤害后获得增益。",
      key: "trait:attacker:裁决",
      kind: "trait",
      name: "裁决",
      side: "attacker",
      source: "特性",
      values: {
        "trait.judgment.attack": 20,
        "trait.judgment.stacks": 3,
      },
    };
    render(
      <ResultActionPanel
        actions={{ defense: [], modifiers: [action] }}
        onApplyAction={() => {}}
        onControlChange={onControlChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    expect(screen.getAllByLabelText("裁决触发项")).toHaveLength(1);
    expect(screen.getByLabelText("触发层数")).toHaveValue(3);
    expect(screen.getByLabelText("每层攻防")).toHaveValue(20);
    fireEvent.input(screen.getByLabelText("触发层数"), {
      target: { value: "2" },
    });
    expect(onControlChange).toHaveBeenCalledWith(action, controls[0], 2);
  });

  test("adjusts trait numeric controls with explicit touch steppers", () => {
    const onControlChange = vi.fn();
    const control = {
      canonicalKey: "trait.judgment.stacks",
      defaultValue: 0,
      id: "judgmentStacks",
      label: "触发层数",
      max: 3,
      min: 0,
      step: 1,
      type: "number",
    };
    const action = {
      category: "modifiers",
      controls: [control],
      description: "造成克制伤害后获得增益。",
      key: "trait:attacker:裁决",
      kind: "trait",
      name: "裁决",
      side: "attacker",
      source: "特性",
      values: {
        "trait.judgment.stacks": 2,
      },
    };
    render(
      <ResultActionPanel
        actions={{ defense: [], modifiers: [action] }}
        onApplyAction={() => {}}
        onControlChange={onControlChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    fireEvent.click(screen.getByRole("button", { name: "触发层数减少" }));
    expect(onControlChange).toHaveBeenLastCalledWith(action, control, 1);

    fireEvent.click(screen.getByRole("button", { name: "触发层数增加" }));
    expect(onControlChange).toHaveBeenLastCalledWith(action, control, 3);
    expect(screen.getByRole("button", { name: "触发层数减少" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "触发层数增加" })).toBeEnabled();
  });

  test("disables a trait stepper only at its actual boundary", () => {
    const control = {
      canonicalKey: "trait.judgment.stacks",
      defaultValue: 0,
      id: "judgmentStacks",
      label: "触发层数",
      max: 3,
      min: 0,
      step: 1,
      type: "number",
    };
    render(
      <ResultActionPanel
          actions={{
            defense: [],
          modifiers: [{
            category: "modifiers",
            controls: [control],
            key: "trait:attacker:裁决",
            kind: "trait",
            name: "裁决",
            side: "attacker",
            source: "特性",
            values: { "trait.judgment.stacks": 0 },
          }],
          }}
        onApplyAction={() => {}}
        onControlChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    expect(screen.getByRole("button", { name: "触发层数减少" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "触发层数增加" })).toBeEnabled();
  });
});
