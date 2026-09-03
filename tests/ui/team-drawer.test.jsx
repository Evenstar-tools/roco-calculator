import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { TeamDrawer } from "../../src/components/TeamDrawer.jsx";
import { teamPresetsRepository } from "../../src/state/team-presets.js";

const snapshot = {
  learnsets: [
    {
      skillIds: ["fire-a", "fire-b", "fire-c", "fire-d"],
      spiritId: "sonic-dog",
    },
    {
      skillIds: ["water-a"],
      spiritId: "water-spirit",
    },
  ],
  skills: [
    {
      basePower: 80,
      category: "physical",
      cost: 1,
      id: "fire-a",
      name: "风力冲击",
      type: "火",
    },
    {
      basePower: 60,
      category: "magical",
      cost: 1,
      id: "fire-b",
      name: "火焰喷发",
      type: "火",
    },
    {
      basePower: null,
      category: "status",
      cost: 2,
      id: "fire-c",
      name: "热身",
      type: "火",
    },
    {
      basePower: null,
      category: "defense",
      cost: 2,
      id: "fire-d",
      name: "火盾",
      type: "火",
    },
    {
      basePower: 60,
      category: "magical",
      cost: 1,
      id: "water-a",
      name: "水之波纹",
      type: "水",
    },
  ],
  spirits: [
    {
      asset: null,
      fullName: "音速犬",
      id: "sonic-dog",
      raceStats: {
        hp: 85,
        magicalAttack: 46,
        magicalDefense: 82,
        physicalAttack: 128,
        physicalDefense: 101,
        speed: 120,
      },
      stage: "三阶",
      traitName: "专注力",
      types: ["火"],
    },
    {
      asset: null,
      fullName: "水灵",
      id: "water-spirit",
      raceStats: {
        hp: 125,
        magicalAttack: 127,
        magicalDefense: 132,
        physicalAttack: 58,
        physicalDefense: 94,
        speed: 85,
      },
      stage: "三阶",
      traitName: "浸润",
      types: ["水"],
    },
  ],
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function DrawerHarness({
  analysisEntry,
  getSpiritConfiguration = () => null,
  onApply = vi.fn(),
  onApplyAnalysisSide = vi.fn(),
  onCaptureSide = vi.fn(),
  onDeleteTeamOverride,
  spiritChoices,
  snapshotOverride = snapshot,
}) {
  const triggerRef = useRef(null);
  const [store] = useState(() => {
    let id = 0;
    return teamPresetsRepository({
      idFactory: () => `team-${(id += 1)}`,
      now: () => "2026-07-24T00:00:00.000Z",
      storage: memoryStorage(),
    });
  });
  const [open, setOpen] = useState(true);
  const [teamsState, setTeamsState] = useState(() => store.load(snapshotOverride));

  return (
    <>
      <button onClick={() => setOpen(true)} ref={triggerRef} type="button">
        打开队伍
      </button>
      <TeamDrawer
        analysisEntry={analysisEntry}
        getSpiritConfiguration={getSpiritConfiguration}
        onActiveTeamChange={(id) =>
          setTeamsState((state) => store.setActive(state, id))
        }
        onApply={onApply}
        onApplyAnalysisSide={onApplyAnalysisSide}
        onCaptureSide={onCaptureSide}
        onClose={() => setOpen(false)}
        onCreateTeam={(name) =>
          setTeamsState((state) => store.create(state, name))
        }
        onDeleteTeam={
          onDeleteTeamOverride ??
          ((id) => setTeamsState((state) => store.remove(state, id)))
        }
        onDuplicateTeam={(id) =>
          setTeamsState((state) => store.duplicate(state, id))
        }
        onMemberChange={(teamId, index, member) =>
          setTeamsState((state) =>
            store.updateMember(state, teamId, index, member),
          )
        }
        onRenameTeam={(id, name) =>
          setTeamsState((state) => store.rename(state, id, name))
        }
        onAnalysisEntryClear={() => {}}
        open={open}
        returnFocusRef={triggerRef}
        snapshot={snapshotOverride}
        spiritChoices={spiritChoices}
        teamsState={teamsState}
      />
    </>
  );
}

test("opens a temporary calculator-side analysis without creating a team slot", async () => {
  const onApplyAnalysisSide = vi.fn();
  const user = userEvent.setup();
  render(
    <DrawerHarness
      analysisEntry={{
        configuration: {
          displayIvs: {
            hp: 60,
            magicalAttack: 0,
            magicalDefense: 0,
            physicalAttack: 60,
            physicalDefense: 0,
            speed: 60,
          },
          natureId: "neutral",
          skills: { four: [], single: null },
          spiritId: "sonic-dog",
        },
        side: "attacker",
      }}
      onApplyAnalysisSide={onApplyAnalysisSide}
    />,
  );

  expect(screen.getByText("临时分析 · 不占队伍位置")).toBeVisible();
  expect(screen.queryByRole("list", { name: "队伍成员" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "能力分析" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const builds = screen.getByRole("region", { name: "耐久方案对比" });
  await user.click(within(builds).getAllByRole("button", { name: "应用回攻击方" })[0]);
  expect(onApplyAnalysisSide).toHaveBeenCalledWith(
    "attacker",
    expect.objectContaining({ spiritId: "sonic-dog" }),
  );
});

test("asks before discarding an unapplied ability draft", async () => {
  const confirmDiscard = vi.fn(() => false);
  vi.stubGlobal("confirm", confirmDiscard);
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "能力分析" }));
  const investment = screen.getByRole("button", { name: /选择物攻个体值/ });
  await user.click(investment);
  expect(investment).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "能力分析" }));
  expect(confirmDiscard).not.toHaveBeenCalled();

  await user.click(
    screen.getByRole("button", { name: "队伍分析" }),
  );
  expect(confirmDiscard).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "能力分析" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await user.click(screen.getByRole("button", { name: "关闭队伍" }));

  expect(confirmDiscard).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("dialog", { name: "队伍" })).toBeVisible();

  confirmDiscard.mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "关闭队伍" }));
  expect(screen.queryByRole("dialog", { name: "队伍" })).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});

