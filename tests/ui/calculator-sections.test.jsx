import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { NatureStatsStep } from "../../src/components/NatureStatsStep.jsx";
import { SkillStep } from "../../src/components/SkillStep.jsx";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { SpiritStep } from "../../src/components/SpiritStep.jsx";

const attacker = {
  assetUrl: "/assets/spirits/sonic-dog.png",
  fullName: "音速犬",
  id: "sonic-dog",
  stage: "物攻型",
  traitDescription: "入场首回合，获得物攻+100%。",
  traitName: "专注力",
  types: ["火"],
};

const defender = {
  assetUrl: "/assets/spirits/water-spirit.png",
  fullName: "水灵",
  id: "water-spirit",
  stage: "物攻型",
  traitDescription: "使用水系技能后，全部技能能耗-1。",
  traitName: "湿润",
  types: ["水"],
};

const stats = [
  { key: "attack", label: "物攻", panel: 271, race: 128, displayIv: 60 },
  { key: "magicAttack", label: "魔攻", panel: 135, race: 46, displayIv: 60 },
  { key: "speed", label: "速度", panel: 225, race: 120, displayIv: 60 },
  { key: "hp", label: "HP", panel: 315, race: 85, displayIv: 60 },
  { key: "defense", label: "物防", panel: 171, race: 101, displayIv: 60 },
  { key: "magicDefense", label: "魔防", panel: 150, race: 82, displayIv: 60 },
];

test("header stays compact and exposes teams, version, theme, and menu controls", () => {
  render(<AppHeader dataVersion="S3 · 41360" onTeamsOpen={vi.fn()} />);

  expect(
    screen.getByRole("heading", { name: "洛克计算器" }),
  ).toBeVisible();
  expect(screen.getByText("S3 · 41360")).toBeVisible();
  expect(screen.getByRole("button", { name: "打开队伍" })).toHaveAttribute(
    "title",
    "队伍",
  );
  expect(screen.getByRole("button", { name: "切换主题" })).toHaveAttribute(
    "title",
    "切换主题",
  );
  expect(screen.getByRole("button", { name: "打开菜单" })).toHaveAttribute(
    "title",
    "菜单",
  );
});

test("spirit step preserves the mirrored original-site structure and swaps complete sides", async () => {
  const user = userEvent.setup();
  const onSwap = vi.fn();

  render(
    <SpiritStep
      attacker={attacker}
      defender={defender}
      onAttackerSelect={vi.fn()}
      onDefenderSelect={vi.fn()}
      onSwap={onSwap}
      spirits={[attacker, defender]}
    />,
  );

  const section = screen.getByRole("region", { name: "精灵配置" });
  expect(
    within(section).queryByRole("heading", { name: "选择精灵" }),
  ).not.toBeInTheDocument();
  expect(within(section).queryByText("选择精灵")).not.toBeInTheDocument();
  expect(within(section).getByText("攻击方")).toBeVisible();
  expect(within(section).getByText("防御方")).toBeVisible();
  expect(within(section).getByText("专注力")).toBeVisible();
  expect(within(section).getByText("湿润")).toBeVisible();

  await user.click(within(section).getByRole("button", { name: "交换双方完整配置" }));
  expect(onSwap).toHaveBeenCalledOnce();
});

test("shows the full trait description on pointer hover and keyboard focus", async () => {
  const user = userEvent.setup();
  render(
    <SpiritStep
      attacker={attacker}
      defender={defender}
      onAttackerSelect={vi.fn()}
      onDefenderSelect={vi.fn()}
      onSwap={vi.fn()}
      spirits={[attacker, defender]}
    />,
  );

  const attackerTrait = screen.getByText("专注力");
  expect(
    screen.queryByRole("tooltip", { name: "入场首回合，获得物攻+100%。" }),
  ).not.toBeInTheDocument();

  await user.hover(attackerTrait);
  expect(
    screen.getByRole("tooltip", { name: "入场首回合，获得物攻+100%。" }),
  ).toBeVisible();

  await user.unhover(attackerTrait);
  fireEvent.focus(attackerTrait);
  expect(
    screen.getByRole("tooltip", { name: "入场首回合，获得物攻+100%。" }),
  ).toBeVisible();
});

