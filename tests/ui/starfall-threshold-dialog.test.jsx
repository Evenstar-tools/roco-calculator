import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import StarfallThresholdDialog from "../../src/components/StarfallThresholdDialog.jsx";

const domain = vi.hoisted(() => ({
  createStarfallThresholdRanking: vi.fn(),
  evaluateStarfallAt: vi.fn(),
  findStarfallThreshold: vi.fn(),
  getStarfallSelection: vi.fn(),
}));
const applyStarfallThreshold = vi.hoisted(() => vi.fn());

vi.mock("../../src/domain/starfall-thresholds.js", () => ({
  ...domain,
  STARFALL_TEMPLATES: [
    { id: "hp", label: "生命" },
    { id: "defense", label: "生防" },
    { id: "tank", label: "纯肉" },
  ],
}));
vi.mock("../../src/state/starfall-thresholds.js", () => ({ applyStarfallThreshold }));

const snapshot = {
  spirits: [
    { id: "source", fullName: "进攻精灵", types: ["火"] },
    { id: "target", fullName: "目标精灵", types: ["草"] },
  ],
  skills: [{ id: "hit", name: "第一技能" }, { id: "other", name: "第二技能" }],
};
const pendingPromises = [];

function makeSource() {
  return {
    direction: "reverse",
    state: {
      mode: "four",
      sides: {
        attacker: { spiritId: "source", skills: { four: ["hit", "other"] } },
        defender: { spiritId: "target", skills: { four: ["hit", "other"] } },
      },
      directions: { forward: { selectedSkillIndex: 1 }, reverse: { selectedSkillIndex: 0 } },
      marks: { attacker: { negative: { id: "starfall", stacks: 2 } } },
    },
  };
}

function ranking(name = "目标精灵") {
  return {
    rows: [{
      spirit: { ...snapshot.spirits[1], fullName: name },
      templates: ["hp", "defense", "tank"].map((templateId, index) => ({
        templateId, status: "found", minimum: 31 + index,
      })),
    }],
  };
}

function renderDialog(source = makeSource()) {
  const onApply = vi.fn();
  render(<StarfallThresholdDialog snapshot={snapshot} source={source} onClose={vi.fn()} onApply={onApply} />);
  return { source, onApply };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingPromises.length = 0;
  domain.getStarfallSelection.mockImplementation((data, state, direction, selectedSkillIndex) => {
    const sourceSide = direction === "reverse" ? "defender" : "attacker";
    const targetSide = sourceSide === "attacker" ? "defender" : "attacker";
    const index = selectedSkillIndex ?? state.directions[direction].selectedSkillIndex;
    return {
      index, targetSide,
      spirit: data.spirits.find((spirit) => spirit.id === state.sides[sourceSide].spiritId),
      targetSpirit: data.spirits.find((spirit) => spirit.id === state.sides[targetSide].spiritId),
      options: data.skills.map((skill, optionIndex) => ({ index: optionIndex, skill })),
    };
  });
  domain.findStarfallThreshold.mockReturnValue({ status: "found", minimum: 5 });
  domain.evaluateStarfallAt.mockImplementation(({ stacks }) => ({
    damage: 100 + stacks, targetHp: 200, maxHp: 200, lethal: stacks >= 5,
  }));
  domain.createStarfallThresholdRanking.mockResolvedValue(ranking());
  applyStarfallThreshold.mockImplementation(({ state }) => ({ state: { ...state, applied: true } }));
});

test("试算层数只更新预览，不提交主配置", async () => {
  const source = makeSource();
  const original = structuredClone(source.state);
  const { onApply } = renderDialog(source);
  await screen.findByRole("button", { name: "填入 5 层" });

  fireEvent.change(screen.getByRole("spinbutton", { name: "试算星陨层数" }), { target: { value: "8" } });

  expect(screen.getByText("本次伤害 108 · 目标 200 / 200 HP")).toBeVisible();
  expect(domain.evaluateStarfallAt).toHaveBeenLastCalledWith(expect.objectContaining({
    state: source.state, direction: "reverse", selectedSkillIndex: 0, stacks: 8,
  }));
  expect(applyStarfallThreshold).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
  expect(source.state).toEqual(original);
});

test("填入最低层数仅提交一次，使用最低值而非试算值", async () => {
  const { source, onApply } = renderDialog();
  const fill = await screen.findByRole("button", { name: "填入 5 层" });
  fireEvent.change(screen.getByRole("spinbutton", { name: "试算星陨层数" }), { target: { value: "8" } });
  fireEvent.click(fill);

  expect(applyStarfallThreshold).toHaveBeenCalledExactlyOnceWith({
    snapshot, state: source.state, direction: "reverse", selectedSkillIndex: 0, stacks: 5,
  });
  expect(onApply).toHaveBeenCalledExactlyOnceWith(
    applyStarfallThreshold.mock.results[0].value.state,
    { keepOpen: false, notice: "已填入 5 层星陨" },
  );
});

test("选培养只代入精灵和模板，不套用榜单最低层数，并保持弹窗开启", async () => {
  const { source, onApply } = renderDialog();
  fireEvent.change(screen.getByRole("combobox", { name: "星陨计算技能" }), { target: { value: "1" } });
  fireEvent.click(await screen.findByRole("button", { name: "选择目标精灵培养" }));
  fireEvent.click(screen.getByRole("button", { name: /^代入生防/ }));

  expect(applyStarfallThreshold).toHaveBeenCalledExactlyOnceWith({
    snapshot, state: source.state, direction: "reverse", selectedSkillIndex: 1,
    spiritId: "target", templateId: "defense",
  });
  expect(applyStarfallThreshold.mock.calls[0][0]).not.toHaveProperty("stacks");
  expect(onApply).toHaveBeenCalledExactlyOnceWith(
    applyStarfallThreshold.mock.results[0].value.state,
    { keepOpen: true, notice: "已代入培养，当前对位已恢复特性复算" },
  );
  expect(screen.getByRole("dialog", { name: "星陨斩杀线" })).toBeVisible();
});

test("切换技能取消旧请求，已显示或晚到的旧结果不会混入新技能", async () => {
  domain.createStarfallThresholdRanking.mockImplementation((request) => new Promise((resolve) => {
    pendingPromises.push({ request, resolve });
  }));
  renderDialog();
  const skill = screen.getByRole("combobox", { name: "星陨计算技能" });
  expect(pendingPromises).toHaveLength(1);
  fireEvent.change(skill, { target: { value: "1" } });
  expect(pendingPromises[0].request.signal.aborted).toBe(true);
  expect(pendingPromises).toHaveLength(2);

  await act(async () => pendingPromises[1].resolve(ranking("第二技能结果")));
  expect(screen.getByRole("button", { name: "选择第二技能结果培养" })).toBeVisible();
  fireEvent.change(skill, { target: { value: "0" } });
  expect(pendingPromises[1].request.signal.aborted).toBe(true);
  expect(screen.queryByRole("button", { name: "选择第二技能结果培养" })).not.toBeInTheDocument();

  await act(async () => pendingPromises[0].resolve(ranking("过期第一技能结果")));
  expect(screen.queryByRole("button", { name: "选择过期第一技能结果培养" })).not.toBeInTheDocument();
  expect(screen.getByText("正在计算 0/2")).toBeVisible();
  await act(async () => pendingPromises[2].resolve(ranking("最新第一技能结果")));
  await waitFor(() => expect(screen.getByRole("button", { name: "选择最新第一技能结果培养" })).toBeVisible());
  expect(screen.queryByRole("button", { name: "选择过期第一技能结果培养" })).not.toBeInTheDocument();
});
