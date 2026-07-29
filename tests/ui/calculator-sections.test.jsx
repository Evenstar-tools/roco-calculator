import { render, screen, within } from "@testing-library/react";
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
  traitName: "专注力",
  types: ["火"],
};

const defender = {
  assetUrl: "/assets/spirits/water-spirit.png",
  fullName: "水灵",
  id: "water-spirit",
  stage: "物攻型",
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

test("nature step keeps final panel, race, individual values, and level controls visible", async () => {
  const user = userEvent.setup();
  const onAttackerLevelChange = vi.fn();
  render(
    <NatureStatsStep
      attacker={{
        level: { label: "攻击威力等级", multiplier: 1, stage: 0 },
        nature: "固执（+物攻，-魔攻）",
        stats,
      }}
      defender={{
        level: { label: "防御威力等级", multiplier: 1, stage: 0 },
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
