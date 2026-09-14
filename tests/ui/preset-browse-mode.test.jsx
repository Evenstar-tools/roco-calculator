import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ConfigLibraryDialog } from "../../src/components/ConfigLibraryDialog.jsx";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { PRESET_BROWSE_STORAGE_KEY, PresetBrowseProvider } from "../../src/components/PresetBrowseMode.jsx";

const presets = Array.from({ length: 36 }, (_, i) => ({
  id: `preset-${i + 1}`, fullName: `预设精灵${i + 1}`, dexNo: i + 1, types: [],
  evolutionChainIds: [`preset-${i + 1}`, "outside"],
}));
const outside = { id: "outside", fullName: "无配置精灵", dexNo: 100, types: [], evolutionChainIds: ["outside"] };
const spirits = [...presets].reverse().concat(outside);
const library = { entries: presets.map((s) => ({ spiritId: s.id })) };

function Harness() {
  const [selectedId, setSelectedId] = useState("preset-30");
  return <PresetBrowseProvider>
    <ConfigLibraryDialog mode="popular" parsed={{ entries: [], preview: {}, favoriteSpiritIds: [] }} />
    <SpiritPicker label="攻击方" spirits={spirits} selected={spirits.find((s) => s.id === selectedId)} onSelect={setSelectedId} />
  </PresetBrowseProvider>;
}

afterEach(() => { cleanup(); localStorage.removeItem(PRESET_BROWSE_STORAGE_KEY); vi.unstubAllGlobals(); });

test("开关独立于导入，预设全量按图鉴排序，重新展开定位选中项，手动搜索不限预设", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => library }));
  render(<Harness />);
  const toggle = screen.getByRole("switch", { name: "仅预览配置项" });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(localStorage.getItem(PRESET_BROWSE_STORAGE_KEY)).toBe("1");
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.focus(input);
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(36));
  expect(screen.getAllByRole("option").map((el) => el.dataset.spiritId)).toEqual(presets.map((s) => s.id));
  expect(screen.queryByRole("option", { name: /无配置精灵/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: /预设精灵35\s/ }));
  expect(input).toHaveValue("预设精灵35");
  fireEvent.click(screen.getByRole("button", { name: "展开攻击方精灵列表" }));
  expect(screen.getAllByRole("option")).toHaveLength(36);
  expect(screen.getByRole("option", { name: /预设精灵35\s/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("option", { name: /预设精灵35\s/ })).toHaveClass("is-active");
  fireEvent.change(input, { target: { value: "无配置精灵" } });
  expect(screen.getByRole("option", { name: /无配置精灵/ })).toBeVisible();
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getAllByRole("option")).toHaveLength(36);
  fireEvent.click(toggle);
  expect(localStorage.getItem(PRESET_BROWSE_STORAGE_KEY)).toBe("0");
  fireEvent.blur(input);
  fireEvent.focus(input);
  expect(screen.getByRole("option", { name: /无配置精灵.*进化链/ })).toBeVisible();
});

test("重新启动保留开关，读取失败不妨碍全图鉴手动搜索，关闭再开可重试", async () => {
  localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, "1");
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, json: async () => library });
  vi.stubGlobal("fetch", fetchMock);
  render(<Harness />);
  const toggle = screen.getByRole("switch", { name: "仅预览配置项" });
  expect(toggle).toBeChecked();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.focus(input);
  expect(await screen.findByText("预设读取失败，请关闭后重试")).toBeVisible();
  fireEvent.change(input, { target: { value: "无配置精灵" } });
  expect(screen.getByRole("option", { name: /无配置精灵/ })).toBeVisible();
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  fireEvent.change(input, { target: { value: "" } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(36));
});
