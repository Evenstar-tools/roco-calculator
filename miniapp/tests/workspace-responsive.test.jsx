import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { getNature } from "../src/shared/domain/natures.js";
import { createCalculatorStore } from "../src/state/calculator-store.js";

function createSnapshot() {
  return {
    meta: { id: "data-v1", rulesVersion: "rules-v1" },
    spirits: [
      {
        id: "spirit-a",
        fullName: "迪莫",
        raceStats: {
          hp: 120,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 120,
          physicalDefense: 100,
          speed: 100,
        },
        types: ["光"],
      },
      {
        id: "spirit-b",
        fullName: "圣光迪莫",
        raceStats: {
          hp: 140,
          magicalAttack: 110,
          magicalDefense: 120,
          physicalAttack: 100,
          physicalDefense: 120,
          speed: 90,
        },
        types: ["光"],
      },
    ],
    skills: [
      {
        basePower: 80,
        category: "physical",
        cost: 3,
        id: "skill-a",
        name: "闪光冲击",
        type: "光",
      },
      {
        basePower: 60,
        category: "magical",
        cost: 2,
        id: "skill-b",
        name: "光球",
        type: "光",
      },
    ],
    learnsets: [
      { spiritId: "spirit-a", skillIds: ["skill-a", "skill-b"] },
      { spiritId: "spirit-b", skillIds: ["skill-b", "skill-a"] },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["光"] },
  };
}

