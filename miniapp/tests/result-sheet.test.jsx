import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import ResultSheet from "../src/components/ResultSheet.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

function createSnapshot() {
  return {
    meta: { id: "data-v1", rulesVersion: "rules-v1" },
    spirits: [
      {
        id: "spirit-a",
        fullName: "烈焰兽",
        raceStats: {
          hp: 120,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 140,
          physicalDefense: 100,
          speed: 100,
        },
        types: ["火"],
      },
      {
        id: "spirit-b",
        fullName: "潮汐兽",
        raceStats: {
          hp: 150,
          magicalAttack: 115,
          magicalDefense: 120,
          physicalAttack: 100,
          physicalDefense: 125,
          speed: 90,
        },
        types: ["水"],
      },
    ],
    skills: [
      {
        basePower: 80,
        category: "physical",
        id: "skill-a",
        name: "烈焰冲击",
        type: "火",
      },
      {
        basePower: 50,
        category: "physical",
        id: "skill-b",
        name: "连环火花",
        type: "火",
      },
      {
        basePower: 70,
        category: "magical",
        id: "skill-c",
        name: "潮汐冲击",
        type: "水",
      },
      {
        basePower: 40,
        category: "physical",
        id: "skill-d",
        name: "火花",
        type: "火",
      },
    ],
    learnsets: [
      {
        spiritId: "spirit-a",
        skillIds: ["skill-a", "skill-b", "skill-d"],
      },
      {
        spiritId: "spirit-b",
        skillIds: ["skill-c"],
      },
    ],
    traits: [],
    typeChart: {
      matrix: [
        [1, 1],
        [1, 1],
      ],
      types: ["火", "水"],
    },
  };
}

function renderWorkspace() {
  const snapshot = createSnapshot();
  const store = createCalculatorStore(snapshot);
  store.dispatch({ type: "mode/set", value: "four" });
  store.dispatch({
    index: 1,
    side: "attacker",
    type: "side/set-four-skill",
    value: "skill-b",
  });

  return {
    store,
    ...render(
      <BattleWorkspace
        petImages={{}}
        snapshot={snapshot}
        store={store}
      />,
    ),
  };
}

describe("result bar and sheet", () => {
  test("opens a modal scroll view from a native result button", () => {
    renderWorkspace();

    const trigger = screen.getByRole("button", {
      name: "展开伤害结果",
    });
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "伤害结果" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement).toHaveAttribute(
      "data-catch-move",
      "true",
    );
    expect(dialog.querySelector("[data-scroll-y='true']")).not.toBeNull();
    expect(screen.getByText("剩余生命")).toBeInTheDocument();
    const shareButtons = screen.getAllByRole("button", {
      name: "分享当前计算",
    });
    expect(shareButtons).toHaveLength(2);
    for (const button of shareButtons) {
      expect(button).toHaveAttribute("data-open-type", "share");
    }
  });

  test("selects a skill row and closes back to the result trigger", () => {
    const { store } = renderWorkspace();
    const trigger = screen.getByRole("button", {
      name: "展开伤害结果",
    });
    fireEvent.click(trigger);

    fireEvent.click(
      screen.getByRole("button", { name: "查看连环火花结果" }),
    );
    expect(
      store.getState().directions.forward.selectedSkillIndex,
    ).toBe(1);

    fireEvent.click(
      screen.getByRole("button", { name: "关闭伤害结果" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "伤害结果" }),
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("tabindex", "0");
  });

  test("renders unavailable HP without converting null to zero percent", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            remainingHp: null,
            remainingHpPercent: undefined,
            skillName: "烈焰冲击",
            totalDamage: 88,
          },
          status: "exact",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "伤害结果" });
    expect(
      dialog.querySelector(".result-sheet__value"),
    ).toHaveTextContent("--");
    const metricUnits = dialog.querySelectorAll(
      ".result-sheet__metric-unit",
    );
    expect(metricUnits[metricUnits.length - 1]).toHaveTextContent("--");
    expect(dialog).not.toHaveTextContent("0%");
  });

  test("keeps real zero damage and zero remaining HP visible", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            remainingHp: 0,
            remainingHpPercent: 0,
            skillName: "烈焰冲击",
            totalDamage: 0,
          },
          status: "exact",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "伤害结果" });
    expect(
      dialog.querySelector(".result-sheet__damage"),
    ).toHaveTextContent("0");
    expect(
      dialog.querySelector(".result-sheet__value"),
    ).toHaveTextContent("0");
    expect(dialog).toHaveTextContent("0%");
  });

  test("uses a fixed unresolved result announcement", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          message: "任意内部错误文本",
          rows: [],
          selectedResult: null,
          status: "unresolved",
        }}
      />,
    );

    expect(screen.getByText("伤害暂未解析")).toBeInTheDocument();
  });
});
