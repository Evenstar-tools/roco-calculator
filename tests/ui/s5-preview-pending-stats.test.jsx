import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { SpiritComparisonControls, SpiritTrialChanges } from "../../src/features/balance-comparison/SpiritComparisonControls.jsx";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import { PRESET_BROWSE_STORAGE_KEY, PresetBrowseProvider } from "../../src/components/PresetBrowseMode.jsx";
import { s5PreviewIds } from "../../src/features/s5-preview/catalog.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";

const s5Catalog = JSON.parse(readFileSync("data/candidates/s5-preview-new-spirits.json", "utf8"));

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
afterEach(() => vi.unstubAllGlobals());

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
])("%s时隐藏编辑开关与遗留草稿", (_label, spirit) => {
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
  expect(result.afterView.configurationReady).toBe(false);
  expect(result.afterView.result).toBeNull();
  expect(result.afterView.sides.attacker.panelStats).toBeNull();
  expect(args.snapshot.spirits[0].raceStats).toEqual(raceStats);
});

test("pending标记不会因完整自定义草稿而被覆盖", () => {
  const args = fixture({ ...pending, raceStats: stats });
  const result = buildBalanceComparison({ ...args,
    customEnabled: balance.customEnabled,
    customStats: { attacker: { [pending.id]: { ...stats, physicalAttack: 200 } } } });
  expect(result.issue).toBe("种族值待确认，暂不支持自定义试算");
  expect(result.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(100);
});

function s5Roster({ saved = false } = {}) {
  const ordinary = [
    { id: "dimo", fullName: "迪莫", dexNo: "001" },
    { id: "saved", fullName: "已有收藏", dexNo: "002", favoriteState: saved ? "manual" : null },
    { id: "popular", fullName: "热门配置", dexNo: "003" },
    { id: "bruce", fullName: "冰钻布鲁斯", dexNo: "004" },
  ].map(spirit => ({ ...spirit, types: [], raceStats: stats, evolutionChainIds: [spirit.id] }));
  return withWebPreview({ meta: { id: "picker-fixture" }, spirits: ordinary,
    traits: [], skills: [], learnsets: [] }).spirits;
}

function pickerProps(spirits, selected = null) {
  return { label: "攻击方", side: "attack", spirits, selected, onSelect: vi.fn() };
}

function expectS5Pinned() {
  const first = screen.getAllByRole("option").slice(0, s5Catalog.entries.length);
  expect(first.map(option => option.dataset.spiritId)).toEqual(s5Catalog.entries.map(entry => s5PreviewIds(entry.key).spiritId));
  for (const option of first) {
    expect(option.querySelector("strong")).toHaveAttribute("data-new", "true");
    expect(option).toHaveTextContent("六维100测试占位");
  }
}

test("真实App中S5六维100可编辑、恢复占位及上次手调，S4不再NEW且未知特性不放行伤害", async () => {
  const user = userEvent.setup();
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const snapshot = withWebPreview(current);
  const candidate = snapshot.spirits.find(spirit => spirit.previewIdentity?.key === "minggulong");
  const wolf = snapshot.spirits.find(spirit => spirit.fullName === "银月狼王");
  const state = createInitialState(snapshot);
  state.sides.attacker.spiritId = candidate.id;
  state.sides.defender.spiritId = wolf.id;
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "compact" }} />);
  expect(screen.getByText("冥古龙", { selector: ".spirit-card__title strong" })).toHaveAttribute("data-new", "true");
  expect(screen.getByText("银月狼王", { selector: ".spirit-card__title strong" })).not.toHaveAttribute("data-new");
  await user.click(screen.getByRole("button", { name: "编辑冥古龙试算种族值" }));
  const editor = screen.getByRole("dialog", { name: "冥古龙种族值试算" });
  await user.click(within(editor).getByRole("checkbox", { name: "自定义种族值" }));
  for (const input of within(editor).getAllByRole("spinbutton")) expect(input).toHaveValue(100);
  expect(screen.getByLabelText("自定义种族值摘要")).toHaveTextContent("沿用占位值");
  expect(within(editor).getAllByText("占位 100")).toHaveLength(6);
  expect(within(editor).queryByText("官方 100")).not.toBeInTheDocument();
  const attack = within(editor).getByRole("spinbutton", { name: "试算物攻种族值" });
  fireEvent.change(attack, { target: { value: "250" } });
  expect(attack).toHaveValue(250);
  expect(screen.getByLabelText("自定义种族值摘要")).toHaveTextContent("100 → 250");
  await user.click(within(editor).getByRole("button", { name: "恢复占位种族值" }));
  await user.click(within(editor).getByRole("button", { name: "恢复上次手调值" }));
  expect(within(editor).getByRole("spinbutton", { name: "试算物攻种族值" })).toHaveValue(250);
  await user.keyboard("{Escape}");
  expect(screen.getAllByText(/等级99的等级面板与伤害公式尚未核验/u).length).toBeGreaterThan(0);
  const damage = screen.queryByTestId("primary-damage");
  if (damage) expect(damage.textContent).not.toMatch(/^\d+$/u);
  expect(current.spirits.some(spirit => spirit.id === candidate.id)).toBe(false);
});