test("keeps a dirty draft guarded when a confirmed navigation action fails", async () => {
  const confirmDiscard = vi.fn(() => true);
  const onDeleteTeamOverride = vi.fn(() => false);
  vi.stubGlobal("confirm", confirmDiscard);
  const user = userEvent.setup();
  render(<DrawerHarness onDeleteTeamOverride={onDeleteTeamOverride} />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "能力分析" }));
  await user.click(screen.getByRole("button", { name: /选择物攻个体值/ }));

  await user.click(screen.getByRole("button", { name: "删除队伍" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(onDeleteTeamOverride).toHaveBeenCalledOnce();
  confirmDiscard.mockReturnValue(false);
  await user.click(screen.getByRole("button", { name: "关闭队伍" }));

  expect(confirmDiscard).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("dialog", { name: "队伍" })).toBeVisible();
  vi.unstubAllGlobals();
});

test("uses the calculator spirit choices in the team member picker", async () => {
  const user = userEvent.setup();
  const spiritChoices = snapshot.spirits.map((spirit) => ({
    ...spirit,
    assetUrl: spirit.asset?.localUrl ?? null,
    favoriteState: spirit.id === "water-spirit" ? "manual" : null,
  }));
  render(<DrawerHarness spiritChoices={spiritChoices} />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("combobox", { name: "成员精灵" }));

  const options = within(screen.getByRole("listbox")).getAllByRole("option");
  expect(options[0]).toHaveTextContent("水灵");
  expect(
    within(screen.getByRole("listbox")).queryByRole("option", {
      name: /音速犬/,
    }),
  ).not.toBeInTheDocument();
});

test("creates and edits one of six team members", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  expect(screen.getByRole("dialog", { name: "队伍" })).toBeVisible();
  expect(screen.getByRole("button", { name: "关闭队伍" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "新建队伍" }));

  const roster = screen.getByRole("list", { name: "队伍成员" });
  expect(within(roster).getAllByRole("listitem")).toHaveLength(6);
  expect(
    screen.queryByRole("button", { name: /收藏/ }),
  ).not.toBeInTheDocument();
  await user.click(
    within(roster).getByRole("button", { name: "编辑空位 1" }),
  );

  const spiritPicker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(spiritPicker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  await waitFor(() =>
    expect(
      within(roster).getByRole("button", { name: "编辑音速犬" }),
    ).toBeVisible(),
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "成员性格" }),
    "adamant",
  );
  const attackIv = screen.getByRole("spinbutton", { name: "物攻个体" });
  await user.clear(attackIv);
  await user.type(attackIv, "60");

  await waitFor(() => {
    expect(screen.getByText("+20% ↑")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "成员技能1" })).toHaveValue(
      "风力冲击",
    );
    expect(screen.getAllByRole("combobox", { name: /成员技能/ })).toHaveLength(
      4,
    );
  });
});

