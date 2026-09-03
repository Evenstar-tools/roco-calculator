import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";

const snapshot = {
  meta: { id: "test-snapshot" },
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
    },
    {
      asset: null,
      fullName: "首领象",
      id: "boss-elephant",
      raceStats: {
        hp: 100,
        magicalAttack: 80,
        magicalDefense: 100,
        physicalAttack: 100,
        physicalDefense: 100,
        speed: 90,
      },
      sourceCategory: "首领形态",
      stage: "首领",
    },
  ],
};

function member(displayIvs) {
  return {
    displayIvs,
    natureId: "neutral",
    skills: { four: [], single: null },
    spiritId: "sonic-dog",
  };
}

test("prevents selecting a fourth binary investment and reopens the slot after deselection", async () => {
  const user = userEvent.setup();
  render(
    <AbilityWorkbench
      configuration={member({
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      })}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  const investments = screen.getByRole("group", { name: "能力分析个体投资" });
  expect(within(investments).getByRole("button", { name: /选择物防/ })).toBeDisabled();

  await user.click(within(investments).getByRole("button", { name: /取消生命/ }));
  await user.click(within(investments).getByRole("button", { name: /选择物防/ }));

  expect(within(investments).getByRole("button", { name: /取消物防/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("已用 3 / 3")).toBeVisible();
});

test("keeps historical unsupported values visible and pauses analysis until explicit repair", async () => {
  const user = userEvent.setup();
  render(
    <AbilityWorkbench
      configuration={member({
        hp: 54,
        magicalAttack: 48,
        magicalDefense: 60,
        physicalAttack: 60,
        physicalDefense: 60,
        speed: 60,
      })}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("历史配置不符合能力分析规则");
  expect(screen.getByText("54")).toBeVisible();
  expect(screen.queryByRole("region", { name: "耐久方案对比" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清空投资草稿并重选" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "耐久方案对比" })).toBeVisible();
});

test("applies an explicit recommendation to the member without mutating the source object", async () => {
  const user = userEvent.setup();
  const original = member({
    hp: 60,
    magicalAttack: 0,
    magicalDefense: 0,
    physicalAttack: 60,
    physicalDefense: 0,
    speed: 60,
  });
  const onApplyMember = vi.fn();
  render(
    <AbilityWorkbench
      configuration={original}
      onApplyMember={onApplyMember}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  const builds = screen.getByRole("region", { name: "耐久方案对比" });
  const buttons = within(builds).getAllByRole("button", { name: "应用到成员" });
  await user.click(buttons[0]);

  expect(onApplyMember).toHaveBeenCalledWith(
    expect.objectContaining({
      displayIvs: expect.objectContaining({
        hp: expect.any(Number),
        physicalDefense: expect.any(Number),
      }),
      spiritId: "sonic-dog",
    }),
  );
  expect(original.displayIvs).toEqual({
    hp: 60,
    magicalAttack: 0,
    magicalDefense: 0,
    physicalAttack: 60,
    physicalDefense: 0,
    speed: 60,
  });
});

test("keeps analysis context and advances the local baseline after a successful apply", async () => {
  const user = userEvent.setup();

  function ApplyHarness() {
    const [configuration, setConfiguration] = useState(() =>
      member({
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      }),
    );
    return (
      <AbilityWorkbench
        configuration={configuration}
        onApplyMember={(next) => {
          setConfiguration(next);
          return true;
        }}
        snapshot={snapshot}
        source={{ index: 0, kind: "member", teamId: "team-1" }}
      />
    );
  }

  render(<ApplyHarness />);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "速度目标精灵" }),
    "boss-elephant",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "推荐速度约束" }),
    "unlocked",
  );
  await user.click(screen.getByRole("button", { name: "物攻已锁" }));

  const previousHp = screen.getByLabelText("当前配置摘要").textContent;
  await user.click(
    within(screen.getByRole("region", { name: "耐久方案对比" })).getAllByRole(
      "button",
      { name: "应用到成员" },
    )[0],
  );

  expect(screen.getByRole("combobox", { name: "速度目标精灵" })).toHaveValue(
    "boss-elephant",
  );
  expect(screen.getByRole("combobox", { name: "推荐速度约束" })).toHaveValue(
    "unlocked",
  );
  expect(screen.getByRole("button", { name: "物攻未锁" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await waitFor(() =>
    expect(screen.getByLabelText("当前配置摘要").textContent).not.toBe(
      previousHp,
    ),
  );
  expect(screen.queryByText(/分析草稿尚未应用/)).not.toBeInTheDocument();
});

test("advances a temporary side baseline even when its entry prop stays unchanged", async () => {
  const user = userEvent.setup();
  const onApplySide = vi.fn(() => true);
  render(
    <AbilityWorkbench
      configuration={member({
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      })}
      onApplySide={onApplySide}
      snapshot={snapshot}
      source={{ kind: "side", side: "attacker" }}
    />,
  );

  const before = screen.getByLabelText("当前配置摘要").textContent;
  await user.click(
    within(screen.getByRole("region", { name: "耐久方案对比" })).getAllByRole(
      "button",
      { name: "应用回攻击方" },
    )[0],
  );

  expect(onApplySide).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(screen.getByLabelText("当前配置摘要").textContent).not.toBe(before),
  );
  expect(screen.queryByText(/分析草稿尚未应用/)).not.toBeInTheDocument();
});

test("rebuilds the draft when the same member receives an external configuration", async () => {
  const user = userEvent.setup();
  const source = { index: 0, kind: "member", teamId: "team-1" };
  const first = member({
    hp: 60,
    magicalAttack: 0,
    magicalDefense: 0,
    physicalAttack: 60,
    physicalDefense: 0,
    speed: 60,
  });
  const second = member({
    hp: 0,
    magicalAttack: 0,
    magicalDefense: 60,
    physicalAttack: 0,
    physicalDefense: 60,
    speed: 60,
  });
  const rendered = render(
    <AbilityWorkbench
      configuration={first}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={source}
    />,
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "速度目标精灵" }),
    "boss-elephant",
  );
  rendered.rerender(
    <AbilityWorkbench
      configuration={second}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={source}
    />,
  );

  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "速度目标精灵" })).toHaveValue(
      "sonic-dog",
    ),
  );
  const investments = screen.getByRole("group", { name: "能力分析个体投资" });
  expect(within(investments).getByRole("button", { name: /取消物防投资/ })).toBeEnabled();
  expect(within(investments).getByRole("button", { name: /取消魔防投资/ })).toBeEnabled();
  expect(within(investments).getByRole("button", { name: /取消速度投资/ })).toBeEnabled();
  expect(screen.queryByText(/分析草稿尚未应用/)).not.toBeInTheDocument();
});

