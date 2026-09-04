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

test("header uses the S4 preview title and exposes compact controls", () => {
  render(<AppHeader onTeamsOpen={vi.fn()} />);

  expect(
    screen.getByRole("heading", { name: "洛克计算器 · S4前瞻" }),
  ).toBeVisible();
  expect(screen.queryByText(/41360/u)).not.toBeInTheDocument();
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

test("spirit picker previews only favorites and searches the full roster", async () => {
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
          dexNo: "200",
          evolutionChainIds: ["complete"],
          favoriteState: "complete",
          fullName: "完整配置",
          id: "complete",
        },
        {
          dexNo: "100",
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
  ).toEqual(["手动收藏100", "完整配置200"]);

  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.type(input, "普通");
  expect(screen.getByRole("option", { name: /普通精灵/ })).toBeVisible();
});

test("spirit picker falls back to dex order when there are no favorites", async () => {
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
          dexNo: "200",
          evolutionChainIds: ["later"],
          favoriteState: null,
          fullName: "后位精灵",
          id: "later",
        },
        {
          dexNo: "100",
          evolutionChainIds: ["earlier"],
          favoriteState: null,
          fullName: "前位精灵",
          id: "earlier",
        },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual(["前位精灵100", "后位精灵200"]);
});

test("spirit picker starts with Dimo then the eleven new final forms before any config import", async () => {
  const user = userEvent.setup();
  const previewNames = [
    "银月狼王",
    "测风蝉",
    "智辉章脑",
    "玳塔",
    "摇铃魔偶",
    "未完虫",
    "黑手浣熊",
    "布灵布灵",
    "星星眼",
    "月使鹭纳",
    "圣凯布米龙",
  ];
  const previewFinals = previewNames.map((fullName, index) => ({
    changeInfo: { entityName: fullName, isNew: true, items: [] },
    dexNo: null,
    evolutionChainIds: [`preview-${index + 1}`],
    favoriteState: null,
    fullName,
    id: `preview-${index + 1}`,
    previewDefaults: { natureId: "cheerful" },
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
        {
          dexNo: "200",
          evolutionChainIds: ["ordinary"],
          favoriteState: null,
          fullName: "普通精灵",
          id: "ordinary",
        },
        ...previewFinals,
        {
          dexNo: "001",
          evolutionChainIds: ["dimo"],
          favoriteState: null,
          fullName: "迪莫",
          id: "dimo",
        },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(
    screen.getAllByRole("option").map((option) =>
      option.querySelector("strong")?.textContent,
    ),
  ).toEqual(["迪莫", ...previewNames]);
});

test("spirit picker pins the eleven pending S4 final forms before saved configurations", async () => {
  const user = userEvent.setup();
  const previewNames = [
    "银月狼王",
    "测风蝉",
    "智辉章脑",
    "玳塔",
    "摇铃魔偶",
    "未完虫",
    "黑手浣熊",
    "布灵布灵",
    "星星眼",
    "月使鹭纳",
    "圣凯布米龙",
  ];
  const previewFinals = previewNames.map((fullName, index) => ({
    changeInfo: { entityName: fullName, isNew: true, items: [] },
    dexNo: null,
    evolutionChainIds: [`preview-${index + 1}`],
    favoriteState: null,
    fullName,
    id: `preview-${index + 1}`,
    previewDefaults: { natureId: "cheerful" },
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
        {
          dexNo: null,
          evolutionChainIds: ["preview-placeholder"],
          favoriteState: null,
          fullName: "量风碗",
          id: "preview-placeholder",
          changeInfo: { entityName: "量风碗", isNew: true, items: [] },
        },
        {
          dexNo: "200",
          evolutionChainIds: ["saved-later"],
          favoriteState: "complete",
          fullName: "后位配置",
          id: "saved-later",
        },
        ...previewFinals,
        {
          dexNo: "100",
          evolutionChainIds: ["saved-earlier"],
          favoriteState: "manual",
          fullName: "前位配置",
          id: "saved-earlier",
        },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(
    screen.getAllByRole("option").map((option) =>
      option.querySelector("strong")?.textContent,
    ),
  ).toEqual([...previewNames, "前位配置"]);
  expect(screen.queryByRole("option", { name: /量风碗/ })).not.toBeInTheDocument();
});

test("spirit picker returns S4 final forms to dex order after IDs arrive", async () => {
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
          dexNo: "200",
          evolutionChainIds: ["saved-later"],
          favoriteState: "complete",
          fullName: "后位配置",
          id: "saved-later",
        },
        {
          dexNo: "150",
          evolutionChainIds: ["preview-final"],
          favoriteState: null,
          fullName: "已有图鉴号的新精灵",
          id: "preview-final",
          changeInfo: {
            entityName: "已有图鉴号的新精灵",
            isNew: true,
            items: [],
          },
          previewDefaults: { natureId: "cheerful" },
        },
        {
          dexNo: "100",
          evolutionChainIds: ["saved-earlier"],
          favoriteState: "manual",
          fullName: "前位配置",
          id: "saved-earlier",
        },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual([
    "前位配置100",
    "已有图鉴号的新精灵150",
    "后位配置200",
  ]);
  expect(
    screen.getByText("已有图鉴号的新精灵", { selector: "strong" }),
  ).toHaveAttribute("data-new", "true");
});

test("spirit picker marks a selected S4 placeholder as not calculable", async () => {
  const placeholder = {
    assetUrl: "/assets/spirits/preview.png",
    calculationStatus: "pending-race-stats",
    changeInfo: { entityName: "量风碗", isNew: true, items: [] },
    fullName: "量风碗",
    id: "preview-spirit",
    stage: "一阶",
    traitName: null,
    types: ["翼", "机械"],
  };
  const user = userEvent.setup();
  render(
    <SpiritPicker
      favoriteState={null}
      label="攻击方"
      onFavoriteToggle={vi.fn()}
      onSelect={vi.fn()}
      selected={placeholder}
      side="attack"
      spirits={[placeholder]}
    />,
  );

  expect(screen.getByText("种族值待确认"))
    .toBeVisible();
  expect(
    screen.getByText("量风碗", { selector: ".spirit-card__title strong" }),
  ).not.toHaveAttribute("data-new");
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  const placeholderOption = screen.getByRole("option", { name: /量风碗/ });
  expect(placeholderOption).toHaveTextContent("种族值待确认");
  expect(placeholderOption.querySelector("strong")).not.toHaveAttribute(
    "data-new",
  );
  expect(screen.queryByText(/9\.10/u)).not.toBeInTheDocument();
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

test("nature step reveals durability below each side and keeps it in sync with the panel preview", async () => {
  const user = userEvent.setup();
  const onAttackerAnalyze = vi.fn();
  const durabilityStats = [
    {
      key: "physicalAttack",
      label: "物攻",
      basePanel: 185,
      panel: 185,
      race: 84,
      displayIv: 60,
    },
    {
      key: "magicalAttack",
      label: "魔攻",
      basePanel: 145,
      panel: 145,
      race: 86,
      displayIv: 60,
    },
    {
      key: "speed",
      label: "速度",
      basePanel: 228,
      panel: 228,
      race: 95,
      displayIv: 60,
    },
    {
      key: "hp",
      label: "HP",
      basePanel: 366,
      change: "increase",
      delta: 53,
      panel: 419,
      race: 85,
      displayIv: 60,
    },
    {
      key: "physicalDefense",
      label: "物防",
      basePanel: 172,
      change: "decrease",
      delta: -33,
      panel: 139,
      race: 72,
      displayIv: 60,
    },
    {
      key: "magicalDefense",
      label: "魔防",
      basePanel: 221,
      change: "decrease",
      delta: -33,
      panel: 188,
      race: 116,
      displayIv: 60,
    },
  ];
  const commonProps = {
    attacker: { id: "attacker", nature: "neutral", stats: durabilityStats },
    defender: { id: "defender", nature: "neutral", stats: durabilityStats },
    onAttackerAnalyze,
    onAttackerIvChange: vi.fn(),
    onAttackerNatureChange: vi.fn(),
    onDefenderIvChange: vi.fn(),
    onDefenderNatureChange: vi.fn(),
  };
  const { rerender } = render(<NatureStatsStep {...commonProps} />);

  expect(
    screen.queryByRole("button", { name: "攻击方耐久概览" }),
  ).not.toBeInTheDocument();

  rerender(<NatureStatsStep {...commonProps} showDurabilityOverview />);
  const attackerSide = screen.getByRole("group", { name: "攻击方能力" });
  const attackerOverview = within(attackerSide).getByRole("button", {
    name: "攻击方耐久概览",
  });
  expect(attackerOverview).toHaveTextContent("物理耐久58,241");
  expect(
    within(screen.getByRole("group", { name: "防御方能力" })).getByRole(
      "button",
      { name: "防御方耐久概览" },
    ),
  ).toBeDisabled();

  await user.click(
    within(attackerSide).getByRole("button", { name: /物防最终值139/ }),
  );
  expect(attackerOverview).toHaveTextContent("物理耐久62,952");
  expect(attackerOverview).toHaveTextContent("魔法耐久80,886");
  expect(attackerOverview).toHaveTextContent("综合耐久35,400");

  await user.click(attackerOverview);
  expect(onAttackerAnalyze).toHaveBeenCalledOnce();
});

test("clicking a modified stat toggles the whole side between final and base panels", async () => {
  const user = userEvent.setup();
  const onAttackerIvChange = vi.fn();
  const onAttackerNatureChange = vi.fn();
  const onDefenderIvChange = vi.fn();
  const onDefenderNatureChange = vi.fn();
  const attackerStats = stats.map((stat) => {
    if (stat.key === "attack") {
      return {
        ...stat,
        basePanel: 240,
        change: "increase",
        delta: 24,
        panel: 264,
      };
    }
    if (stat.key === "magicAttack") {
      return {
        ...stat,
        basePanel: 180,
        change: "increase",
        delta: 18,
        panel: 198,
      };
    }
    return { ...stat, basePanel: stat.panel, change: null, delta: 0 };
  });
  const defenderStats = stats.map((stat) =>
    stat.key === "defense"
      ? {
          ...stat,
          basePanel: 190,
          change: "decrease",
          delta: -17,
          panel: 173,
        }
      : { ...stat, basePanel: stat.panel, change: null, delta: 0 },
  );

  render(
    <NatureStatsStep
      attacker={{ id: "attacker", nature: "neutral", stats: attackerStats }}
      defender={{ id: "defender", nature: "neutral", stats: defenderStats }}
      onAttackerIvChange={onAttackerIvChange}
      onAttackerNatureChange={onAttackerNatureChange}
      onDefenderIvChange={onDefenderIvChange}
      onDefenderNatureChange={onDefenderNatureChange}
    />,
  );

  const attackerSide = screen.getByRole("group", { name: "攻击方能力" });
  const defenderSide = screen.getByRole("group", { name: "防御方能力" });
  await user.click(
    within(attackerSide).getByRole("button", {
      name: "物攻最终值264，基础值240，增加24，点击查看修改前的六维",
    }),
  );

  expect(within(attackerSide).getByText("240")).toBeVisible();
  expect(within(attackerSide).getByText("180")).toBeVisible();
  expect(within(attackerSide).getAllByText("原值")).toHaveLength(2);
  expect(within(defenderSide).getByText("173")).toBeVisible();

  await user.click(
    within(attackerSide).getByRole("button", {
      name: "物攻当前显示基础值240，最终值264，点击恢复最终六维",
    }),
  );

  expect(within(attackerSide).getByText("264")).toBeVisible();
  expect(within(attackerSide).getByText("198")).toBeVisible();
  expect(within(attackerSide).queryByText("原值")).not.toBeInTheDocument();
  expect(within(defenderSide).getByText("173")).toBeVisible();

  await user.click(
    within(defenderSide).getByRole("button", {
      name: "物防最终值173，基础值190，降低17，点击查看修改前的六维",
    }),
  );
  expect(within(defenderSide).getByText("190")).toBeVisible();
  expect(within(defenderSide).getByText("原值")).toBeVisible();
  expect(within(attackerSide).getByText("264")).toBeVisible();

  expect(onAttackerIvChange).not.toHaveBeenCalled();
  expect(onAttackerNatureChange).not.toHaveBeenCalled();
  expect(onDefenderIvChange).not.toHaveBeenCalled();
  expect(onDefenderNatureChange).not.toHaveBeenCalled();
});

test("base panel preview resets when that side switches spirit", async () => {
  const user = userEvent.setup();
  const modifiedStats = stats.map((stat) =>
    stat.key === "speed"
      ? {
          ...stat,
          basePanel: 220,
          change: "increase",
          delta: 30,
          panel: 250,
        }
      : { ...stat, basePanel: stat.panel, change: null, delta: 0 },
  );
  const props = {
    defender: { id: "defender", nature: "neutral", stats },
    onAttackerIvChange: vi.fn(),
    onAttackerNatureChange: vi.fn(),
    onDefenderIvChange: vi.fn(),
    onDefenderNatureChange: vi.fn(),
  };
  const { rerender } = render(
    <NatureStatsStep
      {...props}
      attacker={{ id: "attacker-a", nature: "neutral", stats: modifiedStats }}
    />,
  );

  const attackerSide = screen.getByRole("group", { name: "攻击方能力" });
  await user.click(
    within(attackerSide).getByRole("button", {
      name: "速度最终值250，基础值220，增加30，点击查看修改前的六维",
    }),
  );
  expect(within(attackerSide).getByText("220")).toBeVisible();

  rerender(
    <NatureStatsStep
      {...props}
      attacker={{ id: "attacker-b", nature: "neutral", stats: modifiedStats }}
    />,
  );

  expect(within(attackerSide).getByText("250")).toBeVisible();
  expect(within(attackerSide).queryByText("原值")).not.toBeInTheDocument();
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