test("实际S5目录17项均进入首批并排在迪莫前，全部候选卡片显示NEW", async () => {
  const user = userEvent.setup();
  const spirits = s5Roster();
  const props = pickerProps(spirits, spirits.find(spirit => spirit.id === "dimo"));
  const { rerender } = render(<SpiritPicker {...props} />);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(s5Catalog.entries).toHaveLength(17);
  expectS5Pinned();
  expect(screen.getAllByRole("option")[17]).toHaveAttribute("data-spirit-id", "dimo");
  await user.keyboard("{Escape}");
  for (const entry of s5Catalog.entries) {
    const selected = spirits.find(spirit => spirit.id === s5PreviewIds(entry.key).spiritId);
    rerender(<SpiritPicker {...props} selected={selected} />);
    expect(screen.getByText(selected.fullName, { selector: ".spirit-card__title strong" })).toHaveAttribute("data-new", "true");
    expect(screen.getByText("六维100测试占位", { selector: ".spirit-card__pending" })).toBeVisible();
  }
});

test("无搜索的收藏与热门预设模式都保留17项S5置顶", async () => {
  const user = userEvent.setup();
  const spirits = s5Roster({ saved: true });
  const first = render(<SpiritPicker {...pickerProps(spirits)} />);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expectS5Pinned();
  expect(screen.getAllByRole("option")[17]).toHaveAttribute("data-spirit-id", "saved");
  first.unmount();
  localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, "1");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ entries: [{ spiritId: "popular" }] }) })));
  render(<PresetBrowseProvider><SpiritPicker {...pickerProps(spirits, spirits.find(spirit => spirit.id === "popular"))} /></PresetBrowseProvider>);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  await waitFor(() => expect(screen.getByRole("option", { name: /热门配置/u })).toBeVisible());
  expectS5Pinned();
  expect(screen.getAllByRole("option")[0]).toHaveClass("is-active");
  expect(screen.getAllByRole("option").slice(17).map(option => option.dataset.spiritId)).toEqual(["saved", "popular"]);
});

test("名称搜索优先准确命中，S5首领或收藏标记不抢普通形态，也不追加无关S5项", () => {
  const spirits = s5Roster().map(spirit => spirit.previewIdentity?.key === "boss-ice-bruce"
    ? { ...spirit, favoriteState: "manual" } : spirit);
  render(<SpiritPicker {...pickerProps(spirits)} />);
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.change(input, { target: { value: "冰钻布鲁斯" } });
  expect(screen.getAllByRole("option")[0]).toHaveAttribute("data-spirit-id", "bruce");
  expect(screen.getAllByRole("option")).toHaveLength(2);
  fireEvent.change(input, { target: { value: "迪莫" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: /迪莫/u })).toHaveAttribute("data-spirit-id", "dimo");
});

test("已有千棘海针显示正式头像与首领身份，不再出现千棘盔首领化NEW占位", () => {
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const spirits = withWebPreview(current).spirits;
  const selected = spirits.find(spirit => spirit.id === "spirit_786924cd03526ca4");
  render(<SpiritPicker {...pickerProps(spirits, selected)} />);
  expect(screen.getByText("千棘海针", { selector: ".spirit-card__title strong" })).not.toHaveAttribute("data-new");
  expect(screen.getByText("溶解腐蚀")).toBeVisible();
  expect(screen.queryByText("六维100测试占位")).not.toBeInTheDocument();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.change(input, { target: { value: "千棘" } });
  const options = screen.getAllByRole("option");
  expect(options.some(option => option.dataset.spiritId === selected.id)).toBe(true);
  expect(options.some(option => option.textContent.includes("千棘盔（首领化）"))).toBe(false);
  expect(options.every(option => option.querySelector("strong")?.dataset.new !== "true")).toBe(true);
});
