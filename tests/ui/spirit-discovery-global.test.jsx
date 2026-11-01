import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";

const familyIds = ["available", "unreleased", "placeholder", "spirit_preview_s5_boss-abu"];
const common = { types: [], stage: "三阶", evolutionChainIds: familyIds, favoriteState: "manual" };
const spirits = [
  { ...common, id: familyIds[0], fullName: "Available" },
  { ...common, id: familyIds[1], fullName: "Unreleased", calculationStatus: "pending-race-stats", raceStats: null },
  { ...common, id: familyIds[2], fullName: "Placeholder", previewIdentity: { raceStatsPlaceholder: true } },
  { ...common, id: familyIds[3], fullName: "圣龙阿布" },
];

beforeEach(() => localStorage.clear());

test.each(["zh-CN", "en", "ja"])("%s同一发现策略不混入其他地区数据，保存的候选只能主动查找", locale => {
  const before = structuredClone(spirits);
  const select = vi.fn();
  render(<RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>
    <SpiritPicker label="攻击方" side="attack" spirits={spirits} selected={spirits[0]}
      formSide={{ spiritId: spirits[0].id }} onFormSelect={vi.fn()} onSelect={select} />
  </LocaleProvider></RuntimeProvider>);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual(["available"]);
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getAllByRole("option").map(option => option.dataset.spiritId)).toEqual(["available"]);
  fireEvent.change(input, { target: { value: "未开放" } });
  expect(new Set(screen.getAllByRole("option").map(option => option.dataset.spiritId)))
    .toEqual(new Set(["unreleased", "placeholder"]));
  fireEvent.change(input, { target: { value: "Unreleased" } });
  const option = screen.getByRole("option", { name: /Unreleased/ });
  fireEvent.click(option);
  expect(select).toHaveBeenCalledWith("unreleased");
  fireEvent.change(input, { target: { value: "圣龙阿布" } });
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(spirits).toEqual(before);
});