test("spirit search restores the selected name when Escape cancels the query", async () => {
  const user = userEvent.setup();
  const onAttackerSelect = vi.fn();

  render(
    <SpiritStep
      attacker={attacker}
      defender={defender}
      onAttackerSelect={onAttackerSelect}
      onDefenderSelect={vi.fn()}
      onSwap={vi.fn()}
      spirits={[attacker, defender]}
    />,
  );

  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.clear(input);
  await user.type(input, "水");
  expect(input).toHaveValue("水");

  await user.keyboard("{Escape}");

  expect(input).toHaveValue("音速犬");
  expect(onAttackerSelect).not.toHaveBeenCalled();

  await user.clear(input);
  await user.type(input, "水");
  await user.click(screen.getByRole("region", { name: "精灵配置" }));

  expect(input).toHaveValue("音速犬");
});

test("spirit search keeps all marked configurations ahead of ordinary spirits", async () => {
  const user = userEvent.setup();
  render(
    <SpiritPicker
      favoriteState={null}
      label="攻击方"
      onFavoriteToggle={vi.fn()}
      onSelect={vi.fn()}
      selected={null}
      side="attack"
      spirits={[
        {
          evolutionChainIds: ["ordinary"],
          favoriteState: null,
          fullName: "普通精灵",
          id: "ordinary",
        },
        {
          evolutionChainIds: ["complete"],
          favoriteState: "complete",
          fullName: "完整配置",
          id: "complete",
        },
        {
          evolutionChainIds: ["manual"],
          favoriteState: "manual",
          fullName: "手动收藏",
          id: "manual",
        },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));

  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual(["完整配置", "手动收藏", "普通精灵"]);
});

test("spirit preview loads twenty more favorites per scroll until all are visible", async () => {
  const user = userEvent.setup();
  const favorites = Array.from({ length: 45 }, (_, index) => ({
    evolutionChainIds: [`favorite-${index + 1}`],
    favoriteState: index % 2 === 0 ? "manual" : "complete",
    fullName: `收藏精灵${String(index + 1).padStart(2, "0")}`,
    id: `favorite-${index + 1}`,
  }));
  render(
    <SpiritPicker
      favoriteState={null}
      label="攻击方"
      onFavoriteToggle={vi.fn()}
      onSelect={vi.fn()}
      selected={null}
      side="attack"
      spirits={[
        ...favorites,
        {
          evolutionChainIds: ["ordinary"],
          favoriteState: null,
          fullName: "普通精灵",
          id: "ordinary",
        },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  const listbox = screen.getByRole("listbox");
  expect(screen.getAllByRole("option")).toHaveLength(12);
  expect(screen.queryByText("已预览所有已收藏精灵")).not.toBeInTheDocument();

  Object.defineProperties(listbox, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 300 },
    scrollTop: { configurable: true, value: 200, writable: true },
  });
  fireEvent.scroll(listbox);
  expect(screen.getAllByRole("option")).toHaveLength(32);
  expect(screen.queryByText("已预览所有已收藏精灵")).not.toBeInTheDocument();

  Object.defineProperties(listbox, {
    scrollHeight: { configurable: true, value: 500 },
    scrollTop: { configurable: true, value: 400, writable: true },
  });
  fireEvent.scroll(listbox);
  expect(screen.getAllByRole("option")).toHaveLength(45);
  expect(screen.getByText("已预览所有已收藏精灵")).toBeVisible();
  expect(screen.queryByRole("option", { name: /普通精灵/ })).not.toBeInTheDocument();
});

test("nature step keeps final panel, race, individual values, and level controls visible", async () => {
  const user = userEvent.setup();
  const onAttackerLevelChange = vi.fn();
  render(
    <NatureStatsStep
      attacker={{
        level: { label: "攻击能力等级", multiplier: 1, stage: 0 },
        nature: "固执（+物攻，-魔攻）",
        stats,
      }}
      defender={{
        level: { label: "防御能力等级", multiplier: 1, stage: 0 },
        nature: "普通（无修正）",
        stats,
      }}
      onAttackerIvChange={vi.fn()}
      onAttackerLevelChange={onAttackerLevelChange}
      onAttackerNatureChange={vi.fn()}
      onDefenderIvChange={vi.fn()}
      onDefenderLevelChange={vi.fn()}
      onDefenderNatureChange={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("region", { name: "性格配置" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "性格与个体" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "攻击方性格" })).toHaveValue(
    "adamant",
  );
  const attackerNature = screen.getByRole("combobox", {
    name: "攻击方性格",
  });
  expect(
    within(attackerNature).getByRole("option", {
      name: "固执（+物攻 -魔攻）",
    }),
  ).toBeVisible();
  expect(
    within(attackerNature).getByRole("option", {
      name: "踏实（+生命 -速度）",
    }),
  ).toBeVisible();
  expect(
    Array.from(attackerNature.querySelectorAll("optgroup")).map(
      (group) => group.label,
    ),
  ).toEqual(["+生命", "+物攻", "+魔攻", "+速度", "+物防", "+魔防"]);
  expect(screen.getAllByRole("option")).toHaveLength(62);
  expect(screen.getByText("+20% ↑")).toBeVisible();
  expect(screen.getByText("-10% ↓")).toBeVisible();
  expect(screen.getAllByRole("spinbutton")).toHaveLength(12);
  expect(screen.getAllByText("种:128")).toHaveLength(2);
  expect(screen.getAllByText("271")).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: "攻击方等级加一" }));
  expect(onAttackerLevelChange).toHaveBeenCalledWith(1);
});

