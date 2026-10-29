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
  for (const [index, option] of first.entries()) {
    expect(option.querySelector("strong")).toHaveAttribute("data-new", "true");
    if (s5Catalog.entries[index].raceStats === undefined) expect(option).toHaveTextContent("六维100测试占位");
    else if (s5Catalog.entries[index].raceStats === null) expect(option).toHaveTextContent("种族值待确认");
    else expect(option).not.toHaveTextContent("六维100测试占位");
  }
}

test("真实App中S5六维100可编辑、恢复当前及上次修改，未改值不提示自定义", async () => {
  const user = userEvent.setup();
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const snapshot = withWebPreview(current);
  const candidate = snapshot.spirits.find(spirit => spirit.previewIdentity?.key === "abu");
  const wolf = snapshot.spirits.find(spirit => spirit.fullName === "银月狼王");
  const state = createInitialState(snapshot);
  state.sides.attacker.spiritId = candidate.id;
  state.sides.defender.spiritId = wolf.id;
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "compact" }} />);
  expect(screen.getByText("阿布", { selector: ".spirit-card__title strong" })).toHaveAttribute("data-new", "true");
  expect(screen.getByText("暂定六维100", { selector: ".spirit-card__pending" })).toBeVisible();
  expect(screen.getByText("银月狼王", { selector: ".spirit-card__title strong" })).not.toHaveAttribute("data-new");
  await user.click(screen.getByRole("button", { name: "编辑阿布试算种族值" }));
  const editor = screen.getByRole("dialog", { name: "阿布种族值试算" });
  await user.click(within(editor).getByRole("checkbox", { name: "自定义种族值" }));
  for (const input of within(editor).getAllByRole("spinbutton")) expect(input).toHaveValue(100);
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.getByText("暂定六维100", { selector: ".spirit-card__pending" })).toBeVisible();
  expect(within(editor).getAllByText("占位 100")).toHaveLength(6);
  expect(within(editor).queryByText("官方 100")).not.toBeInTheDocument();
  const attack = within(editor).getByRole("spinbutton", { name: "试算物攻种族值" });
  fireEvent.change(attack, { target: { value: "250" } });
  expect(attack).toHaveValue(250);
  expect(screen.getByLabelText("自定义种族值摘要")).toHaveTextContent("100 → 250");
  expect(screen.queryByText("暂定六维100", { selector: ".spirit-card__pending" })).not.toBeInTheDocument();
  await user.click(within(editor).getByRole("button", { name: "恢复当前" }));
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.getByText("暂定六维100", { selector: ".spirit-card__pending" })).toBeVisible();
  await user.click(within(editor).getByRole("button", { name: "恢复上次修改" }));
  expect(within(editor).getByRole("spinbutton", { name: "试算物攻种族值" })).toHaveValue(250);
  await user.keyboard("{Escape}");
  expect(screen.getAllByRole("status", { name: "攻击特性当前效果" })[0]).toHaveAttribute("data-status", "ready");
  const damage = screen.queryByTestId("primary-damage");
  if (damage) expect(Number(damage.textContent)).toBeGreaterThan(0);
  expect(current.spirits.some(spirit => spirit.id === candidate.id)).toBe(false);
});

test("实际S5目录含官方进化形态均进入首批并排在迪莫前，全部候选卡片显示NEW", async () => {
  const user = userEvent.setup();
  const spirits = s5Roster();
  const props = pickerProps(spirits);
  const { rerender } = render(<SpiritPicker {...props} />);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(s5Catalog.entries.some(entry => entry.raceStats)).toBe(true);
  expectS5Pinned();
  expect(screen.getAllByRole("option")[s5Catalog.entries.length]).toHaveAttribute("data-spirit-id", "dimo");
  await user.keyboard("{Escape}");
  for (const entry of s5Catalog.entries) {
    const selected = spirits.find(spirit => spirit.id === s5PreviewIds(entry.key).spiritId);
    rerender(<SpiritPicker {...props} selected={selected} />);
    expect(screen.getByText(selected.fullName, { selector: ".spirit-card__title strong" })).toHaveAttribute("data-new", "true");
    if (entry.raceStats === undefined) expect(screen.getByText("暂定六维100", { selector: ".spirit-card__pending" })).toBeVisible();
    else if (entry.raceStats === null) expect(screen.getByText("种族值待确认", { selector: ".spirit-card__pending" })).toBeVisible();
    else expect(screen.queryByText("暂定六维100", { selector: ".spirit-card__pending" })).not.toBeInTheDocument();
  }
});

