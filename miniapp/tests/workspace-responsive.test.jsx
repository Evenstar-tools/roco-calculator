import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { getNature } from "../src/shared/domain/natures.js";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { createCalculationView } from "../src/view-models/calculation.js";
import { getSkillEffectInputs } from "../src/shared/domain/skill-effects.js";

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
        iconUrl: "https://images.example.test/flash-impact.png",
        name: "闪光冲击",
        type: "光",
      },
      {
        basePower: 60,
        category: "magical",
        cost: 2,
        id: "skill-b",
        iconUrl: "https://images.example.test/light-orb.png",
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
  test.each([['single', 'forward'], ['four', 'forward'], ['single', 'reverse'], ['four', 'reverse']])(
    "%s/%s 下注暗一键设自身49%%并复算，不执行攻击且可一步撤回",
    (mode, direction) => {
      const snapshot = createSnapshot();
      snapshot.skills[0].name = "下注";
      const store = createCalculatorStore(snapshot);
      store.dispatch({ type: "mode/set", value: mode });
      for (const side of ['attacker', 'defender']) {
        store.dispatch({ type: "side/set-single-skill", side, value: "skill-a" });
        store.dispatch({ type: "side/set-four-skill", side, index: 0, value: "skill-a" });
      }
      render(<BattleWorkspace quickUndoEnabled snapshot={snapshot} store={store} />);
      if (direction === 'reverse') fireEvent.click(screen.getByRole('button', { name: '切换计算方向' }));
      if (mode === 'four') fireEvent.click(screen.getByRole('button', { name: '展开伤害结果' }));
      const before = store.getState();
      const healthDirection = direction === 'forward' ? 'reverse' : 'forward';
      const maxHp = createCalculationView(snapshot, before, healthDirection).defenderMaxHp;
      const damageBefore = createCalculationView(snapshot, before, direction).selectedResult.totalDamage;
      fireEvent.click(screen.getByRole('button', { name: '低血加威' }));
      expect(store.getState().directions[healthDirection].context.currentHpPercent).toBe(49);
      expect(screen.getByLabelText('自身生命百分比')).toHaveValue(49);
      expect(store.getState().directions[healthDirection].currentHp).toBe(Math.round(maxHp * 0.49));
      expect(store.getState().directions[direction].currentHp).toBe(before.directions[direction].currentHp);
      expect(createCalculationView(snapshot, store.getState(), direction).selectedResult.totalDamage).toBeGreaterThan(damageBefore);
      if (mode === 'four') fireEvent.click(screen.getByRole('button', { name: '关闭伤害结果' }));
      fireEvent.click(screen.getByRole('button', { name: '撤回上一步' }));
      expect(store.getState()).toEqual(before);
    },
  );

  test.each(['single', 'four'])('%s下注暗后从反向恢复自身满血，不保留旧低血加威', mode => {
    const snapshot = createSnapshot();
    snapshot.skills[0].name = '下注';
    const store = createCalculatorStore(snapshot);
    store.dispatch({ type: 'mode/set', value: mode });
    store.dispatch({ type: 'side/set-single-skill', side: 'attacker', value: 'skill-a' });
    store.dispatch({ type: 'side/set-four-skill', side: 'attacker', index: 0, value: 'skill-a' });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    if (mode === 'four') fireEvent.click(screen.getByRole('button', { name: '展开伤害结果' }));
    fireEvent.click(screen.getByRole('button', { name: '低血加威' }));
    const lowPower = createCalculationView(snapshot, store.getState(), 'forward').selectedResult.staticPower;
    if (mode === 'four') fireEvent.click(screen.getByRole('button', { name: '关闭伤害结果' }));
    fireEvent.click(screen.getByRole('button', { name: '切换计算方向' }));
    const hp = screen.getByLabelText('目标当前生命');
    fireEvent.input(hp, { target: { value: hp.max } });
    fireEvent.click(screen.getByRole('button', { name: '切换计算方向' }));
    if (mode === 'four') fireEvent.click(screen.getByRole('button', { name: '展开伤害结果' }));
    expect(screen.getByLabelText('自身生命百分比')).toHaveValue(100);
    expect(createCalculationView(snapshot, store.getState(), 'forward').selectedResult.staticPower).toBeLessThan(lowPower);
  });

  test('下注自身生命百分比可以清空重填，50%边界和真实HP同步', () => {
    const snapshot = createSnapshot();
    snapshot.skills[0].name = '下注';
    const store = createCalculatorStore(snapshot);
    const betInput = getSkillEffectInputs(snapshot.skills[0]).find(input => input.contextKey === 'betMode');
    store.dispatch({ type: 'direction/update', direction: 'forward', value: { context: { betMode: 'lowHp', [betInput.id]: 'lowHp' } } });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    const input = screen.getByLabelText('自身生命百分比');
    const fullDamage = createCalculationView(snapshot, store.getState(), 'forward').selectedResult.totalDamage;
    fireEvent.input(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(store.getState().directions.reverse.currentHp).toBeNull();
    fireEvent.input(input, { target: { value: '49' } });
    expect(input).toHaveValue(49);
    expect(store.getState().directions.reverse.context.currentHpPercent).toBe(49);
    expect(createCalculationView(snapshot, store.getState(), 'forward').selectedResult.totalDamage).toBeGreaterThan(fullDamage);
    fireEvent.input(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(49);
    fireEvent.input(input, { target: { value: '50' } });
    expect(createCalculationView(snapshot, store.getState(), 'forward').selectedResult.totalDamage).toBe(fullDamage);
    fireEvent.click(screen.getByRole('button', { name: '低血加威' }));
    expect(input).toHaveValue(49);
    fireEvent.input(input, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: '固定加威' }));
    fireEvent.click(screen.getByRole('button', { name: '低血加威' }));
    expect(screen.getByLabelText('自身生命百分比')).toHaveValue(20);
    fireEvent.input(screen.getByLabelText('自身生命百分比'), { target: { value: '999' } });
    fireEvent.keyDown(screen.getByLabelText('自身生命百分比'), { key: 'Enter' });
    expect(screen.getByLabelText('自身生命百分比')).toHaveValue(100);
    expect(store.getState().directions.reverse.context.currentHpPercent).toBe(100);
  });

  test("HP允许清空重填，空白失焦恢复，越界确认收敛且切方向清除草稿", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    const input = screen.getByLabelText("目标当前生命");
    const maximum = Number(input.max);
    fireEvent.input(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(store.getState().directions.forward.currentHp).toBeNull();
    fireEvent.input(input, { target: { value: "123" } });
    expect(input).toHaveValue(123);
    expect(store.getState().directions.forward.currentHp).toBe(123);
    expect(screen.getByLabelText("结果栏目标当前生命")).toHaveValue(123);
    fireEvent.input(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue(123);
    fireEvent.input(input, { target: { value: "9999" } });
    expect(store.getState().directions.forward.currentHp).toBe(123);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue(maximum);
    expect(store.getState().directions.forward.currentHp).toBe(maximum);
    fireEvent.input(input, { target: { value: "-1" } });
    fireEvent.blur(input);
    expect(input).toHaveValue(0);
    fireEvent.input(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "切换计算方向" }));
    expect(input.value).not.toBe("");
    expect(store.getState().directions.reverse.currentHp).toBeNull();
    expect(screen.getByRole("button", { name: "展开伤害结果" })).toHaveTextContent("伤害详情");
    fireEvent.click(screen.getByRole('button', { name: '编辑战斗条件' }));
    const conditionHp = within(screen.getByRole('dialog', { name: '战斗条件' })).getByLabelText('目标当前生命');
    fireEvent.input(conditionHp, { target: { value: '' } });
    expect(conditionHp.value).toBe('');
    fireEvent.input(conditionHp, { target: { value: '123' } });
    expect(conditionHp).toHaveValue(123);
  });

  test("技能天气勾选联动环境与特性，并且切换雨天后同时取消", () => {
    const snapshot = createSnapshot();
    snapshot.skills[0].name = "雪原狩猎";
    snapshot.spirits[0].traitIds = ["snow-soul"];
    snapshot.traits.push({ id: "snow-soul", name: "冰雪魂魄" });
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "当前为暴风雪天气" }));
    expect(store.getState().directions.forward.context.weatherBlizzard).toBe(true);
    expect(store.getState().directions.reverse.context.blizzardWeather).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    const dialog = within(screen.getByRole("dialog", { name: "战斗条件" }));
    expect(dialog.getByRole("button", { name: "暴风雪" })).toHaveAttribute("aria-pressed", "true");
    expect(dialog.getByRole("button", { name: "暴风雪天气" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(dialog.getByRole("button", { name: "雨天" }));
    expect(dialog.getByRole("button", { name: "暴风雪天气" })).toHaveAttribute("aria-pressed", "false");
    expect(store.getState().directions.forward.context.blizzardWeather).toBe(false);
    expect(store.getState().directions.reverse.context.weatherRainTurns).toBe(8);
    fireEvent.click(dialog.getByRole("button", { name: "暴风雪天气" }));
    expect(dialog.getByRole("button", { name: "暴风雪" })).toHaveAttribute("aria-pressed", "true");
    expect(dialog.getByRole("button", { name: "雨天" })).toHaveAttribute("aria-pressed", "false");
  });

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

    expect(screen.getByLabelText("当前计算能力等级")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    expect(screen.getByText("常用条件")).toBeInTheDocument();
    expect(screen.queryByLabelText("能力等级")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "战斗条件" }))
      .queryByLabelText("当前计算能力等级")).not.toBeInTheDocument();
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

    for (const name of ["沙暴", "暴风雪"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("自动联动相关技能与特性，无通用伤害加成")).toBeVisible();
      expect(screen.queryByLabelText("雨天回合")).not.toBeInTheDocument();
    }

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

  test("renders skill art without expanding the compact skill metadata in four-skill mode", () => {
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
    expect(firstSkillTrigger.querySelector(".skill-icon")).toHaveAttribute(
      "src",
      "https://images.example.test/flash-impact.png",
    );
    const firstSkillMeta = within(firstSkillTrigger).getByText("物理")
      .parentElement;
    expect(firstSkillMeta).toHaveClass("skill-picker__meta");
    expect(firstSkillMeta.parentElement).toHaveClass(
      "skill-picker__trigger-copy",
    );
  });

  test("keeps the original element icons available through the skill-icon rollback switch", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(
      <BattleWorkspace
        showSkillIcons={false}
        snapshot={snapshot}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));

    const firstSkillTrigger = screen.getAllByRole("button", {
      name: /选择攻击方技能/u,
    })[0];
    expect(firstSkillTrigger.querySelector(".skill-icon")).toBeNull();
    expect(firstSkillTrigger.querySelector(".element-icon")).toBeInTheDocument();
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