test("nature step can reveal both attack and defense levels for each side", async () => {
  const user = userEvent.setup();
  const onAttackerLevelChange = vi.fn();
  const onDefenderLevelChange = vi.fn();
  render(
    <NatureStatsStep
      attacker={{
        levels: [
          { label: "攻击能力等级", multiplier: 1.2, role: "attack", stage: 2 },
          { label: "防御能力等级", multiplier: 1.1, role: "defense", stage: 1 },
        ],
        nature: "neutral",
        stats,
      }}
      defender={{
        levels: [
          { label: "攻击能力等级", multiplier: 1.3, role: "attack", stage: 3 },
          { label: "防御能力等级", multiplier: 1.4, role: "defense", stage: 4 },
        ],
        nature: "neutral",
        stats,
      }}
      onAttackerIvChange={vi.fn()}
      onAttackerLevelChange={onAttackerLevelChange}
      onAttackerNatureChange={vi.fn()}
      onDefenderIvChange={vi.fn()}
      onDefenderLevelChange={onDefenderLevelChange}
      onDefenderNatureChange={vi.fn()}
    />,
  );

  expect(screen.getAllByText("攻击能力等级")).toHaveLength(2);
  expect(screen.getAllByText("防御能力等级")).toHaveLength(2);
  await user.click(screen.getByRole("button", {
    name: "攻击方防御能力等级加一",
  }));
  expect(onAttackerLevelChange).toHaveBeenCalledWith("defense", 2);
  await user.click(screen.getByRole("button", {
    name: "防御方攻击能力等级加一",
  }));
  expect(onDefenderLevelChange).toHaveBeenCalledWith("attack", 4);
});

test("holding a level button repeats changes and stops on release", () => {
  vi.useFakeTimers();
  try {
    const onAttackerLevelChange = vi.fn();
    render(
      <NatureStatsStep
        attacker={{
          level: { label: "攻击能力等级", multiplier: 1, stage: 0 },
          nature: "neutral",
          stats,
        }}
        defender={{
          level: { label: "防御能力等级", multiplier: 1, stage: 0 },
          nature: "neutral",
          stats,
        }}
        onAttackerIvChange={vi.fn()}
        onAttackerLevelChange={onAttackerLevelChange}
        onAttackerNatureChange={vi.fn()}
        onDefenderIvChange={vi.fn()}
        onDefenderLevelChange={vi.fn()}
        onDefenderNatureChange={vi.fn()}
      />,
    );

    const increase = screen.getByRole("button", { name: "攻击方等级加一" });
    fireEvent.pointerDown(increase, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(650));
    fireEvent.pointerUp(increase, { pointerId: 1 });

    expect(onAttackerLevelChange.mock.calls.length).toBeGreaterThan(2);
    expect(onAttackerLevelChange.mock.lastCall[0]).toBeGreaterThan(2);
    const callCount = onAttackerLevelChange.mock.calls.length;
    fireEvent.click(increase);
    expect(onAttackerLevelChange).toHaveBeenCalledTimes(callCount);
    act(() => vi.advanceTimersByTime(300));
    expect(onAttackerLevelChange).toHaveBeenCalledTimes(callCount);
  } finally {
    vi.useRealTimers();
  }
});

test("skill step has only single and four-skill top modes and keeps both editors mounted", async () => {
  const user = userEvent.setup();

  render(
    <SkillStep
      activeMode="single"
      fourSkillContent={<div>四技能配置已保留</div>}
      onModeChange={vi.fn()}
      singleSkillContent={<div>风力冲击参数</div>}
    />,
  );

  expect(screen.getByRole("region", { name: "技能配置" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "选择技能" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "单技能" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("风力冲击参数")).toBeVisible();
  expect(screen.getByText("四技能配置已保留")).not.toBeVisible();
  expect(screen.queryByRole("tab", { name: /手动威力/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "四技能" }));
  expect(screen.getByText("四技能配置已保留")).toBeVisible();
});