test("configures one of 18 elemental bloodlines or the boss bloodline", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const spiritPicker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(spiritPicker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  const bloodline = screen.getByRole("combobox", { name: "血脉" });
  expect(within(bloodline).getAllByRole("option")).toHaveLength(19);
  await user.selectOptions(bloodline, "fire");
  expect(bloodline).toHaveValue("fire");

  await user.click(screen.getByRole("button", { name: "编辑空位 2" }));
  await user.click(screen.getByRole("button", { name: "编辑音速犬" }));
  expect(screen.getByRole("combobox", { name: "血脉" })).toHaveValue("fire");
});

test("copies a personal configuration when selecting a member and never inherits the previous spirit", async () => {
  const personalConfig = {
    displayIvs: {
      hp: 1,
      speed: 2,
      physicalAttack: 60,
      magicalAttack: 3,
      physicalDefense: 4,
      magicalDefense: 5,
    },
    natureId: "adamant",
    skills: {
      four: ["fire-a", "fire-b", null, null],
      single: "fire-a",
    },
    spiritId: "sonic-dog",
  };
  const user = userEvent.setup();
  render(
    <DrawerHarness
      getSpiritConfiguration={(spiritId) =>
        spiritId === "sonic-dog" ? personalConfig : null
      }
    />,
  );

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "编辑空位 1" }));
  const editor = screen.getByRole("region", { name: "成员 1 配置" });
  const picker = within(editor).getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(within(editor).getByRole("option", { name: /音速犬/ }));

  expect(within(editor).getByRole("combobox", { name: "成员性格" })).toHaveValue(
    "adamant",
  );
  expect(within(editor).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(
    60,
  );
  expect(within(editor).getByRole("combobox", { name: "成员技能1" })).toHaveValue(
    "风力冲击",
  );

  fireEvent.change(picker, { target: { value: "水灵" } });
  await user.click(within(editor).getByRole("option", { name: /水灵/ }));

  expect(within(editor).getByRole("combobox", { name: "成员性格" })).toHaveValue(
    "neutral",
  );
  expect(within(editor).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(
    0,
  );
  expect(within(editor).getByRole("combobox", { name: "成员技能1" })).toHaveValue(
    "水之波纹",
  );
  expect(personalConfig).toMatchObject({
    natureId: "adamant",
    skills: { four: ["fire-a", "fire-b", null, null] },
  });
});

test("applies a member as attack or defense and confirms deletion inline", async () => {
  const onApply = vi.fn();
  const user = userEvent.setup();
  render(<DrawerHarness onApply={onApply} />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "编辑空位 1" }));
  const spiritPicker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(spiritPicker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  const applyAttack = screen.getByRole("button", {
    name: "音速犬设为攻击方",
  });
  const applyDefense = screen.getByRole("button", {
    name: "音速犬设为防御方",
  });
  expect(applyAttack).toHaveAttribute("title", "设为攻击方");
  expect(applyDefense).toHaveAttribute("title", "设为防御方");
  await user.click(applyAttack);
  await user.click(
    applyDefense,
  );
  expect(onApply).toHaveBeenNthCalledWith(
    1,
    "attacker",
    expect.objectContaining({ spiritId: "sonic-dog" }),
  );
  expect(onApply).toHaveBeenNthCalledWith(
    2,
    "defender",
    expect.objectContaining({ spiritId: "sonic-dog" }),
  );

  await user.click(screen.getByRole("button", { name: "删除队伍" }));
  expect(screen.getByText("删除当前队伍？")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(
    screen.queryByRole("list", { name: "队伍成员" }),
  ).not.toBeInTheDocument();
});

test("captures the current attack or defense configuration into the selected slot", async () => {
  const onCaptureSide = vi.fn();
  const user = userEvent.setup();
  render(<DrawerHarness onCaptureSide={onCaptureSide} />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));

  await user.click(
    screen.getByRole("button", { name: "用当前攻击方填入1号位" }),
  );
  await user.click(
    screen.getByRole("button", { name: "用当前防御方填入1号位" }),
  );

  expect(onCaptureSide).toHaveBeenNthCalledWith(
    1,
    "attacker",
    "team-1",
    0,
  );
  expect(onCaptureSide).toHaveBeenNthCalledWith(
    2,
    "defender",
    "team-1",
    0,
  );
});

