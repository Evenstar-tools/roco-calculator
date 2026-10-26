import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { SpiritComparisonControls, SpiritTrialChanges } from "../../src/features/balance-comparison/SpiritComparisonControls.jsx";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100,
  physicalDefense: 100, magicalDefense: 100, speed: 100 };
const traitSummary = "完整特性说明，保留已核验的触发条件与生效限制。";
const pending = { id: "preview-pending", fullName: "预览精灵", types: ["火"], stage: "三阶",
  sourceCategory: "S5前瞻",
  calculationStatus: "pending-race-stats", traitName: "已核验特性", traitSummary,
  raceStats: null, traitIds: [] };
const balance = { customEnabled: { attacker: { [pending.id]: true } },
  customStats: { attacker: { [pending.id]: { ...stats } } }, enabled: true,
  setCustom: vi.fn(), setComparison: vi.fn(), setStat: vi.fn(), restore: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
});

function fixture(spirit = pending) {
  const snapshot = { meta: { id: "s5-preview-ui-fixture", rulesVersion: "fixture" },
    spirits: [spirit, { id: "known", fullName: "完整资料精灵", types: ["火"], raceStats: stats, traitIds: [] }],
    skills: [{ id: "hit", name: "测试技能", type: "火", category: "physical", basePower: 60 }],
    traits: [], typeChart: null,
    learnsets: [spirit.id, "known"].map(spiritId => ({ spiritId, skillIds: ["hit"] })),
  };
  const state = createInitialState(snapshot);
  state.sides.attacker.spiritId = spirit.id;
  state.sides.defender.spiritId = "known";
  return { snapshot, state, activeDirection: "forward" };
}

test("预览卡保留已核验特性全文提示，未知种族值不挂试算入口或旧草稿摘要", async () => {
  const user = userEvent.setup();
  render(<SpiritPicker label="攻击方" side="attack" spirits={[pending]} selected={pending} onSelect={vi.fn()}
    comparisonActive comparisonSummary={<p>不应出现的草稿</p>}
    comparisonControls={<input aria-label="不应出现的试算开关" type="checkbox" />} />);
  expect(screen.getByText("种族值待确认")).toBeVisible();
  const trait = screen.getByText("已核验特性");
  await user.hover(trait);
  expect(screen.getByRole("tooltip")).toHaveTextContent(traitSummary);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑预览精灵试算种族值" })).not.toBeInTheDocument();
  expect(screen.queryByText("不应出现的草稿")).not.toBeInTheDocument();
});

test("可用S5查询前瞻候选，复用名称搜索列表", async () => {
  const user = userEvent.setup();
  render(<SpiritPicker label="攻击方" side="attack" spirits={[pending]} onSelect={vi.fn()} />);
  await user.type(screen.getByRole("combobox", { name: "攻击方精灵" }), "S5");
  expect(screen.getByRole("option", { name: /预览精灵/ })).toBeVisible();
});

test("点击特性后移开指针仍可读全文，其他操作获得焦点后关闭", async () => {
  const user = userEvent.setup();
  render(<>
    <SpiritPicker label="攻击方" side="attack" spirits={[pending]} selected={pending} onSelect={vi.fn()} />
    <button type="button">其他操作</button>
  </>);
  const trait = screen.getByText("已核验特性");
  await user.click(trait);
  await user.unhover(trait);
  expect(screen.getByRole("tooltip")).toHaveTextContent(traitSummary);
  await user.click(screen.getByRole("button", { name: "其他操作" }));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test.each([
  ["待确认", pending],
  ["待确认标记即使附带数值", { ...pending, raceStats: stats }],
  ["六维不完整", { ...pending, calculationStatus: undefined, raceStats: { hp: 100 } }],
])("%s时隐藏对比、编辑开关与遗留草稿", (_label, spirit) => {
  const { container } = render(<>
    <SpiritComparisonControls balance={balance} spirit={spirit} side="attacker" />
    <SpiritTrialChanges balance={balance} spirit={spirit} side="attacker" />
  </>);
  expect(container).toBeEmptyDOMElement();
});

test("真实页面选择未知六维精灵仍能看特性全文，同时不展示伤害或种族值编辑入口", async () => {
  const user = userEvent.setup();
  const { snapshot, state } = fixture();
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "compact" }} />);
  await user.hover(screen.getByText("已核验特性"));
  expect(screen.getByRole("tooltip")).toHaveTextContent(traitSummary);
  expect(screen.queryByTestId("primary-damage")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("伤害结果", { selector: ".result-rail" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑预览精灵试算种族值" })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: /试算.*种族值/ })).not.toBeInTheDocument();
});

test.each([null, { hp: 100 }])("补齐自定义六维也不能将未知官方种族值放行计算 (%j)", (raceStats) => {
  const args = fixture({ ...pending, raceStats });
  const result = buildBalanceComparison({ ...args,
    customEnabled: balance.customEnabled, customStats: balance.customStats });
  expect(result.issue).toBe("种族值待确认，暂不支持自定义试算");
  expect(result.beforeView).toBeNull();
  expect(result.afterView.configurationReady).toBe(false);
  expect(result.afterView.result).toBeNull();
  expect(result.afterView.sides.attacker.panelStats).toBeNull();
  expect(result.changes).toEqual([]);
  expect(args.snapshot.spirits[0].raceStats).toEqual(raceStats);
});

test("pending标记不会因完整自定义草稿而被覆盖", () => {
  const args = fixture({ ...pending, raceStats: stats });
  const result = buildBalanceComparison({ ...args,
    customEnabled: balance.customEnabled,
    customStats: { attacker: { [pending.id]: { ...stats, physicalAttack: 200 } } } });
  expect(result.issue).toBe("种族值待确认，暂不支持自定义试算");
  expect(result.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(100);
  expect(result.changes).toEqual([]);
});
