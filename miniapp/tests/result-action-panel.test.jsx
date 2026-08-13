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
    ],
    status: [
      {
        category: "status",
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

    fireEvent.click(
      screen.getByRole("button", { name: "触发勇猛" }),
    );
    expect(onApplyAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trait", value: false }),
    );
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

  test("opens the first non-empty category instead of an empty status tab", () => {
    const actions = actionsFixture();
    actions.status = [];
    render(
      <ResultActionPanel
        actions={actions}
        onApplyAction={() => {}}
        onControlChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "防御" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("羽翼庇护触发项")).toBeInTheDocument();
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
        actions={{ defense: [], modifiers: [action], status: [] }}
        onApplyAction={() => {}}
        onControlChange={onControlChange}
      />,
    );

    expect(screen.getAllByLabelText("裁决触发项")).toHaveLength(1);
    expect(screen.getByLabelText("触发层数")).toHaveValue(3);
    expect(screen.getByLabelText("每层攻防")).toHaveValue(20);
    fireEvent.input(screen.getByLabelText("触发层数"), {
      target: { value: "2" },
    });
    expect(onControlChange).toHaveBeenCalledWith(action, controls[0], 2);
  });
});
