import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { PRESET_BROWSE_STORAGE_KEY, PresetBrowseProvider } from "../../src/components/PresetBrowseMode.jsx";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";

const runtime = withWebPreview({ ...snapshot, meta: { ...snapshot.meta, s5NrcSync: { complete: true } } });
const hidden = runtime.spirits.filter(spirit => spirit.previewIdentity?.catalogId === "candymo-hidden-20261101");
const favorite = { ...runtime.spirits.find(spirit => spirit.fullName === "迪莫"), favoriteState: "manual" };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test.each([false, true])("收藏和热门模式=%s不自动展示未开放候选，按名称搜索仍可选择", async (presets) => {
  if (presets) localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, "1");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    entries: hidden.map(spirit => ({ spiritId: spirit.id })),
  }) }));
  const select = vi.fn();
  render(<PresetBrowseProvider><SpiritPicker label="攻击方" side="attack"
    spirits={[favorite, ...hidden.map(spirit => ({ ...spirit, favoriteState: "manual" }))]}
    onSelect={select} /></PresetBrowseProvider>);
  if (presets) await waitFor(() => expect(fetch).toHaveBeenCalled());
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.focus(input);
  expect(hidden).toHaveLength(27);
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual([favorite.id]);
  fireEvent.change(input, { target: { value: "健猫教练" } });
  const option = screen.getByRole("option", { name: /健猫教练/ });
  expect(within(option).getByText("未开放")).toBeVisible();
  expect(option.querySelector('[data-new="true"]')).toBeNull();
  fireEvent.click(option);
  expect(select).toHaveBeenCalledWith(hidden.find(spirit => spirit.fullName === "健猫教练").id);
});

test("选中或搜索同族时不自动带出其他未开放形态", () => {
  const candidate = hidden.find(spirit => spirit.fullName === "健猫教练");
  const family = hidden.find(spirit => spirit.id !== candidate.id && candidate.evolutionChainIds?.includes(spirit.id));
  expect(family).toBeDefined();
  render(<SpiritPicker label="攻击方" side="attack" spirits={hidden} selected={candidate}
    formSide={{ spiritId: candidate.id }} onFormSelect={vi.fn()} onSelect={vi.fn()} />);
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.focus(input);
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual([candidate.id]);
  fireEvent.change(input, { target: { value: family.fullName } });
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual([family.id]);
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

test("搜索未开放展示全27只，不被普通20条搜索上限截断", () => {
  render(<SpiritPicker label="攻击方" side="attack" spirits={[favorite, ...hidden]} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "攻击方精灵" }), { target: { value: "未开放" } });
  expect(screen.getAllByRole("option")).toHaveLength(27);
  for (const spirit of hidden) expect(screen.getByRole("option", { name: new RegExp(spirit.fullName) })).toBeVisible();
});

test("选中候选显示未开放身份和独立特性全文，未知六维保持待确认", async () => {
  const selected = hidden.find(spirit => spirit.fullName === "机甲小子");
  render(<SpiritPicker label="攻击方" side="attack" spirits={hidden} selected={selected} onSelect={vi.fn()} />);
  expect(screen.getByText("未开放")).toBeVisible();
  expect(screen.getByText("种族值待确认")).toBeVisible();
  await userEvent.setup().click(screen.getByText("四轴机床"));
  expect(screen.getByRole("tooltip")).toHaveTextContent("若释放的4号位技能为该精灵未使用过的技能，能耗-3。");
});
