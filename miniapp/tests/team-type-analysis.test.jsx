import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import TeamTypeAnalysisSheet from "../src/components/TeamTypeAnalysisSheet.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

const raceStats = {
  hp: 100,
  magicalAttack: 100,
  magicalDefense: 100,
  physicalAttack: 100,
  physicalDefense: 100,
  speed: 100,
};

function snapshotFixture() {
  return {
    learnsets: [
      { spiritId: "grass", skillIds: ["scratch"] },
      { spiritId: "fire", skillIds: ["scratch"] },
      { spiritId: "water", skillIds: ["scratch"] },
    ],
    meta: { id: "team-analysis", rulesVersion: "1.6.2" },
    skills: [{
      basePower: 35,
      category: "physical",
      id: "scratch",
      name: "抓挠",
      type: "普通",
    }],
    spirits: [
      { fullName: "草系成员", id: "grass", raceStats, traitIds: [], types: ["草"] },
      { fullName: "火系成员", id: "fire", raceStats, traitIds: [], types: ["火"] },
      { fullName: "水系成员", id: "water", raceStats, traitIds: [], types: ["水"] },
    ],
    traits: [],
  };
}

describe("mini-program team defensive analysis", () => {
  test("keeps the entry hidden until the default-off feature is enabled", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    const { rerender } = render(
      <BattleWorkspace snapshot={snapshot} store={store} />,
    );
    expect(screen.queryByRole("button", { name: "打开队伍防守面分析" }))
      .not.toBeInTheDocument();

    rerender(
      <BattleWorkspace
        teamAnalysisEnabled
        teamAnalysisMembers={["grass", "fire", null, null, null, null]}
        snapshot={snapshot}
        store={store}
      />,
    );
    expect(screen.getByRole("button", { name: "打开队伍防守面分析" }))
      .toHaveTextContent("已配置 2/6");
    expect(screen.getByRole("button", { name: "手机打开队伍防守面分析" }))
      .toHaveTextContent("队伍2/6");
  });

  test("edits six slots and expands risk details without leaving the sheet", () => {
    const snapshot = snapshotFixture();
    const onMembersChange = vi.fn();
    render(
      <TeamTypeAnalysisSheet
        members={["grass", "fire", null, null, null, null]}
        onClose={vi.fn()}
        onMembersChange={onMembersChange}
        open
        snapshot={snapshot}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "队伍防守面分析" });
    expect(within(dialog).getByText("已配置 2/6")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: /查看.+防守明细/u }).length)
      .toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "选择队伍成员 3" }));
    fireEvent.input(within(dialog).getByRole("textbox", { name: "搜索队伍精灵" }), {
      target: { value: "水系" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "选择水系成员" }));
    expect(onMembersChange).toHaveBeenCalledWith([
      "grass", "fire", "water", null, null, null,
    ]);

    const riskRow = within(dialog).getAllByRole("button", {
      name: /查看.+防守明细/u,
    })[0];
    fireEvent.click(riskRow);
    expect(within(dialog).getByText(/倍/u)).toBeInTheDocument();
  });
});