test("无搜索的收藏与热门预设模式都保留全部S5置顶", async () => {
  const user = userEvent.setup();
  const spirits = s5Roster({ saved: true });
  const first = render(<SpiritPicker {...pickerProps(spirits)} />);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expectS5Pinned();
  expect(screen.getAllByRole("option")[s5Catalog.entries.length]).toHaveAttribute("data-spirit-id", "saved");
  first.unmount();
  localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, "1");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ entries: [{ spiritId: "popular" }] }) })));
  const popular = spirits.find(spirit => spirit.id === "popular");
  const { rerender } = render(<PresetBrowseProvider><SpiritPicker {...pickerProps(spirits)} /></PresetBrowseProvider>);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  await waitFor(() => expect(screen.getByRole("option", { name: /热门配置/u })).toBeVisible());
  expectS5Pinned();
  expect(screen.getAllByRole("option")[0]).toHaveClass("is-active");
  expect(screen.getAllByRole("option").slice(s5Catalog.entries.length).map(option => option.dataset.spiritId)).toEqual(["saved", "popular"]);
  await user.keyboard("{Escape}");
  rerender(<PresetBrowseProvider><SpiritPicker {...pickerProps(spirits, popular)} /></PresetBrowseProvider>);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getAllByRole("option").slice(0, 2).map(option => option.dataset.spiritId)).toEqual(["saved", "popular"]);
  expect(screen.getByRole("option", { name: /热门配置/u })).toHaveClass("is-active");
});

test.each([false, true])("已选同族精灵只展示相关形态，常用配置模式=%s，原同族切换保留", async (presetMode) => {
  const user = userEvent.setup();
  const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const selected = snapshot.spirits.find(spirit => spirit.fullName === "冰钻布鲁斯");
  localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, presetMode ? "1" : "0");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ entries: [{ spiritId: selected.id }] }) })));
  const onFormSelect = vi.fn();
  const onSelect = vi.fn();
  render(<PresetBrowseProvider><SpiritPicker {...pickerProps(snapshot.spirits, selected)}
    formSide={{ spiritId: selected.id }} onFormSelect={onFormSelect} onSelect={onSelect} /></PresetBrowseProvider>);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getByText("同族形态")).toBeVisible();
  expect(screen.getByRole("option", { name: /^冰钻布鲁斯 .*当前形态/u })).toHaveClass("is-active");
  expect(screen.queryByRole("option", { name: /^冥古龙 /u })).not.toBeInTheDocument();
  expect(screen.getAllByRole("option").every(option => selected.evolutionChainIds.includes(option.dataset.spiritId))).toBe(true);
  expect(new Set(screen.getAllByRole("option").map(option => option.dataset.spiritId)).size).toBe(screen.getAllByRole("option").length);
  const keepConfig = screen.getByRole("switch", { name: "攻击方同族切换保留本场配置" });
  if (!keepConfig.checked) await user.click(keepConfig);
  const base = snapshot.spirits.find(spirit => spirit.fullName === "布鲁斯");
  await user.click(screen.getByRole("option", { name: /^布鲁斯 /u }));
  expect(onFormSelect).toHaveBeenCalledWith(base.id);
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  const candidate = snapshot.spirits.find(spirit => spirit.previewIdentity?.key === "gold-vein-dragon");
  await user.clear(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getAllByRole("option")[0].dataset.spiritId).not.toMatch(/^spirit_preview_s5_/u);
  await user.type(screen.getByRole("combobox", { name: "攻击方精灵" }), candidate.fullName);
  const match = screen.getAllByRole("option").find(option => option.dataset.spiritId === candidate.id);
  await user.click(match);
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(candidate.id);
  expect(onFormSelect).toHaveBeenCalledTimes(1);
});

test.each([false, true])("选中稻草守护者后重开不混入新精灵，键盘高亮与选择一致，常用模式=%s", async presetMode => {
  const user = userEvent.setup();
  const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const selected = snapshot.spirits.find(spirit => spirit.fullName === "稻草守护者");
  const base = snapshot.spirits.find(spirit => spirit.fullName === "稻草人");
  localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, presetMode ? "1" : "0");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ entries: [{ spiritId: selected.id }] }) })));
  const props = pickerProps(snapshot.spirits);
  const onFormSelect = vi.fn();
  const { rerender } = render(<PresetBrowseProvider><SpiritPicker {...props} onFormSelect={onFormSelect} /></PresetBrowseProvider>);
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.type(input, selected.fullName);
  await user.click(screen.getByRole("option", { name: /^稻草守护者 /u }));
  expect(props.onSelect).toHaveBeenCalledWith(selected.id);
  props.onSelect.mockClear();
  rerender(<PresetBrowseProvider><SpiritPicker {...props} selected={selected} formSide={{ spiritId: selected.id }} onFormSelect={onFormSelect} /></PresetBrowseProvider>);
  await user.click(input);
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual([base.id, selected.id]);
  expect(screen.getByRole("option", { name: /^稻草守护者 /u })).toHaveClass("is-active");
  expect(screen.getByRole("option", { name: /^稻草守护者 /u })).toHaveAttribute("aria-selected", "true");
  const keepConfig = screen.getByRole("switch");
  if (keepConfig.checked) await user.click(keepConfig);
  await user.click(input);
  await user.keyboard("{Enter}");
  expect(props.onSelect).toHaveBeenCalledWith(selected.id);
  expect(onFormSelect).not.toHaveBeenCalled();
  props.onSelect.mockClear();
  await user.click(input);
  await user.keyboard("无匹配精灵{Escape}");
  expect(input).toHaveValue(selected.fullName);
  expect(props.onSelect).not.toHaveBeenCalled();
});

