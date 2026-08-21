import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { TeamTypeAnalysisPanel } from "../../src/components/TeamTypeAnalysisPanel.jsx";

const analysis = {
  configuredCount: 3,
  riskRows: [],
  rows: [],
  skippedCount: 1,
};

const grassRow = {
  immuneMembers: [],
  immunityCount: 0,
  neutralCount: 0,
  order: 0,
  resistanceCount: 1,
  resistantMembers: [
    {
      assetUrl: null,
      multiplier: 0.5,
      name: "龙灵",
      slotIndex: 2,
      spiritId: "dragon",
    },
  ],
  type: "草",
  weakCount: 2,
  weakMembers: [
    {
      assetUrl: "/assets/spirits/water.png",
      multiplier: 2,
      name: "水灵",
      slotIndex: 0,
      spiritId: "water",
    },
    {
      assetUrl: null,
      multiplier: 3,
      name: "水地灵",
      slotIndex: 1,
      spiritId: "water-ground",
    },
  ],
};

const fireRow = {
  ...grassRow,
  order: 1,
  resistanceCount: 0,
  resistantMembers: [],
  type: "火",
  weakCount: 1,
  weakMembers: [grassRow.weakMembers[0]],
};

test("shows priority risks with compact counts and one expanded detail row", async () => {
  const user = userEvent.setup();
  render(
    <TeamTypeAnalysisPanel
      analysis={{
        ...analysis,
        riskRows: [grassRow, fireRow],
        rows: [grassRow, fireRow],
      }}
    />,
  );

  const panel = screen.getByRole("region", { name: "队伍防守面" });
  expect(within(panel).getByText("3/6")).toBeVisible();
  expect(within(panel).getByText("1 个成员未计入")).toBeVisible();
  expect(within(panel).getByRole("button", { name: /草.*弱 2.*抗 1/ })).toBeVisible();

  await user.click(within(panel).getByRole("button", { name: /草.*弱 2.*抗 1/ }));
  expect(within(panel).getByText("水灵")).toBeVisible();
  expect(within(panel).getAllByText("×3")).toHaveLength(2);

  await user.click(within(panel).getByRole("button", { name: /火.*弱 1.*抗 0/ }));
  expect(within(panel).queryByText("水地灵")).not.toBeInTheDocument();
});

test("switches from priority risks to all types without losing clarity", async () => {
  const user = userEvent.setup();
  const neutralRow = {
    ...grassRow,
    resistanceCount: 0,
    resistantMembers: [],
    type: "普通",
    weakCount: 0,
    weakMembers: [],
  };
  render(
    <TeamTypeAnalysisPanel
      analysis={{
        ...analysis,
        riskRows: [grassRow],
        rows: [grassRow, neutralRow],
      }}
    />,
  );

  expect(screen.queryByRole("button", { name: /普通/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "全部" }));
  expect(screen.getByRole("button", { name: /普通.*弱 0.*抗 0/ })).toBeVisible();
});

test("uses an actionable empty state", () => {
  render(
    <TeamTypeAnalysisPanel
      analysis={{ configuredCount: 0, riskRows: [], rows: [], skippedCount: 0 }}
    />,
  );
  expect(screen.getByText("添加精灵后查看")).toBeVisible();
});