test("does not mark a normalized incoming configuration dirty on first render", async () => {
  const onDirtyChange = vi.fn();
  render(
    <AbilityWorkbench
      configuration={{
        displayIvs: { physicalAttack: 60 },
        skills: { four: [], single: null },
        spiritId: "sonic-dog",
      }}
      onApplyMember={vi.fn()}
      onDirtyChange={onDirtyChange}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  expect(screen.queryByText(/分析草稿尚未应用/)).not.toBeInTheDocument();
});

test("marks target and solver constraint changes as an unapplied analysis draft", async () => {
  const user = userEvent.setup();
  const onDirtyChange = vi.fn();
  render(
    <AbilityWorkbench
      configuration={member({
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      })}
      onApplyMember={vi.fn()}
      onDirtyChange={onDirtyChange}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  onDirtyChange.mockClear();
  const targetPicker = screen.getByRole("combobox", {
    name: "速度目标精灵",
  });
  expect(targetPicker).toHaveValue("sonic-dog");
  await user.selectOptions(
    targetPicker,
    "boss-elephant",
  );
  expect(targetPicker).toHaveValue("boss-elephant");
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

  onDirtyChange.mockClear();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "推荐速度约束" }),
    "unlocked",
  );
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
});

test("restores the actual editor scroll position after viewing the full ranking", async () => {
  const user = userEvent.setup();
  const editor = document.createElement("div");
  editor.className = "team-drawer__editor-pane";
  document.body.append(editor);
  const rendered = render(
    <AbilityWorkbench
      configuration={member({
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 60,
        physicalAttack: 0,
        physicalDefense: 60,
        speed: 0,
      })}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
    { container: editor },
  );
  editor.scrollTop = 320;

  await user.click(screen.getByRole("button", { name: "查看完整耐久榜" }));
  await waitFor(() => expect(editor.scrollTop).toBe(0));
  expect(screen.getByRole("button", { name: "返回能力分析" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "返回能力分析" }));
  await waitFor(() => expect(editor.scrollTop).toBe(320));
  expect(screen.getByRole("button", { name: "查看完整耐久榜" })).toHaveFocus();

  rendered.unmount();
  editor.remove();
});
