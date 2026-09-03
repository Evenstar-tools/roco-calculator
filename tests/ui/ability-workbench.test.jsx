import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";

const snapshot = {
  meta: { id: "test-snapshot" },
  skills: [
    { id: "quick", name: "快速移动", category: "status", basePower: 0 },
  ],
  spirits: [
    {
      asset: { localUrl: "/assets/spirit-test/speed-dog.png" },
      fullName: "音速犬",
      id: "spirit_db5a2cb398dc0385",
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
    spiritId: "spirit_db5a2cb398dc0385",
  };
}

function chooseSpeedTarget(name) {
  const input = screen.getByRole("combobox", { name: "速度目标精灵" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name } });
  const option = screen.getAllByRole("option", { name: new RegExp(name) })[0];
  if (!option) throw new Error(`未找到速度目标：${name}`);
  fireEvent.mouseDown(option);
  fireEvent.click(option);
  return input;
}

test("满三项后可点第四项并明确替换一个已选个体值", async () => {
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

  const investments = screen.getByRole("group", { name: "个体值分配" });
  await user.click(within(investments).getByRole("button", { name: /选择物防/ }));
  const replacement = screen.getByRole("dialog", { name: "替换个体值" });
  expect(replacement).toHaveTextContent("要将物防设为 60，请选择替换一项");
  await user.click(within(replacement).getByRole("button", { name: "替换生命" }));

  expect(within(investments).getByRole("button", { name: /取消物防/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("已用 3 / 3")).toBeVisible();
});

test("个体值分配同时显示属性图标、实际面板值和个体值", () => {
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

  const speed = within(screen.getByRole("group", { name: "个体值分配" }))
    .getByRole("button", { name: /取消速度个体值/ });
  expect(within(speed).getByLabelText("速度实际值")).toHaveTextContent("225");
  expect(speed).toHaveTextContent("个体60");
  expect(speed.querySelector('img[src="/assets/stats/speed.png"]')).toBeInTheDocument();
});

test("生命物防魔防占满三项时按三种防御性格对比", () => {
  render(
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
  );

  const builds = screen.getByRole("region", { name: "耐久方案对比" });
  const cards = within(builds).getAllByRole("article");
  expect(cards).toHaveLength(3);
  expect(within(builds).getAllByRole("heading", { level: 5 }).map((heading) => heading.textContent))
    .toEqual(["综合承伤", "物理承伤", "魔法承伤"]);
  expect(cards[0]).toHaveTextContent("性格：沉默（+生命 -物攻）");
  expect(cards[1]).toHaveTextContent("性格：稳重（+物防 -物攻）");
  expect(cards[2]).toHaveTextContent("性格：警惕（+魔防 -物攻）");
  expect(within(builds).queryByText(/为什么只有一个方案|共同最优方案|三种目标一致/))
    .not.toBeInTheDocument();

  const firstCard = cards[0];
  expect(
    within(firstCard).getAllByRole("term").map((term) => term.textContent),
  ).toEqual(["速度", "综合耐久", "物理耐久", "魔法耐久"]);
  expect(within(firstCard).getByRole("button", { name: "应用到成员" })).toBeEnabled();
});

test("速度排行榜横轴支持多选口径，默认极速、满速和无速", async () => {
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

  expect(screen.queryByRole("slider", { name: "速度目标轴" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "速度排行榜横轴" })).toHaveAttribute("tabindex", "0");
  expect(screen.getByLabelText("速度目标口径")).toHaveTextContent("3种口径");
  expect(screen.getByRole("checkbox", { name: "极速" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "满速" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "无速度" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "仅速度性格" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "减速度" })).not.toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "减速度" }));
  expect(screen.getByLabelText("速度目标口径")).toHaveTextContent("4种口径");
});

test("目标精灵支持输入搜索并从带头像和速度的候选项锁定", async () => {
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

  const input = screen.getByRole("combobox", { name: "速度目标精灵" });
  await user.click(input);
  await user.clear(input);
  await user.type(input, "音速");
  const listbox = screen.getByRole("listbox", { name: "速度目标候选" });
  const option = within(listbox).getByRole("option", { name: /音速犬.*260.*极速/ });
  expect(option.querySelector("img")).toBeInTheDocument();
  await user.click(option);
  expect(input.value).toMatch(/^音速犬 · 260（极速）$/);
});

test("锁定目标时只平滑移动速度横轴并居中目标", async () => {
  const previousScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  const scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });

  try {
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

    chooseSpeedTarget("首领象");
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({
      behavior: "smooth",
      left: expect.any(Number),
    })));
  } finally {
    if (previousScrollTo) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", previousScrollTo);
    } else {
      delete HTMLElement.prototype.scrollTo;
    }
  }
});

test("速度表默认收起，展开后按档位展示全部合格精灵并可选目标", async () => {
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

  expect(screen.queryByRole("table", { name: "速度档位表" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /展开速度表/ }));

  const table = screen.getByRole("table", { name: "速度档位表" });
  const speeds = within(table).getAllByRole("rowheader").map((cell) => Number(cell.textContent));
  expect(speeds).toEqual([...speeds].sort((left, right) => right - left));
  expect(within(table).getAllByRole("button", { name: /在速度表选择音速犬/ })).not.toHaveLength(0);
  expect(within(table).getAllByRole("button", { name: /在速度表选择首领象/ })).not.toHaveLength(0);

  await user.click(within(table).getAllByRole("button", { name: /在速度表选择音速犬/ })[0]);
  expect(screen.getByRole("combobox", { name: "速度目标精灵" }).value)
    .toMatch(/^音速犬 · \d+（/);
});