test.each([false, true])("已选无同族精灵重开及主动清空都不置顶新精灵，clearOnOpen=%s", async clearOnOpen => {
  const user = userEvent.setup();
  const spirits = s5Roster();
  const selected = spirits.find(spirit => spirit.id === "popular");
  render(<SpiritPicker {...pickerProps(spirits, selected)} clearOnOpen={clearOnOpen} />);
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.click(input);
  if (!clearOnOpen) expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual([selected.id]);
  await user.clear(input);
  expect(screen.getAllByRole("option")[0]).toHaveAttribute("data-spirit-id", "dimo");
});

test("常用配置异步读入后高亮当前选中，不跳到新精灵或第一项", async () => {
  const user = userEvent.setup();
  const spirits = s5Roster({ saved: true });
  const selected = spirits.find(spirit => spirit.id === "popular");
  let resolve;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(done => { resolve = done; })));
  localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, "1");
  const props = pickerProps(spirits, selected);
  render(<PresetBrowseProvider><SpiritPicker {...props} /></PresetBrowseProvider>);
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.click(input);
  resolve({ ok: true, json: async () => ({ entries: [{ spiritId: selected.id }] }) });
  await waitFor(() => expect(screen.getByRole("option", { name: /热门配置/u })).toHaveClass("is-active"));
  await user.keyboard("{Enter}");
  expect(props.onSelect).toHaveBeenCalledWith(selected.id);
});

test.each([false, true])("名称搜索准确命中优先于收藏与部分匹配，不追加无关新精灵，S5目录=%s", previewEnabled => {
  const spirits = s5Roster().filter(spirit => previewEnabled || !spirit.previewIdentity)
    .map(spirit => spirit.previewIdentity?.key === "boss-ice-bruce" ? { ...spirit, favoriteState: "manual" } : spirit);
  spirits.push({ id: "partial", fullName: "冰钻布鲁斯特别版", types: [], favoriteState: "manual", evolutionChainIds: ["partial"] });
  render(<SpiritPicker {...pickerProps(spirits)} />);
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.change(input, { target: { value: "冰钻布鲁斯" } });
  expect(screen.getAllByRole("option")[0]).toHaveAttribute("data-spirit-id", "bruce");
  expect(screen.getAllByRole("option")).toHaveLength(previewEnabled ? 3 : 2);
  fireEvent.change(input, { target: { value: "迪莫" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: /迪莫/u })).toHaveAttribute("data-spirit-id", "dimo");
});

test("已选新精灵只显示自己的同族并保留NEW，不重复或混入其他新精灵", async () => {
  const user = userEvent.setup();
  const spirits = s5Roster();
  const selected = spirits.find(spirit => spirit.previewIdentity?.key === "minggulong");
  render(<SpiritPicker {...pickerProps(spirits, selected)} formSide={{ spiritId: selected.id }} onFormSelect={vi.fn()} />);
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getByText("同族形态")).toBeVisible();
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual([
    selected.id, s5PreviewIds("little-ming-dragon").spiritId,
  ]);
  expect(screen.getByRole("option", { name: /^冥古龙 /u })).toHaveClass("is-active");
  for (const option of screen.getAllByRole("option")) expect(option.querySelector("strong")).toHaveAttribute("data-new", "true");
});

test("已有千棘海针显示正式头像与首领身份，不再出现千棘盔首领化NEW占位", () => {
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const spirits = withWebPreview(current).spirits;
  const selected = spirits.find(spirit => spirit.id === "spirit_786924cd03526ca4");
  render(<SpiritPicker {...pickerProps(spirits, selected)} />);
  expect(screen.getByText("千棘海针", { selector: ".spirit-card__title strong" })).not.toHaveAttribute("data-new");
  expect(screen.getByText("溶解腐蚀")).toBeVisible();
  expect(screen.queryByText("暂定六维100")).not.toBeInTheDocument();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.change(input, { target: { value: "千棘" } });
  const options = screen.getAllByRole("option");
  expect(options.some(option => option.dataset.spiritId === selected.id)).toBe(true);
  expect(options.some(option => option.textContent.includes("千棘盔（首领化）"))).toBe(false);
  expect(options.every(option => option.querySelector("strong")?.dataset.new !== "true")).toBe(true);
});