test("switches the right pane between member editing and team defense analysis", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "编辑空位 1" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  expect(screen.getByRole("region", { name: "成员 1 配置" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  expect(screen.getByRole("region", { name: "队伍分析" })).toBeVisible();
  expect(screen.getByRole("list", { name: "队伍成员" })).toBeVisible();
  expect(screen.getByRole("table", { name: "队伍防守与打击面矩阵" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "成员 1 配置" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "成员" }));
  expect(screen.getByRole("region", { name: "成员 1 配置" })).toBeVisible();
});

test("keeps the vertical roster beside three top-level member analysis and matchup panes", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));

  const paneTabs = screen.getByLabelText("队伍面板");
  expect(within(paneTabs).getByRole("button", { name: "成员" })).toBeVisible();
  expect(within(paneTabs).getByRole("button", { name: "队伍分析" })).toBeVisible();
  expect(within(paneTabs).getByRole("button", { name: "对位" })).toBeVisible();

  await user.click(within(paneTabs).getByRole("button", { name: "队伍分析" }));
  expect(screen.getByRole("list", { name: "队伍成员" })).toBeVisible();
  expect(screen.queryByRole("list", { name: "分析队伍成员" })).not.toBeInTheDocument();
  expect(screen.getByRole("table", { name: "队伍防守与打击面矩阵" })).toBeVisible();

  await user.click(within(paneTabs).getByRole("button", { name: "对位" }));
  expect(screen.getByRole("list", { name: "队伍成员" })).toBeVisible();
  expect(screen.queryByRole("list", { name: "分析队伍成员" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "导入队伍" }));
  expect(screen.getByRole("table", { name: "队伍六乘六对位" })).toBeVisible();
});

test("opens the icon-led analysis matrix without changing the member editor layout", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  expect(
    within(panel).getByRole("table", { name: "队伍防守与打击面矩阵" }),
  ).toBeVisible();
  expect(within(panel).getByRole("complementary", { name: "防守概览" })).toBeVisible();
  expect(within(panel).getByRole("complementary", { name: "打击概览" })).toBeVisible();
  expect(within(panel).getByRole("checkbox", { name: "计入愿力冲击" })).toBeVisible();
});

test("does not count immune defense cells as resistances", async () => {
  const user = userEvent.setup();
  render(
    <DrawerHarness
      snapshotOverride={{
        ...snapshot,
        typeChart: {
          matrix: [
            [1, 0],
            [1, 1],
          ],
          types: ["草", "火"],
        },
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  const summary = screen.getByRole("complementary", { name: "防守概览" });
  expect(within(within(summary).getByText("抗性").closest("span")).getByText("0"))
    .toBeVisible();
  expect(within(within(summary).getByText("免疫").closest("span")).getByText("1"))
    .toBeVisible();
});

test("switches to skill coverage and traces a matrix cell to its source skill", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  await user.click(within(panel).getByRole("button", { name: "技能打击面" }));
  await user.click(
    within(panel).getByRole("button", { name: "音速犬 对草打击×2" }),
  );

  const detail = within(panel).getByLabelText("单元格详情");
  expect(within(detail).getByText("音速犬")).toBeVisible();
  expect(within(detail).getByText("风力冲击")).toBeVisible();
  expect(within(detail).getByText("×2")).toBeVisible();
});

test("clears a selected matrix cell when switching matrix modes", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  await user.click(
    within(panel).getByRole("button", { name: "音速犬 对草承伤×0.5" }),
  );
  expect(within(panel).getByLabelText("单元格详情")).toBeVisible();

  await user.click(within(panel).getByRole("button", { name: "技能打击面" }));
  expect(within(panel).queryByLabelText("单元格详情")).not.toBeInTheDocument();
});

test("does not restore a stale cell detail after changing analysis views", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  await user.click(
    within(panel).getByRole("button", { name: "音速犬 对草承伤×0.5" }),
  );
  const paneTabs = screen.getByLabelText("队伍面板");
  await user.click(within(paneTabs).getByRole("button", { name: "对位" }));
  await user.click(within(paneTabs).getByRole("button", { name: "队伍分析" }));

  expect(within(panel).queryByLabelText("单元格详情")).not.toBeInTheDocument();
});

test("opens matchup as one import-and-edit workflow without redundant source tabs", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));
  await user.click(screen.getByRole("button", { name: "对位" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });

  expect(within(panel).queryByRole("button", { name: "已保存队伍" })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("button", { name: "现场编辑" })).not.toBeInTheDocument();
  expect(within(panel).getByRole("region", { name: "现场队伍编辑" })).toBeVisible();
  expect(within(panel).getByRole("combobox", { name: "导入现有队伍" })).toBeVisible();
  expect(within(panel).getByText("添加现场对手后查看对位")).toBeVisible();
});