test("携带速度状态技能时可勾选并用加速后的本体速度比较", async () => {
  const user = userEvent.setup();
  render(
    <AbilityWorkbench
      configuration={{
        ...member({
          hp: 60,
          magicalAttack: 0,
          magicalDefense: 0,
          physicalAttack: 60,
          physicalDefense: 0,
          speed: 60,
        }),
        skills: { four: ["quick", null, null, null], single: null },
      }}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  expect(screen.getByText("当前 225")).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "快速移动 +80" }));
  expect(screen.getByText("当前 305")).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "速度排行榜横轴" }))
      .getByText("当前配置")
      .closest("div"),
  ).toHaveTextContent("305");
});

test("层数型特性按所选层数累计本体速度", async () => {
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
      snapshot={{
        ...snapshot,
        spirits: snapshot.spirits.map((spirit) => spirit.id === "spirit_db5a2cb398dc0385"
          ? { ...spirit, traitIds: ["swarm"] }
          : spirit),
        traits: [{ id: "swarm", name: "虫群突袭" }],
      }}
      source={{ index: 0, kind: "member" }}
    />,
  );

  const stacks = screen.getByRole("combobox", { name: "虫群突袭层数" });
  await user.selectOptions(stacks, "trait:swarm:3");
  expect(stacks).toHaveValue("trait:swarm:3");
  expect(screen.getByText("本体额外速度").parentElement)
    .toHaveTextContent("当前 327");
  expect(screen.queryByText(/= 面板/)).not.toBeInTheDocument();
});

test("耐久目标结果不同时保留综合、物理、魔法三栏", () => {
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

  const builds = screen.getByRole("region", { name: "耐久方案对比" });
  expect(
    within(builds).getAllByRole("heading", { level: 5 }).map((heading) => heading.textContent),
  ).toEqual(["综合承伤", "物理承伤", "魔法承伤"]);
});

test("应用方案后给出明确成功反馈", async () => {
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
      onApplyMember={() => true}
      snapshot={snapshot}
      source={{ index: 0, kind: "member" }}
    />,
  );

  await user.click(
    within(screen.getByRole("region", { name: "耐久方案对比" })).getAllByRole(
      "button",
      { name: "应用到成员" },
    )[0],
  );
  expect(screen.getByRole("status")).toHaveTextContent("方案已应用到成员");
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

  expect(screen.getByRole("alert")).toHaveTextContent("历史配置不符合个体值分配规则");
  expect(screen.getByText("54")).toBeVisible();
  expect(screen.queryByRole("region", { name: "耐久方案对比" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清空个体值并重选" }));
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
  await user.click(buttons[1]);

  expect(onApplyMember).toHaveBeenCalledWith(
    expect.objectContaining({
      displayIvs: expect.objectContaining({
        hp: expect.any(Number),
        physicalDefense: expect.any(Number),
      }),
      spiritId: "spirit_db5a2cb398dc0385",
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
  const targetPicker = chooseSpeedTarget("音速犬");
  const selectedTarget = targetPicker.value;
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
    )[1],
  );

  expect(screen.getByRole("combobox", { name: "速度目标精灵" })).toHaveValue(selectedTarget);
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
    )[1],
  );

  expect(onApplySide).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(screen.getByLabelText("当前配置摘要").textContent).not.toBe(before),
  );
  expect(screen.queryByText(/分析草稿尚未应用/)).not.toBeInTheDocument();
});

test("rebuilds the draft when the same member receives an external configuration", async () => {
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

  const selectedTarget = chooseSpeedTarget("首领象").value;
  rendered.rerender(
    <AbilityWorkbench
      configuration={second}
      onApplyMember={vi.fn()}
      snapshot={snapshot}
      source={source}
    />,
  );

  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "速度目标精灵" })).toHaveValue(selectedTarget),
  );
  const investments = screen.getByRole("group", { name: "个体值分配" });
  expect(within(investments).getByRole("button", { name: /取消物防个体值/ })).toBeEnabled();
  expect(within(investments).getByRole("button", { name: /取消魔防个体值/ })).toBeEnabled();
  expect(within(investments).getByRole("button", { name: /取消速度个体值/ })).toBeEnabled();
  expect(screen.queryByText(/分析草稿尚未应用/)).not.toBeInTheDocument();
});

test("does not mark a normalized incoming configuration dirty on first render", async () => {
  const onDirtyChange = vi.fn();
  render(
    <AbilityWorkbench
      configuration={{
        displayIvs: { physicalAttack: 60 },
        skills: { four: [], single: null },
        spiritId: "spirit_db5a2cb398dc0385",
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
  expect(targetPicker.value).toMatch(/^音速犬 · \d+（/);
  chooseSpeedTarget("首领象");
  expect(targetPicker.value).toMatch(/^首领象 · \d+（/);
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