describe("responsive battle workspace", () => {
  test("keeps the inline current-skill parameters exclusive to single mode", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.getByText("当前技能参数")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));

    expect(screen.queryByText("当前技能参数")).not.toBeInTheDocument();
  });

  test("groups battle conditions and hides duplicate or advanced controls by default", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.queryByLabelText("当前计算能力等级")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    expect(screen.getByText("常用条件")).toBeInTheDocument();
    expect(screen.queryByLabelText("能力等级")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "战斗条件" }))
      .getByLabelText("当前计算能力等级")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开印记" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "展开高级参数" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("减伤比例")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "攻击方正面印记萌芽" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开高级参数" }));
    expect(screen.getByLabelText("减伤比例")).toBeInTheDocument();
    expect(screen.getByLabelText("最终伤害倍率")).toBeInTheDocument();
  });

  test("shows rain turns only while rainy weather is selected", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    expect(screen.getByRole("button", { name: "无天气" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("雨天回合")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "雨天" }));
    expect(screen.getByLabelText("雨天回合")).toHaveValue(8);

    fireEvent.click(screen.getByRole("button", { name: "无天气" }));
    expect(screen.queryByLabelText("雨天回合")).not.toBeInTheDocument();
  });

  test("keeps both combatants visible while exposing phone and iPad work surfaces", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);

    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.getByLabelText("对战对象")).toHaveTextContent("迪莫");
    expect(screen.getByLabelText("对战对象")).toHaveTextContent("圣光迪莫");
    expect(screen.getByLabelText("攻击方快速配置")).toBeInTheDocument();
    expect(screen.getByLabelText("防守方快速配置")).toBeInTheDocument();
    expect(screen.getByLabelText("攻击方技能面板")).toBeInTheDocument();
    expect(screen.getByLabelText("防守方技能面板")).toBeInTheDocument();
  });

  test("renders real type icons and compact skill metadata in four-skill mode", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));

    expect(screen.getAllByRole("img", { name: "光系图标" }).length)
      .toBeGreaterThan(0);
    expect(screen.getAllByText("物理").length).toBeGreaterThan(0);
    expect(screen.getAllByText("能量 3").length).toBeGreaterThan(0);

    const firstSkillTrigger = screen.getAllByRole("button", {
      name: /选择攻击方技能/u,
    })[0];
    const firstSkillMeta = within(firstSkillTrigger).getByText("物理")
      .parentElement;
    expect(firstSkillMeta).toHaveClass("skill-picker__meta");
    expect(firstSkillMeta.parentElement).toHaveClass(
      "skill-picker__trigger-copy",
    );
  });

  test("exposes four-skill groups as a compact two-by-two phone matrix", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));

    const attackerSkills = screen.getByLabelText("攻击方四技能");
    expect(attackerSkills).toHaveClass("skill-slots--matrix");
    expect(attackerSkills.querySelectorAll(".skill-result-row")).toHaveLength(4);
  });

  test("keeps nature and 60-point shortcuts directly on the main surface", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attackerControls = screen.getByLabelText("攻击方快速属性配置");
    const defenderControls = screen.getByLabelText("防守方快速属性配置");

    expect(within(attackerControls).getByText("性格")).toBeInTheDocument();
    expect(within(attackerControls).getByText("个体")).toBeInTheDocument();
    expect(within(defenderControls).getByText("性格")).toBeInTheDocument();
    expect(within(defenderControls).getByText("个体")).toBeInTheDocument();
    expect(attackerControls.querySelector(".quick-controls__axis")).toBeNull();
    expect(attackerControls.querySelectorAll(".quick-controls__stat-label"))
      .toHaveLength(12);
    expect(attackerControls.querySelectorAll(
      ".quick-controls__status-badge--iv",
    )).toHaveLength(6);

    fireEvent.click(within(attackerControls).getByRole("button", {
      name: "攻击方速度正面性格",
    }));
    expect(getNature(store.getState().sides.attacker.nature).upStat).toBe(
      "speed",
    );
    expect(attackerControls.querySelectorAll(
      ".quick-controls__status-badge--nature",
    )).toHaveLength(1);
    const summary = attackerControls.querySelector(".quick-controls__summary");
    expect(summary).toHaveAttribute("aria-label", expect.stringContaining("速度↑"));
    expect(summary).toHaveTextContent("个体全选");
    expect(summary).not.toHaveTextContent("60");
    expect(summary.querySelector(".quick-controls__summary-arrow--up"))
      .toHaveTextContent("↑");
    expect(summary.querySelector(".quick-controls__summary-arrow--down"))
      .toHaveTextContent("↓");

    fireEvent.click(within(attackerControls).getByRole("button", {
      name: "攻击方生命个体加点",
    }));
    expect(store.getState().sides.attacker.displayIvs.hp).toBe(0);
    expect(attackerControls.querySelectorAll(
      ".quick-controls__status-badge--iv",
    )).toHaveLength(5);
    expect(summary).toHaveTextContent("个体物攻 · 魔攻 · 速度 · 物防 · 魔防");
    expect(summary).not.toHaveTextContent("60");
  });

  test("opens full stat editing from the quick configuration heading", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const detailTrigger = screen.getByRole("button", {
      name: "打开攻击方详细参数",
    });
    expect(detailTrigger.tagName).toBe("DIV");
    fireEvent.click(detailTrigger);

    expect(screen.getByRole("dialog", { name: "攻击方参数设置" }))
      .toBeInTheDocument();
  });

  test("provides short phone copy without removing descriptive mode labels", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.getByText("单", { selector: ".mode-switch__short-label" }))
      .toBeInTheDocument();
    expect(screen.getByText("单技能", { selector: ".mode-switch__long-label" }))
      .toBeInTheDocument();
    expect(screen.getByText("四", { selector: ".mode-switch__short-label" }))
      .toBeInTheDocument();
  });

  test("moves one persistent selected state between the two skill modes", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const single = screen.getByRole("button", { name: "单技能模式" });
    const four = screen.getByRole("button", { name: "四技能模式" });

    expect(single).toHaveAttribute("aria-pressed", "true");
    expect(single).toHaveClass("mode-switch__button--active");
    expect(four).toHaveAttribute("aria-pressed", "false");
    expect(four).not.toHaveClass("mode-switch__button--active");

    fireEvent.click(four);

    expect(single).toHaveAttribute("aria-pressed", "false");
    expect(single).not.toHaveClass("mode-switch__button--active");
    expect(four).toHaveAttribute("aria-pressed", "true");
    expect(four).toHaveClass("mode-switch__button--active");
  });

  test("keeps advanced battle inputs behind a compact condition sheet", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.queryByRole("dialog", { name: "战斗条件" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    expect(screen.getByRole("dialog", { name: "战斗条件" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭战斗条件" }));
    expect(screen.queryByRole("dialog", { name: "战斗条件" }))
      .not.toBeInTheDocument();
  });
});