test("opens an isolated现场 opponent editor directly from the matchup page", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));
  await user.click(screen.getByRole("button", { name: "对位" }));
  const panel = screen.getByRole("region", { name: "队伍分析" });

  expect(within(panel).getByRole("region", { name: "现场队伍编辑" })).toBeVisible();
  expect(within(panel).getByRole("list", { name: "现场队伍成员" })).toBeVisible();
  expect(within(panel).getByRole("combobox", { name: "导入现有队伍" })).toBeVisible();
  expect(within(panel).getByRole("button", { name: "导入队伍" })).toBeVisible();
  expect(
    within(panel).queryByRole("region", { name: "成员 1 配置" }),
  ).not.toBeInTheDocument();
});

test("imports a saved opponent into an editable现场 copy without changing the saved team", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const mainPicker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(mainPicker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));
  await user.click(screen.getByRole("button", { name: "对位" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  await user.click(within(panel).getByRole("button", { name: "导入队伍" }));
  expect(within(panel).getByRole("button", { name: "编辑现场音速犬 1" })).toBeVisible();
  await user.click(within(panel).getByRole("button", { name: "编辑现场音速犬 1" }));

  const editor = within(panel).getByRole("region", { name: "成员 1 配置" });
  const draftPicker = within(editor).getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(draftPicker, { target: { value: "水灵" } });
  await user.click(within(editor).getByRole("option", { name: /水灵/ }));
  await waitFor(() =>
    expect(
      within(panel).getByRole("table", { name: "队伍六乘六对位" }),
    ).toHaveTextContent("水灵"),
  );

  await user.click(within(panel).getByRole("button", { name: "导入队伍" }));
  expect(
    within(panel).getByRole("table", { name: "队伍六乘六对位" }),
  ).toHaveTextContent("音速犬");
  expect(
    within(panel).getByRole("table", { name: "队伍六乘六对位" }),
  ).not.toHaveTextContent("水灵");
});

test("allows现场 editing when there is no other saved team", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "对位" }));
  const panel = screen.getByRole("region", { name: "队伍分析" });

  expect(within(panel).getByRole("region", { name: "现场队伍编辑" })).toBeVisible();
  expect(within(panel).getByText("添加现场对手后查看对位")).toBeVisible();

  await user.click(within(panel).getByRole("button", { name: "编辑现场空位 1" }));
  const editor = within(panel).getByRole("region", { name: "成员 1 配置" });
  const picker = within(editor).getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "水灵" } });
  await user.click(within(editor).getByRole("option", { name: /水灵/ }));
  expect(
    within(panel).getByRole("table", { name: "队伍六乘六对位" }),
  ).toHaveTextContent("水灵");
});

test("clears matchup detail when the attack direction changes", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));
  await user.click(screen.getByRole("button", { name: "对位" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  await user.click(within(panel).getByRole("button", { name: "导入队伍" }));
  const table = within(panel).getByRole("table", { name: "队伍六乘六对位" });
  await user.click(within(table).getAllByRole("button")[0]);
  expect(within(panel).getByLabelText("单元格详情")).toBeVisible();

  await user.click(within(panel).getByRole("button", { name: "切换攻击方向" }));
  expect(within(panel).queryByLabelText("单元格详情")).not.toBeInTheDocument();
});

test("clears matchup detail when another saved team is imported", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));
  await user.click(screen.getByRole("button", { name: "复制队伍" }));
  await user.click(screen.getByRole("button", { name: "对位" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  await user.click(within(panel).getByRole("button", { name: "导入队伍" }));
  const table = within(panel).getByRole("table", { name: "队伍六乘六对位" });
  await user.click(within(table).getAllByRole("button")[0]);
  expect(within(panel).getByLabelText("单元格详情")).toBeVisible();

  const opponentPicker = within(panel).getByRole("combobox", { name: "导入现有队伍" });
  await user.selectOptions(opponentPicker, within(opponentPicker).getAllByRole("option")[1]);
  await user.click(within(panel).getByRole("button", { name: "导入队伍" }));
  expect(within(panel).queryByLabelText("单元格详情")).not.toBeInTheDocument();
});

test("opens the matrix directly without a separate overview home", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  const picker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));
  await user.click(screen.getByRole("button", { name: "队伍分析" }));

  const panel = screen.getByRole("region", { name: "队伍分析" });
  expect(within(panel).getByRole("table", { name: "队伍防守与打击面矩阵" })).toBeVisible();
  expect(within(panel).queryByRole("button", { name: "概览视图" })).not.toBeInTheDocument();
});

test("closes with Escape and restores focus to the trigger", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.keyboard("{Escape}");

  expect(
    screen.queryByRole("dialog", { name: "队伍" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开队伍" })).toHaveFocus();
});
