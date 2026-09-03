import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DisplaySettingsDialog } from "../../src/components/DisplaySettingsDialog.jsx";
import { DurabilityOverview } from "../../src/components/DurabilityOverview.jsx";

const stats = [
  { key: "hp", basePanel: 366, panel: 419 },
  { key: "physicalDefense", basePanel: 172, panel: 139 },
  { key: "magicalDefense", basePanel: 221, panel: 188 },
];

describe("DurabilityOverview", () => {
  test("shows the selected panel's three durability values and analyzes on demand", async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();

    render(
      <DurabilityOverview
        accent="attack"
        label="攻击方"
        onAnalyze={onAnalyze}
        showFinalPanel
        stats={stats}
      />,
    );

    const overview = screen.getByRole("group", { name: "攻击方耐久概览" });
    expect(overview).toHaveTextContent("物理耐久58,241");
    expect(overview).toHaveTextContent("魔法耐久78,772");
    expect(overview).toHaveTextContent("综合耐久33,484");
    expect(overview).toHaveTextContent("最大生命");

    await user.click(screen.getByRole("button", { name: "分析此精灵" }));
    expect(onAnalyze).toHaveBeenCalledOnce();
  });
});

test("display settings exposes an independent durability overview switch", async () => {
  const user = userEvent.setup();
  const onDurabilityOverviewChange = vi.fn();

  render(
    <DisplaySettingsDialog
      durabilityOverviewEnabled={false}
      onDurabilityOverviewChange={onDurabilityOverviewChange}
      open
    />,
  );

  const control = screen.getByRole("checkbox", { name: "显示面板耐久" });
  expect(control).not.toBeChecked();
  await user.click(control);
  expect(onDurabilityOverviewChange).toHaveBeenCalledWith(true);
});
