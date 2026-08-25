import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { FAVORITES_STORAGE_KEY } from "../../src/state/favorites.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import { encodeShareState } from "../../src/state/share.js";
import { SPIRIT_CONFIG_STORAGE_KEY } from "../../src/state/spirit-configs.js";
import { TEAM_STORAGE_KEY } from "../../src/state/team-presets.js";
import {
  NEGATIVE_STATUS_SETTLEMENT_STORAGE_KEY,
  POWER_DISPLAY_STORAGE_KEY,
  TYPE_COVERAGE_STORAGE_KEY,
} from "../../src/state/display-settings.js";

const snapshot = {
  learnsets: [
    {
      spiritId: "sonic-dog",
      skillIds: [
        "fire-strike",
        "mana-burst",
        "head-on-blow",
        "multi-hit",
        "magic-boost",
        "prepared-stance",
        "bubble-shield",
        "pain-lover",
        "steam-march",
        "mud-armor",
        "feather-acceleration",
        "horse-stance",
        "warm-up",
        "storm-eye",
        "diffuse-reflection",
        "fire-strike-2",
        "water-strike",
        "sunny",
        "light-strike",
        "quench",
        "gather-momentum",
        "moe-strike",
        "wish-power-fire",
      ],
    },
    {
      spiritId: "storm-dog",
      skillIds: ["fire-strike", "mana-burst"],
    },
    {
      spiritId: "guard-dog",
      skillIds: ["fire-strike"],
    },
    { spiritId: "water-spirit", skillIds: ["water-strike"] },
    {
      spiritId: "fair-pigeon",
      skillIds: ["magic-boost", "prepared-stance", "water-strike"],
    },
  ],
  meta: {
    bwikiRevision: 41360,
    id: "s3-test",
    rulesVersion: "1.0.0",
    seasonId: "S3季中",
  },
  skills: [
    {
      basePower: 30,
      category: "magical",
      cost: 3,
      description: "造成魔伤，3连击。自己获得萌化，威力永久+20。",
      id: "moe-strike",
      name: "撒娇",
      ruleId: null,
      type: "萌",
    },
    {
      basePower: 80,
      category: "dual",
      cost: 2,
      description:
        "取物攻与魔攻中较高的一项；目标本回合使用状态技能时，威力×2.5且必定先手。",
      id: "wish-power-fire",
      name: "愿力冲击",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "火",
    },
    {
      basePower: 0,
      category: "status",
      cost: 4,
      description: "自己获得1层蓄势印记。",
      id: "gather-momentum",
      name: "蓄势待发",
      ruleId: null,
      type: "地",
    },
    {
      basePower: 0,
      category: "status",
      cost: 2,
      description: "自己获得连击数+3。",
      id: "warm-up",
      name: "热身运动",
      ruleId: null,
      type: "普通",
    },
    {
      basePower: 0,
      category: "status",
      cost: 3,
      description: "自己获得连击数+100%。",
      id: "storm-eye",
      name: "暴风眼",
      ruleId: null,
      type: "翼",
    },
    {
      basePower: 80,
      category: "physical",
      cost: 1,
      id: "fire-strike",
      name: "风力冲击",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "火",
    },
    {
      basePower: 60,
      category: "physical",
      cost: 2,
      description: "对敌方精灵造成物理伤害。",
      id: "fire-strike-2",
      name: "火焰冲击",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "火",
    },
    {
      basePower: 60,
      category: "magical",
      cost: 1,
      id: "water-strike",
      name: "水之波纹",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "水",
    },
    {
      basePower: 100,
      category: "magical",
      cost: 2,
      description: "对敌方精灵造成魔法伤害。",
      id: "light-strike",
      name: "光能冲击",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "光",
    },
    {
      basePower: null,
      category: "magical",
      cost: 3,
      id: "mana-burst",
      name: "魔能爆",
      provenance: { ruleId: "test" },
      ruleId: "mana_burst",
      type: "萌",
    },
    {
      basePower: 80,
      category: "physical",
      cost: 3,
      description: "造成物伤，若敌方本回合更换精灵，本次技能威力+100。",
      id: "head-on-blow",
      name: "当头棒喝",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "普通",
    },
    {
      basePower: 25,
      category: "magical",
      cost: 4,
      description: "造成魔伤，5连击。",
      id: "multi-hit",
      name: "乱打",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "普通",
    },
    {
      basePower: 0,
      category: "status",
      cost: 0,
      description: "自己获得魔攻+70%。",
      id: "magic-boost",
      name: "魔法增效",
      ruleId: null,
      type: "普通",
    },
    {
      basePower: 0,
      category: "status",
      cost: 2,
      description:
        "自身物攻+80%；应对防御：对方物防-80%。",
      id: "prepared-stance",
      name: "预备势",
      ruleId: null,
      type: "武",
    },
    {
      basePower: 0,
      category: "defense",
      cost: 2,
      description: "减伤80%，应对攻击：自己获得魔攻+70%。",
      id: "bubble-shield",
      name: "水泡盾",
      ruleId: null,
      type: "水",
    },
    {
      basePower: 0,
      category: "defense",
      cost: 2,
      description: "减伤80%，应对攻击：下次攻击技能威力翻倍。",
      id: "quench",
      name: "淬火",
      ruleId: null,
      type: "火",
    },
    {
      basePower: 0,
      category: "defense",
      cost: 2,
      description:
        "减伤80%，应对攻击：期间自己每受到1次攻击伤害，获得双攻+40%。",
      id: "pain-lover",
      name: "嗜痛",
      ruleId: null,
      type: "恶",
    },
    {
      basePower: 0,
      category: "status",
      cost: 2,
      description: "选择：自己获得速度+60或物攻+90%。",
      id: "steam-march",
      name: "蒸汽进行曲",
      ruleId: null,
      type: "水",
    },
    {
      basePower: 0,
      category: "defense",
      cost: 2,
      description: "自己获得物攻、物防+60%；防御应对成功时增益翻倍。",
      id: "mud-armor",
      name: "泥浆铠甲",
      ruleId: null,
      type: "地",
    },
    {
      basePower: 0,
      category: "status",
      cost: 2,
      description: "自己全部技能威力+20。",
      id: "feather-acceleration",
      name: "羽化加速",
      ruleId: null,
      type: "翼",
    },
    {
      basePower: 0,
      category: "status",
      cost: 1,
      description: "每种系别中的至多1个技能，威力+35。",
      id: "diffuse-reflection",
      name: "漫反射",
      ruleId: null,
      type: "光",
    },
    {
      basePower: 0,
      category: "status",
      cost: 2,
      description: "光系技能威力永久+50%，应对防御：改为永久+100%。",
      id: "sunny",
      name: "放晴",
      ruleId: null,
      type: "光",
    },
    {
      basePower: 0,
      category: "status",
      cost: 2,
      description: "生命高于80%时，选择：自己获得物攻+150%。",
      id: "horse-stance",
      name: "马步",
      ruleId: null,
      type: "武",
    },
  ],
  spirits: [
    {
      asset: null,
      dexNo: "128",
      evolutionChainIds: ["guard-dog", "sonic-dog", "storm-dog"],
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
      traitIds: [],
      traitName: "专注力",
      types: ["火"],
    },
    {
      asset: null,
      dexNo: "127",
      evolutionChainIds: ["guard-dog", "sonic-dog", "storm-dog"],
      fullName: "护主犬",
      id: "guard-dog",
      raceStats: {
        hp: 70,
        magicalAttack: 40,
        magicalDefense: 70,
        physicalAttack: 96,
        physicalDefense: 82,
        speed: 96,
      },
      stage: "一阶",
      traitIds: [],
      traitName: "专注力",
      types: ["火"],
    },
    {
      asset: null,
      dexNo: "128",
      evolutionChainIds: ["guard-dog", "sonic-dog", "storm-dog"],
      fullName: "风暴战犬",
      id: "storm-dog",
      raceStats: {
        hp: 100,
        magicalAttack: 62,
        magicalDefense: 95,
        physicalAttack: 148,
        physicalDefense: 112,
        speed: 135,
      },
      stage: "首领",
      traitIds: [],
      traitName: "专注力",
      types: ["火"],
    },
    {
      asset: null,
      dexNo: "125",
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
      traitIds: [],
      traitName: "浸润",
      types: ["水"],
    },
    {
      asset: null,
      dexNo: "162",
      fullName: "公平鸽",
      id: "fair-pigeon",
      raceStats: {
        hp: 113,
        magicalAttack: 93,
        magicalDefense: 125,
        physicalAttack: 93,
        physicalDefense: 125,
        speed: 100,
      },
      stage: "一阶",
      traitIds: ["balance-trait"],
      traitName: "衡量",
      types: ["普通"],
    },
  ],
  traits: [
    {
      description: "入场首回合，获得物攻+100%。",
      id: "focus-trait",
      name: "专注力",
    },
    {
      description: "入场时，复制敌方的增益。在场时，若敌方获得增益自己也会获得。",
      id: "balance-trait",
      name: "衡量",
    },
  ],
};

beforeEach(() => {
  localStorage.removeItem(SPIRIT_CONFIG_STORAGE_KEY);
  localStorage.removeItem(TYPE_COVERAGE_STORAGE_KEY);
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
});

async function selectSpirit(user, side, name) {
  const picker = screen.getByRole("combobox", { name: `${side}精灵` });
  await user.clear(picker);
  await user.type(picker, name);
  await user.click(screen.getByRole("option", { name: new RegExp(name) }));
}

async function selectDefaultSpirits(user) {
  await selectSpirit(user, "攻击方", "音速犬");
  await selectSpirit(user, "防御方", "水灵");
}

async function openDetailedMode(user) {
  await user.click(screen.getByRole("button", { name: "具体版" }));
  await user.click(screen.getByRole("tab", { name: "单技能" }));
}

test("labels the current dataset with its S3 midseason name", () => {
  render(<App initialSnapshot={snapshot} />);

  expect(screen.getByText("S3季中 · 41360")).toBeVisible();
});

test("starts with both spirit selectors empty and hides incomplete configuration", () => {
  render(<App initialSnapshot={snapshot} />);

  expect(
    screen.getByRole("button", { name: "精简版" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("combobox", { name: "攻击方精灵" }),
  ).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "攻击方精灵" }),
  ).toHaveAttribute("placeholder", "选精灵");
  expect(
    screen.getByRole("combobox", { name: "防御方精灵" }),
  ).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "防御方精灵" }),
  ).toHaveAttribute("placeholder", "选精灵");
  expect(
    screen.queryByRole("region", { name: "性格配置" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "技能配置" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("complementary", { name: "伤害结果" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "展开伤害结果" }),
  ).not.toBeInTheDocument();
});

test("undoes the latest calculator change without treating interface mode as history", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  expect(screen.getByRole("button", { name: "暂无可撤回操作" }))
    .toHaveAttribute("aria-disabled", "true");
  await selectSpirit(user, "攻击方", "音速犬");
  await user.click(screen.getByRole("button", { name: "具体版" }));

  await user.click(screen.getByRole("button", { name: "撤回上一步（1）" }));
  expect(screen.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "具体版" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("shows the first-run guide once, persists skip, and allows menu replay", async () => {
  localStorage.removeItem(FIRST_RUN_GUIDE_STORAGE_KEY);
  const user = userEvent.setup();
  const first = render(<App initialSnapshot={snapshot} />);

  expect(await screen.findByRole("dialog", { name: "新手引导 1/6" }))
    .toHaveTextContent("先选攻击方");
  expect(document.querySelector('[data-guide-target="attacker"]'))
    .toBeInTheDocument();
  expect(document.querySelector('[data-guide-target="defender"]'))
    .toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "跳过引导" }));
  expect(localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY)).toBe("1");
  expect(screen.queryByRole("dialog", { name: /新手引导/ }))
    .not.toBeInTheDocument();

  first.unmount();
  render(<App initialSnapshot={snapshot} />);
  expect(screen.queryByRole("dialog", { name: /新手引导/ }))
    .not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "新手引导" }));
  expect(screen.getByRole("dialog", { name: "新手引导 1/6" }))
    .toBeInTheDocument();
});

test("walks through compact mode, opens detailed mode, and imports the library from step six", async () => {
  localStorage.clear();
  const teamBytes = JSON.stringify({
    activeTeamId: null,
    schemaVersion: 1,
    teams: [],
  });
  localStorage.setItem(TEAM_STORAGE_KEY, teamBytes);
  const library = {
    appVersion: "1.5.1",
    entries: [{
      displayIvs: {
        hp: 0,
        magicalAttack: 60,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      },
      natureId: "adamant",
      skills: ["fire-strike", "mana-burst", null, null],
      spiritId: "sonic-dog",
      traitValues: {},
    }],
    entryCount: 1,
    exportedAt: "2026-08-12T10:16:00.000Z",
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
    versions: { data: "s3-test", rules: "1.0.0" },
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(library),
  });
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await screen.findByRole("dialog", { name: "新手引导 1/6" });
  await selectSpirit(user, "攻击方", "音速犬");
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await selectSpirit(user, "防御方", "水灵");
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("button", { name: "前往具体版" }));
  expect(screen.getByRole("button", { name: "具体版" }))
    .toHaveAttribute("aria-pressed", "true");
  const finalStep = screen.getByRole("dialog", { name: "新手引导 6/6" });
  expect(finalStep).toHaveTextContent("以后修改性格、个体和技能，都会继续记住");

  await user.click(within(finalStep).getByRole("button", { name: "导入并完成" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: /新手引导/ }))
      .not.toBeInTheDocument();
  });
  expect(fetchMock).toHaveBeenCalledWith("/data/presets/pvp-popular-configs.json");
  expect(localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY)).toBe("1");
  expect(localStorage.getItem(TEAM_STORAGE_KEY)).toBe(teamBytes);
  expect(screen.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue("音速犬");
  expect(screen.getByRole("combobox", { name: "防御方精灵" })).toHaveValue("水灵");
  expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY))).toEqual(
    expect.arrayContaining([expect.objectContaining({ spiritId: "sonic-dog" })]),
  );
  fetchMock.mockRestore();
});

test("compact mode defaults to four skills and preserves state when opening detailed mode", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  expect(
    screen.getByRole("region", { name: "即时配置" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "精简版" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("tab", { name: "四技能" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    screen.getByRole("group", { name: "攻击方快捷性格" }),
  ).toHaveTextContent("普通");
  expect(
    screen.getByRole("group", { name: "防御方快捷性格" }),
  ).toHaveTextContent("普通");
  expect(
    screen.getByLabelText(/攻击方风力冲击攻击水灵：\d+伤害/),
  ).toBeVisible();
  expect(
    screen.getByLabelText(/防御方水之波纹攻击音速犬：\d+伤害/),
  ).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "性格配置" }),
  ).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "攻击方物攻增益" }),
  );
  await user.click(screen.getByRole("button", { name: "具体版" }));

  expect(
    screen.getByRole("button", { name: "具体版" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("region", { name: "性格配置" })).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "攻击方性格" }),
  ).toHaveValue("brave");

  await user.click(screen.getByRole("button", { name: "精简版" }));
  expect(
    screen.getByRole("button", { name: "攻击方物攻增益" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("compact nature presets use each side's current attack IV selection", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "攻击方物攻增益" }));
  await user.click(screen.getByRole("button", { name: "防御方物防增益" }));
  await user.click(screen.getByRole("button", { name: "具体版" }));

  expect(
    screen.getByRole("combobox", { name: "攻击方性格" }),
  ).toHaveValue("brave");
  expect(
    screen.getByRole("combobox", { name: "防御方性格" }),
  ).toHaveValue("relaxed");

  await user.click(screen.getByRole("button", { name: "精简版" }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方魔攻个体加点" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "防御方魔攻个体加点" }),
  );

  await user.click(screen.getByRole("button", { name: "具体版" }));
  expect(
    screen.getByRole("combobox", { name: "攻击方性格" }),
  ).toHaveValue("brave");
  expect(
    screen.getByRole("combobox", { name: "防御方性格" }),
  ).toHaveValue("relaxed");

  await user.click(screen.getByRole("button", { name: "精简版" }));
  await user.click(screen.getByRole("button", { name: "攻击方物攻增益" }));
  await user.click(screen.getByRole("button", { name: "防御方生命增益" }));
  await user.click(screen.getByRole("button", { name: "具体版" }));

  expect(
    screen.getByRole("combobox", { name: "攻击方性格" }),
  ).toHaveValue("adamant");
  expect(
    screen.getByRole("combobox", { name: "防御方性格" }),
  ).toHaveValue("peaceful");
});

test("compact individual checkboxes write sixty or zero without leaving quick mode", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  const attackPower = screen.getByRole("checkbox", {
    name: "攻击方物攻个体加点",
  });
  const attackHp = screen.getByRole("checkbox", {
    name: "攻击方生命个体加点",
  });
  const defenseHp = screen.getByRole("checkbox", {
    name: "防御方生命个体加点",
  });
  const defenseMagicDefense = screen.getByRole("checkbox", {
    name: "防御方魔防个体加点",
  });

  expect(attackPower).toBeChecked();
  expect(attackHp).toBeChecked();
  expect(defenseHp).toBeChecked();
  expect(defenseMagicDefense).toBeChecked();

  await user.click(attackHp);
  expect(attackHp).not.toBeChecked();

  await user.click(screen.getByRole("button", { name: "具体版" }));
  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", {
    name: "攻击方能力",
  });
  expect(
    within(attackSide).getByRole("spinbutton", { name: "HP个体" }),
  ).toHaveValue(0);

  await user.click(screen.getByRole("button", { name: "精简版" }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方生命个体加点" }),
  );
  await user.click(screen.getByRole("button", { name: "具体版" }));
  expect(
    within(
      screen.getByRole("region", { name: "性格配置" }),
    ).getAllByRole("spinbutton", { name: "HP个体" })[0],
  ).toHaveValue(60);
});

test("clear current page returns to the cold-start interface", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await selectSpirit(user, "攻击方", "音速犬");
  expect(
    screen.queryByRole("region", { name: "性格配置" }),
  ).not.toBeInTheDocument();

  await selectSpirit(user, "防御方", "水灵");
  await openDetailedMode(user);
  expect(screen.getByRole("region", { name: "性格配置" })).toBeVisible();
  expect(screen.getByRole("region", { name: "技能配置" })).toBeVisible();
  expect(
    screen.getByRole("complementary", { name: "伤害结果" }),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "清除当前页配置" }));
  expect(
    screen.getByRole("combobox", { name: "攻击方精灵" }),
  ).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "防御方精灵" }),
  ).toHaveValue("");
  expect(
    screen.queryByRole("region", { name: "性格配置" }),
  ).not.toBeInTheDocument();
});

test("searching one spirit exposes every member of its evolution chain", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  const picker = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.type(picker, "音速犬");

  expect(screen.getByRole("option", { name: /护主犬/ })).toBeVisible();
  expect(screen.getByRole("option", { name: /音速犬/ })).toBeVisible();
  expect(screen.getByRole("option", { name: /风暴战犬/ })).toBeVisible();
});

test("connects the real three-step flow to one deterministic result", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  expect(screen.getByRole("region", { name: "精灵配置" })).toBeVisible();
  const natureStep = screen.getByRole("region", { name: "性格配置" });
  expect(natureStep).toBeVisible();
  expect(screen.getByRole("region", { name: "技能配置" })).toBeVisible();
  expect(within(natureStep).getAllByText("种:128")).toHaveLength(1);
  expect(
    within(natureStep).getAllByRole("spinbutton", { name: "HP个体" })[0],
  ).toHaveValue(60);
  expect(
    screen.getByRole("combobox", { name: "选择技能" }),
  ).toHaveValue("风力冲击");

  const damage = screen.getByTestId("primary-damage");
  expect(damage.textContent).toMatch(/^\d+$/);
  expect(screen.queryByText(/随机|伤害范围/)).not.toBeInTheDocument();

  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const attackIv = within(attackSide).getByRole("spinbutton", { name: "物攻个体" });
  await user.clear(attackIv);
  await user.type(attackIv, "0");
  expect(screen.getByTestId("primary-damage").textContent).toMatch(/^\d+$/);
});

test("rainy weather boosts water damage and stays global across directions", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  await user.click(screen.getByRole("button", { name: "切换计算方向" }));
  const dryDamage = Number(screen.getByTestId("primary-damage").textContent);

  await user.click(screen.getByRole("button", { name: "高级选项" }));
  const weather = screen.getByRole("combobox", { name: "天气" });
  expect(weather).toHaveValue("none");
  await user.selectOptions(weather, "rain");

  expect(Number(screen.getByTestId("primary-damage").textContent)).toBeGreaterThan(
    dryDamage,
  );
  const formulaAudit = document.querySelector(".formula-audit");
  expect(within(formulaAudit).getByText("雨天")).toBeVisible();
  expect(within(formulaAudit).getByText("1.75")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "切换计算方向" }));
  expect(screen.getByRole("combobox", { name: "天气" })).toHaveValue("rain");
});

test("shows a base result for Skybreaker and recalculates when it acts first", async () => {
  const user = userEvent.setup();
  const skybreakerSnapshot = {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "sonic-dog"
        ? { ...spirit, traitIds: ["skybreaker"], traitName: "破空" }
        : spirit,
    ),
    traits: [
      {
        description: "若先于敌方攻击，本次技能威力+75%。",
        id: "skybreaker",
        name: "破空",
      },
    ],
  };

  render(<App initialSnapshot={skybreakerSnapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const damage = screen.getByTestId("primary-damage");
  const baseDamage = Number(damage.textContent);
  expect(Number.isFinite(baseDamage)).toBe(true);
  expect(screen.queryByText("待补充条件")).not.toBeInTheDocument();

  const condition = screen.getByRole("checkbox", {
    name: "先于敌方攻击",
  });
  expect(condition).not.toBeChecked();
  await user.click(condition);
  expect(Number(damage.textContent)).toBeGreaterThan(baseDamage);
});

test("recalculates stacked trait effects and editable four-skill power", async () => {
  const user = userEvent.setup();
  const stackedTraitSnapshot = {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "sonic-dog"
        ? {
            ...spirit,
            traitIds: ["cat-gift"],
            traitName: "猫精灵的礼物",
          }
        : spirit,
    ),
    traits: [
      {
        description:
          "己方精灵每完整使用1次选择技能，自己入场时获得物攻+40%。",
        id: "cat-gift",
        name: "猫精灵的礼物",
      },
    ],
  };

  render(<App initialSnapshot={stackedTraitSnapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const damage = screen.getByTestId("primary-damage");
  const baseDamage = Number(damage.textContent);
  const stacks = screen.getByRole("spinbutton", {
    name: "完整选择次数",
  });
  await user.clear(stacks);
  await user.type(stacks, "2");
  expect(Number(damage.textContent)).toBeGreaterThan(baseDamage);

  await user.click(screen.getByRole("tab", { name: "四技能" }));
  const firstPower = screen.getByRole("spinbutton", {
    name: "攻击方技能1静态威力",
  });
  await user.clear(firstPower);
  await user.type(firstPower, "123{Enter}");
  expect(firstPower).toHaveValue(123);
  expect(
    screen.getByRole("status", {
      name: /攻击方风力冲击攻击水灵：\d+伤害/,
    }),
  ).toBeVisible();
});

test("keeps Dimo-family attack and defense trait stacks synchronized", async () => {
  const user = userEvent.setup();
  const dimoSnapshot = {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "water-spirit"
        ? {
            ...spirit,
            traitIds: ["judgment"],
            traitName: "裁决",
          }
        : spirit,
    ),
    traits: [
      {
        description:
          "造成克制伤害后，获得攻防速+20%，回复2能量。",
        id: "judgment",
        name: "裁决",
      },
    ],
  };

  const firstRender = render(<App initialSnapshot={dimoSnapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);
  await user.click(screen.getByRole("tab", { name: "四技能" }));

  const stackInputs = screen.getAllByRole("spinbutton", {
    name: "触发层数",
  });
  expect(stackInputs).toHaveLength(2);
  expect(screen.getByText("水灵 · 裁决", { exact: true })).toBeVisible();
  await user.clear(stackInputs[0]);
  await user.type(stackInputs[0], "3");
  expect(stackInputs[0]).toHaveValue(3);
  expect(stackInputs[1]).toHaveValue(3);

  firstRender.unmount();
  render(<App initialSnapshot={dimoSnapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);
  await user.click(screen.getByRole("tab", { name: "四技能" }));

  const restoredInputs = screen.getAllByRole("spinbutton", {
    name: "触发层数",
  });
  expect(restoredInputs[0]).toHaveValue(3);
  expect(restoredInputs[1]).toHaveValue(3);

  await user.clear(restoredInputs[1]);
  await user.type(restoredInputs[1], "2");
  expect(restoredInputs[0]).toHaveValue(2);
  expect(restoredInputs[1]).toHaveValue(2);
});

test("Black Cat Detective adjusts Prophet stacks with the number-input arrows", async () => {
  const user = userEvent.setup();
  const prophetSnapshot = {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "sonic-dog"
        ? {
            ...spirit,
            traitIds: ["prophet"],
            traitName: "先知",
          }
        : spirit,
    ),
    traits: [
      {
        description:
          "若敌方技能足够击败自己，回合开始时自己获得速度+50，双攻+50%。",
        id: "prophet",
        name: "先知",
      },
    ],
  };

  render(<App initialSnapshot={prophetSnapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const damage = screen.getByTestId("primary-damage");
  const baseDamage = Number(damage.textContent);
  const stacks = screen.getByRole("spinbutton", { name: "触发层数" });

  expect(stacks).toHaveAttribute("step", "1");
  expect(stacks).toHaveAttribute("inputmode", "numeric");
  await user.click(stacks);
  await user.keyboard("{ArrowUp}");
  const oneStackDamage = Number(damage.textContent);
  expect(stacks).toHaveValue(1);
  expect(oneStackDamage).toBeGreaterThan(baseDamage);

  await user.keyboard("{ArrowUp}");
  expect(stacks).toHaveValue(2);
  expect(Number(damage.textContent)).toBeGreaterThan(oneStackDamage);

  await user.keyboard("{ArrowDown}");
  expect(stacks).toHaveValue(1);
});

test("shares and remembers inherited penetration stacks across both directions", async () => {
  const user = userEvent.setup();
  const chessSnapshot = {
    ...snapshot,
    learnsets: [
      ...snapshot.learnsets,
      { spiritId: "chess-king", skillIds: ["fire-strike"] },
    ],
    spirits: [
      ...snapshot.spirits,
      {
        asset: null,
        baseName: "棋契陛下",
        dexNo: "190",
        fullName: "棋契陛下（白棋棋绮后分支）",
        id: "chess-king",
        raceStats: {
          hp: 100,
          magicalAttack: 143,
          magicalDefense: 123,
          physicalAttack: 143,
          physicalDefense: 133,
          speed: 100,
        },
        stage: "首领",
        traitIds: [],
        traitName: "御驾亲征",
        types: ["武", "地"],
        variantName: "白棋棋绮后分支",
      },
    ],
  };

  const firstRender = render(<App initialSnapshot={chessSnapshot} />);
  await selectSpirit(user, "攻击方", "棋契陛下");
  await selectSpirit(user, "防御方", "水灵");
  await openDetailedMode(user);

  const stacks = screen.getByRole("spinbutton", {
    name: "已使用武/地技能次数",
  });
  await user.clear(stacks);
  await user.type(stacks, "4");
  expect(stacks).toHaveValue(4);

  await user.click(screen.getByRole("button", { name: "切换计算方向" }));
  expect(
    screen.getByRole("spinbutton", { name: "已使用武/地技能次数" }),
  ).toHaveValue(4);

  firstRender.unmount();
  render(<App initialSnapshot={chessSnapshot} />);
  await selectSpirit(user, "攻击方", "棋契陛下");
  await selectSpirit(user, "防御方", "水灵");
  await openDetailedMode(user);

  expect(
    screen.getByRole("spinbutton", { name: "已使用武/地技能次数" }),
  ).toHaveValue(4);
});

test("defaults both sides to neutral nature with all individual-value points", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  expect(within(natureStep).getByText("攻击能力等级")).toBeVisible();
  expect(within(natureStep).getByText("防御能力等级")).toBeVisible();
  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const defenseSide = within(natureStep).getByRole("group", { name: "防御方能力" });

  expect(within(defenseSide).getByRole("combobox")).toHaveValue("neutral");
  expect(within(attackSide).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(60);
  expect(within(attackSide).getByRole("spinbutton", { name: "魔攻个体" })).toHaveValue(60);
  expect(within(attackSide).getByRole("spinbutton", { name: "速度个体" })).toHaveValue(60);
  expect(within(defenseSide).getByRole("spinbutton", { name: "HP个体" })).toHaveValue(60);
  expect(within(defenseSide).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(60);
  expect(within(defenseSide).getByRole("spinbutton", { name: "物防个体" })).toHaveValue(60);
  expect(within(defenseSide).getByRole("spinbutton", { name: "魔防个体" })).toHaveValue(60);
});

test("shows both hidden ability levels and copies current buffs when Fair Pigeon triggers", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectSpirit(user, "攻击方", "音速犬");
  await selectSpirit(user, "防御方", "公平鸽");
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const defenseSide = within(natureStep).getByRole("group", { name: "防御方能力" });
  expect(within(attackSide).getByText("攻击能力等级")).toBeVisible();
  expect(within(attackSide).getByText("防御能力等级")).toBeVisible();
  expect(within(defenseSide).getByText("攻击能力等级")).toBeVisible();
  expect(within(defenseSide).getByText("防御能力等级")).toBeVisible();

  const attackIncrease = within(attackSide).getByRole("button", {
    name: "攻击方攻击能力等级加一",
  });
  const defenseIncrease = within(attackSide).getByRole("button", {
    name: "攻击方防御能力等级加一",
  });
  fireEvent.click(attackIncrease);
  fireEvent.click(attackIncrease);
  fireEvent.click(attackIncrease);
  fireEvent.click(defenseIncrease);
  fireEvent.click(defenseIncrease);

  const balanceTriggers = screen.getAllByRole("checkbox", { name: "触发衡量" });
  expect(balanceTriggers).toHaveLength(1);
  await user.click(balanceTriggers[0]);

  expect(within(defenseSide).getByText("3层 · +30%")).toBeVisible();
  expect(within(defenseSide).getByText("2层 · +20%")).toBeVisible();
});

test("mirrors later positive ability gains to a triggered Fair Pigeon once", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectSpirit(user, "攻击方", "音速犬");
  await selectSpirit(user, "防御方", "公平鸽");
  await user.click(screen.getByRole("button", { name: "具体版" }));
  await user.click(screen.getByRole("checkbox", { name: "触发衡量" }));

  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "魔法增效");
  await user.click(screen.getByRole("option", { name: /魔法增效/ }));
  await user.click(screen.getAllByText("自己获得魔攻+70%。")[0]);

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const defenseSide = within(natureStep).getByRole("group", { name: "防御方能力" });
  expect(within(attackSide).getByText("7层 · +70%")).toBeVisible();
  expect(within(defenseSide).getByText("7层 · +70%")).toBeVisible();
});

test("caps positive power levels at 99 with ten percent per level", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const addLevel = within(attackSide).getByRole("button", {
    name: "攻击方等级加一",
  });

  await user.click(addLevel);
  expect(within(attackSide).getByText("1层 · +10%")).toBeVisible();

  for (let level = 1; level < 99; level += 1) {
    fireEvent.click(addLevel);
  }
  expect(within(attackSide).getByText("99层 · +990%")).toBeVisible();
  expect(addLevel).toBeDisabled();
});

test("uses the original site's reciprocal multiplier down to level -99", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const subtractLevel = within(attackSide).getByRole("button", {
    name: "攻击方等级减一",
  });

  await user.click(subtractLevel);
  expect(within(attackSide).getByText("-1层 · -9%")).toBeVisible();

  for (let level = -1; level > -99; level -= 1) {
    fireEvent.click(subtractLevel);
  }
  expect(within(attackSide).getByText("-99层 · -91%")).toBeVisible();
  expect(subtractLevel).toBeDisabled();
});

test("shows defense power levels as the original positive multiplier", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const defenseSide = within(natureStep).getByRole("group", { name: "防御方能力" });
  const damageBefore = Number(screen.getByTestId("primary-damage").textContent);

  await user.click(
    within(defenseSide).getByRole("button", { name: "防御方等级加一" }),
  );
  expect(within(defenseSide).getByText("1层 · +10%")).toBeVisible();
  expect(Number(screen.getByTestId("primary-damage").textContent)).toBeLessThan(
    damageBefore,
  );
});

test("uses a selected status skill with the current sprout bonus only after its row is clicked", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));
  await user.click(screen.getByRole("button", { name: "高级选项" }));
  const marks = screen.getByRole("group", { name: "进攻方印记" });
  await user.selectOptions(
    within(marks).getByRole("combobox", { name: "进攻方正面印记" }),
    "sprout",
  );
  fireEvent.change(
    within(marks).getByRole("spinbutton", { name: "进攻方萌芽层数" }),
    { target: { value: "1" } },
  );

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "魔法增效");
  await user.click(screen.getByRole("option", { name: /魔法增效/ }));

  expect(within(attackSide).getByText("0层 · 0%")).toBeVisible();
  await user.click(screen.getByText("自己获得魔攻+70%。"));
  expect(within(attackSide).getByText("8层 · +80%")).toBeVisible();
});

test("Dazzling shows seven slots and Refraction applies unique carried types per click", async () => {
  const user = userEvent.setup();
  const refraction = {
    basePower: 50,
    category: "magical",
    cost: 4,
    description: "造成魔伤，携带其他系别技能会给本技能带来不同效果。",
    id: "refraction",
    name: "折射",
    ruleId: null,
    type: "光",
  };
  const wingCombo = {
    basePower: 40,
    category: "magical",
    cost: 2,
    description: "造成魔伤，1连击。",
    id: "wing-combo",
    name: "回旋风暴",
    ruleId: null,
    type: "翼",
  };
  const dazzling = {
    id: "dazzling",
    name: "夺目",
    description: "额外获得三个未携带的随机技能，且非光系技能威力+25%。",
  };
  const rainbow = {
    ...snapshot.spirits[0],
    fullName: "彩虹独角兽",
    id: "rainbow-unicorn",
    traitIds: [dazzling.id],
    traitName: "夺目",
    types: ["光"],
  };
  const unicornSnapshot = {
    ...snapshot,
    learnsets: [
      ...snapshot.learnsets,
      {
        spiritId: rainbow.id,
        skillIds: [
          refraction.id,
          "head-on-blow",
          wingCombo.id,
          "light-strike",
          "water-strike",
          "fire-strike",
          "mana-burst",
        ],
      },
    ],
    skills: [...snapshot.skills, refraction, wingCombo],
    spirits: [...snapshot.spirits, rainbow],
    traits: [dazzling],
  };

  render(<App initialSnapshot={unicornSnapshot} />);
  await selectSpirit(user, "攻击方", "彩虹独角兽");
  await selectSpirit(user, "防御方", "水灵");
  await user.click(screen.getByRole("button", { name: "具体版" }));
  await user.click(screen.getByRole("tab", { name: "四技能" }));

  expect(screen.getByRole("combobox", { name: "攻击方技能7" })).toBeVisible();
  const selections = [
    ["攻击方技能1", "折射"],
    ["攻击方技能2", "当头棒喝"],
    ["攻击方技能3", "回旋风暴"],
    ["攻击方技能4", "光能冲击"],
  ];
  for (const [label, name] of selections) {
    const picker = screen.getByRole("combobox", { name: label });
    await user.clear(picker);
    await user.type(picker, name);
    await user.click(screen.getByRole("option", { name: new RegExp(name) }));
  }

  await user.click(screen.getByRole("button", { name: "高级选项" }));
  const attackerMarks = screen.getByRole("group", { name: "进攻方印记" });
  await user.selectOptions(
    within(attackerMarks).getByRole("combobox", { name: "进攻方正面印记" }),
    "sprout",
  );
  fireEvent.change(
    within(attackerMarks).getByRole("spinbutton", { name: "进攻方萌芽层数" }),
    { target: { value: "1" } },
  );

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  expect(within(attackSide).getByText("0层 · 0%")).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(80);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能3连击次数" })).toHaveValue(1);
  expect(screen.getByText(/本次可得：.*普·威力\+20.*翼·连击\+2.*光·双攻\+4层/))
    .toBeVisible();

  const refractionRow = screen.getByRole("group", { name: "攻击方技能1" });
  await user.click(within(refractionRow).getByText(refraction.description));
  expect(within(attackSide).getByText("4层 · +40%")) .toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(100);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能3连击次数" })).toHaveValue(3);

  await user.click(within(refractionRow).getByText(refraction.description));
  expect(within(attackSide).getByText("8层 · +80%")) .toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(120);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能3连击次数" })).toHaveValue(5);
});

test("Warm-up adds three hits to declared combo skills without double-counting manual edits", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "乱打");
  await user.click(screen.getByRole("option", { name: /乱打/ }));
  const comboHits = screen.getByRole("spinbutton", {
    name: "攻击方技能1连击次数",
  });
  expect(comboHits).toHaveValue(5);

  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "热身运动");
  await user.click(screen.getByRole("option", { name: /热身运动/ }));
  expect(comboHits).toHaveValue(5);

  await user.click(screen.getByText("自己获得连击数+3。"));
  expect(comboHits).toHaveValue(8);

  fireEvent.change(comboHits, { target: { value: "9" } });
  expect(comboHits).toHaveValue(9);
});

test("Storm Eye applies its sprout-amplified hit percentage through the status click", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const comboPicker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(comboPicker);
  await user.type(comboPicker, "乱打");
  await user.click(screen.getByRole("option", { name: /乱打/ }));
  const comboHits = screen.getByRole("spinbutton", {
    name: "攻击方技能1连击次数",
  });
  expect(comboHits).toHaveValue(5);

  const stormPicker = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(stormPicker);
  await user.type(stormPicker, "暴风眼");
  await user.click(screen.getByRole("option", { name: /暴风眼/ }));

  await user.click(screen.getByRole("button", { name: "高级选项" }));
  const marks = screen.getByRole("group", { name: "进攻方印记" });
  await user.selectOptions(
    within(marks).getByRole("combobox", { name: "进攻方正面印记" }),
    "sprout",
  );
  fireEvent.change(
    within(marks).getByRole("spinbutton", { name: "进攻方萌芽层数" }),
    { target: { value: "1" } },
  );

  await user.click(screen.getByText("自己获得连击数+100%。"));
  expect(comboHits).toHaveValue(15);
});

test("clicking 撒娇 advances its permanent power once without input side effects", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "撒娇");
  await user.click(screen.getByRole("option", { name: /撒娇/ }));
  const power = screen.getByRole("spinbutton", { name: "攻击方技能1静态威力" });
  expect(power).toHaveValue(30);

  await user.click(screen.getByText(/自己获得萌化/));
  await waitFor(() => expect(power).toHaveValue(40));

  await user.click(power);
  expect(power).toHaveValue(40);
});

test("clicking a mark skill adds its mark to the described side", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "蓄势待发");
  await user.click(screen.getByRole("option", { name: /蓄势待发/ }));
  await user.click(screen.getByText("自己获得1层蓄势印记。"));

  await user.click(screen.getByRole("button", { name: "高级选项" }));
  const marks = screen.getByRole("group", { name: "进攻方印记" });
  expect(
    within(marks).getByRole("combobox", { name: "进攻方正面印记" }),
  ).toHaveValue("momentum");
  expect(
    within(marks).getByRole("spinbutton", { name: "进攻方蓄势层数" }),
  ).toHaveValue(1);

  await user.click(screen.getByText("自己获得1层蓄势印记。"));
  expect(
    within(marks).getByRole("spinbutton", { name: "进攻方蓄势层数" }),
  ).toHaveValue(2);
});

test("Erosion adds poison stacks to attack and status combos without storing the bonus twice", async () => {
  const user = userEvent.setup();
  const erosion = {
    description: "敌方每有1层中毒效果，自己获得连击数+1。",
    id: "erosion-trait",
    name: "侵蚀",
  };
  const fireworks = {
    basePower: 0,
    category: "status",
    cost: 1,
    description: "2连击，每次连击自己获得魔攻+60%。",
    id: "fireworks",
    name: "花炮",
    ruleId: null,
    type: "普通",
  };
  const erosionSnapshot = {
    ...snapshot,
    learnsets: snapshot.learnsets.map((learnset) =>
      learnset.spiritId === "sonic-dog"
        ? { ...learnset, skillIds: [...learnset.skillIds, fireworks.id] }
        : learnset,
    ),
    skills: [...snapshot.skills, fireworks],
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "sonic-dog"
        ? { ...spirit, traitIds: [erosion.id] }
        : spirit,
    ),
    traits: [erosion],
  };

  render(<App initialSnapshot={erosionSnapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "乱打");
  await user.click(screen.getByRole("option", { name: /乱打/ }));
  const comboHits = screen.getByRole("spinbutton", {
    name: "攻击方技能1连击次数",
  });
  expect(comboHits).toHaveValue(5);

  const poisonStacks = screen.getByRole("spinbutton", {
    name: "敌方中毒层数",
  });
  await user.clear(poisonStacks);
  await user.type(poisonStacks, "3");
  await user.click(screen.getByRole("checkbox", { name: "触发侵蚀" }));
  expect(comboHits).toHaveValue(8);

  fireEvent.change(comboHits, { target: { value: "9" } });
  expect(comboHits).toHaveValue(9);
  await user.click(screen.getByRole("checkbox", { name: "触发侵蚀" }));
  expect(comboHits).toHaveValue(6);
  await user.click(screen.getByRole("checkbox", { name: "触发侵蚀" }));
  expect(comboHits).toHaveValue(9);

  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "花炮");
  await user.click(screen.getByRole("option", { name: /花炮/ }));
  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能2连击次数" }),
  ).toHaveValue(5);
  await user.click(screen.getByText("2连击，每次连击自己获得魔攻+60%。"));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  expect(within(attackSide).getByText("30层 · +300%")).toBeVisible();
});

test("shows applied attack levels in both attack panel values", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const physicalAttackTile = within(attackSide)
    .getByTitle("物攻")
    .closest(".stat-tile");
  const magicalAttackTile = within(attackSide)
    .getByTitle("魔攻")
    .closest(".stat-tile");
  const physicalBefore = Number(
    physicalAttackTile.querySelector(".stat-tile__panel").textContent,
  );
  const magicalBefore = Number(
    magicalAttackTile.querySelector(".stat-tile__panel").textContent,
  );

  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "魔法增效");
  await user.click(screen.getByRole("option", { name: /魔法增效/ }));
  await user.click(screen.getByText("自己获得魔攻+70%。"));

  expect(
    Number(physicalAttackTile.querySelector(".stat-tile__panel").textContent),
  ).toBe(Math.round(physicalBefore * 1.7));
  expect(
    Number(magicalAttackTile.querySelector(".stat-tile__panel").textContent),
  ).toBe(Math.round(magicalBefore * 1.7));
});

test("applies Prepared Stance attack gain and only applies its counter debuff when checked", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", {
    name: "攻击方能力",
  });
  const defenseSide = within(natureStep).getByRole("group", {
    name: "防御方能力",
  });
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "预备势");
  await user.click(screen.getByRole("option", { name: /预备势/ }));

  await user.click(screen.getByText("自身物攻+80%；应对防御：对方物防-80%。"));
  expect(within(attackSide).getByText("8层 · +80%")).toBeVisible();
  expect(within(defenseSide).getByText("0层 · 0%")).toBeVisible();

  await user.click(
    screen.getByRole("checkbox", {
      name: "攻击方技能1应对防御成功",
    }),
  );
  await user.click(screen.getByText("自身物攻+80%；应对防御：对方物防-80%。"));
  expect(within(attackSide).getByText("16层 · +160%")).toBeVisible();
  expect(within(defenseSide).getByText("-8层 · -44%")).toBeVisible();
});

test("requires a successful defense response before applying Water Bubble Shield", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "水泡盾");
  await user.click(screen.getByRole("option", { name: /水泡盾/ }));

  await user.click(
    screen.getByText("减伤80%，应对攻击：自己获得魔攻+70%。"),
  );
  expect(within(attackSide).getByText("0层 · 0%")).toBeVisible();

  await user.click(
    screen.getByRole("checkbox", {
      name: "攻击方技能1防御应对成功",
    }),
  );
  await user.click(
    screen.getByText("减伤80%，应对攻击：自己获得魔攻+70%。"),
  );
  expect(within(attackSide).getByText("7层 · +70%")).toBeVisible();
});

test("applies a clicked defense skill reduction and clears it after another skill is used", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "水泡盾");
  await user.click(screen.getByRole("option", { name: /水泡盾/ }));
  await user.click(
    screen.getByText("减伤80%，应对攻击：自己获得魔攻+70%。"),
  );

  await user.click(screen.getByRole("button", { name: "高级选项" }));
  expect(screen.getByRole("spinbutton", { name: "防御技能减伤" })).toHaveValue(80);

  await user.click(
    screen.getByText("减伤80%，应对攻击：自己获得魔攻+70%。"),
  );
  expect(screen.getByRole("spinbutton", { name: "防御技能减伤" })).toHaveValue(0);

  await user.click(
    screen.getByText("减伤80%，应对攻击：自己获得魔攻+70%。"),
  );
  expect(screen.getByRole("spinbutton", { name: "防御技能减伤" })).toHaveValue(80);

  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "火焰冲击");
  await user.click(screen.getByRole("option", { name: /火焰冲击/ }));
  await user.click(
    within(
      screen.getByRole("group", {
        name: "攻击方技能2，当前选中",
      }),
    ).getByText("对敌方精灵造成物理伤害。"),
  );

  await user.click(screen.getByRole("button", { name: "切换计算方向" }));
  expect(screen.getByRole("spinbutton", { name: "防御技能减伤" })).toHaveValue(0);
});

test("applies Pain Lover attack levels once per recorded incoming hit", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "嗜痛");
  await user.click(screen.getByRole("option", { name: /嗜痛/ }));
  await user.click(
    screen.getByRole("checkbox", {
      name: "攻击方技能1防御应对成功",
    }),
  );
  const hits = screen.getByRole("spinbutton", {
    name: "攻击方技能1本次承受攻击次数",
  });
  await user.clear(hits);
  await user.type(hits, "3");
  await user.click(
    screen.getByText(
      "减伤80%，应对攻击：期间自己每受到1次攻击伤害，获得双攻+40%。",
    ),
  );

  expect(within(attackSide).getByText("12层 · +120%")).toBeVisible();
});

test("applies the same status-skill interaction to the defense-side loadout", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const defenseSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "防御方能力" });
  const picker = screen.getByRole("combobox", { name: "防御方技能1" });
  await user.clear(picker);
  await user.type(picker, "魔法增效");
  await user.click(screen.getByRole("option", { name: /魔法增效/ }));

  const selectedRow = screen.getByRole("group", {
    name: "防御方技能1，当前选中",
  });
  await user.click(within(selectedRow).getByText("自己获得魔攻+70%。"));

  expect(within(defenseSide).getByText("7层 · +70%")).toBeVisible();
});

test("applies both Steam March branches to attack level and the displayed speed panel", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const speedTile = within(attackSide).getByTitle("速度").closest(".stat-tile");
  const speedBefore = Number(
    speedTile.querySelector(".stat-tile__panel").textContent,
  );
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "蒸汽进行曲");
  await user.click(screen.getByRole("option", { name: /蒸汽进行曲/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1速度+60" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1物攻+90%" }),
  );
  await user.click(screen.getByText("选择：自己获得速度+60或物攻+90%。"));

  expect(within(attackSide).getByText("9层 · +90%")).toBeVisible();
  expect(
    Number(speedTile.querySelector(".stat-tile__panel").textContent),
  ).toBe(speedBefore + 60);
});

test("doubles all existing positive own levels after Mud Armor counters", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", {
    name: "攻击方能力",
  });
  const defenseSide = within(natureStep).getByRole("group", {
    name: "防御方能力",
  });
  const ownPhysicalDefense = within(attackSide)
    .getByTitle("物防")
    .closest(".stat-tile");
  const physicalDefenseBefore = Number(
    ownPhysicalDefense.querySelector(".stat-tile__panel").textContent,
  );
  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "魔法增效");
  await user.click(screen.getByRole("option", { name: /魔法增效/ }));
  await user.click(screen.getByText("自己获得魔攻+70%。"));

  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "泥浆铠甲");
  await user.click(screen.getByRole("option", { name: /泥浆铠甲/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能2防御应对成功" }),
  );
  await user.click(
    screen.getByText("自己获得物攻、物防+60%；防御应对成功时增益翻倍。"),
  );

  expect(within(attackSide).getByText("26层 · +260%")).toBeVisible();
  expect(
    Number(ownPhysicalDefense.querySelector(".stat-tile__panel").textContent),
  ).toBe(Math.round(physicalDefenseBefore * 2.2));
  expect(within(defenseSide).getByText("0层 · 0%")).toBeVisible();
});

test("keeps Feather Acceleration as a persistent bonus for the other carried skills", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "羽化加速");
  await user.click(screen.getByRole("option", { name: /羽化加速/ }));
  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "风力冲击");
  await user.click(screen.getByRole("option", { name: /风力冲击/ }));
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(80);

  await user.click(screen.getByText("自己全部技能威力+20。"));

  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(100);
});

test("manual static power ignores later fixed bonuses until restored", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "羽化加速");
  await user.click(screen.getByRole("option", { name: /羽化加速/ }));
  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "风力冲击");
  await user.click(screen.getByRole("option", { name: /风力冲击/ }));

  const power = screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" });
  await user.clear(power);
  await user.type(power, "55{Enter}");
  expect(power).toHaveValue(55);

  await user.click(screen.getByText("自己全部技能威力+20。"));

  expect(power).toHaveValue(55);

  await user.clear(power);
  await user.type(power, "45{Enter}");
  expect(power).toHaveValue(45);
  await user.tab();

  expect(power).toHaveValue(45);

  await user.click(screen.getByRole("button", { name: "恢复自动威力" }));

  expect(power).toHaveValue(100);
});

test("toggles Quench's checked response without stacking its doubling", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const first = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(first);
  await user.type(first, "淬火");
  await user.click(screen.getByRole("option", { name: /淬火/ }));
  const second = screen.getByRole("combobox", { name: "攻击方技能2" });
  await user.clear(second);
  await user.type(second, "风力冲击");
  await user.click(screen.getByRole("option", { name: /风力冲击/ }));
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(80);

  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1防御应对成功" }),
  );
  await user.click(
    screen.getByText("减伤80%，应对攻击：下次攻击技能威力翻倍。"),
  );

  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(160);

  await user.click(
    screen.getByText("减伤80%，应对攻击：下次攻击技能威力翻倍。"),
  );
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(80);

  await user.click(
    screen.getByText("减伤80%，应对攻击：下次攻击技能威力翻倍。"),
  );
  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(160);
});

test("reapplies a defense response gain only after its transient state was turned off", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "水泡盾");
  await user.click(screen.getByRole("option", { name: /水泡盾/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1防御应对成功" }),
  );

  const description = "减伤80%，应对攻击：自己获得魔攻+70%。";
  await user.click(screen.getByText(description));
  expect(within(attackSide).getByText("7层 · +70%")).toBeVisible();

  await user.click(screen.getByText(description));
  expect(within(attackSide).getByText("7层 · +70%")).toBeVisible();

  await user.click(screen.getByText(description));
  expect(within(attackSide).getByText("14层 · +140%")).toBeVisible();
});

test("Diffuse Reflection buffs only the first attacking skill of each type", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const selections = [
    ["攻击方技能1", "漫反射"],
    ["攻击方技能2", "风力冲击"],
    ["攻击方技能3", "火焰冲击"],
    ["攻击方技能4", "水之波纹"],
  ];
  for (const [label, name] of selections) {
    const picker = screen.getByRole("combobox", { name: label });
    await user.clear(picker);
    await user.type(picker, name);
    await user.click(screen.getByRole("option", { name: new RegExp(name) }));
  }

  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(80);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能3静态威力" })).toHaveValue(60);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能4静态威力" })).toHaveValue(60);

  await user.click(screen.getByText("每种系别中的至多1个技能，威力+35。"));

  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(115);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能3静态威力" })).toHaveValue(60);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能4静态威力" })).toHaveValue(95);
});

test("Sunny buffs light attacking skills without changing other types", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const selections = [
    ["攻击方技能1", "放晴"],
    ["攻击方技能2", "光能冲击"],
    ["攻击方技能3", "风力冲击"],
  ];
  for (const [label, name] of selections) {
    const picker = screen.getByRole("combobox", { name: label });
    await user.clear(picker);
    await user.type(picker, name);
    await user.click(screen.getByRole("option", { name: new RegExp(name) }));
  }

  await user.click(screen.getByText("光系技能威力永久+50%，应对防御：改为永久+100%。"));

  expect(screen.getByRole("spinbutton", { name: "攻击方技能2静态威力" })).toHaveValue(150);
  expect(screen.getByRole("spinbutton", { name: "攻击方技能3静态威力" })).toHaveValue(80);
});

test("uses the live attacker health percentage when activating Horse Stance", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "马步");
  await user.click(screen.getByRole("option", { name: /马步/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1选择物攻+150%" }),
  );
  const health = screen.getByRole("spinbutton", { name: "攻击方生命百分比" });
  await user.clear(health);
  await user.type(health, "80");
  await user.click(screen.getByText("生命高于80%时，选择：自己获得物攻+150%。"));
  expect(within(attackSide).getByText("0层 · 0%")).toBeVisible();

  await user.clear(health);
  await user.type(health, "81");
  await user.click(screen.getByText("生命高于80%时，选择：自己获得物攻+150%。"));
  expect(within(attackSide).getByText("15层 · +150%")).toBeVisible();
});

test("passes Gal's choice trait into Steam March activation", async () => {
  const user = userEvent.setup();
  const galSnapshot = {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "sonic-dog"
        ? { ...spirit, traitName: "有求必应" }
        : spirit,
    ),
  };
  render(<App initialSnapshot={galSnapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const speedTile = within(attackSide).getByTitle("速度").closest(".stat-tile");
  const speedBefore = Number(
    speedTile.querySelector(".stat-tile__panel").textContent,
  );
  const picker = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(picker);
  await user.type(picker, "蒸汽进行曲");
  await user.click(screen.getByRole("option", { name: /蒸汽进行曲/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1物攻+90%" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方技能1触发特性" }),
  );
  await user.click(screen.getByText("选择：自己获得速度+60或物攻+90%。"));

  expect(within(attackSide).getByText("9层 · +90%")).toBeVisible();
  expect(
    Number(speedTile.querySelector(".stat-tile__panel").textContent),
  ).toBe(speedBefore + 60);
});

test("keeps the exact result available without scrolling to the bottom", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  const result = screen.getByRole("complementary", { name: "伤害结果" });
  expect(result).toHaveClass("result-rail");
  expect(within(result).getByText("音速犬")).toBeVisible();
  expect(within(result).getByText("水灵")).toBeVisible();
});

test("persists the visible spirit favorite control", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectSpirit(user, "攻击方", "音速犬");

  await user.click(screen.getByRole("button", { name: "收藏音速犬" }));

  expect(
    screen.getByRole("button", { name: "取消收藏音速犬" }),
  ).toBeVisible();
  expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY))).toContainEqual(
    expect.objectContaining({
      id: "spirit:sonic-dog",
      spiritId: "sonic-dog",
    }),
  );
});

test("reverse direction edits the current attacking side", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  await user.click(screen.getByRole("button", { name: "切换计算方向" }));

  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue("水之波纹");
});

test("swapping spirits returns the detailed controls to left attack and right defense", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  await user.click(screen.getByRole("button", { name: "切换计算方向" }));
  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const leftSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const rightSide = within(natureStep).getByRole("group", { name: "防御方能力" });
  expect(within(leftSide).getByText("防御能力等级")).toBeVisible();
  expect(within(rightSide).getByText("攻击能力等级")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "交换双方完整配置" }));

  expect(within(leftSide).getByText("攻击能力等级")).toBeVisible();
  expect(within(rightSide).getByText("防御能力等级")).toBeVisible();
});

test("selecting Mana Burst clears manual power and resolves zero energy immediately", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const manualPower = screen.getByRole("spinbutton", { name: "静态威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "222");
  const skillPicker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(skillPicker);
  await user.type(skillPicker, "魔能");
  await user.click(screen.getByRole("option", { name: /魔能爆/ }));

  expect(screen.queryByText("魔能爆需要当前能量")).not.toBeInTheDocument();
  const singleSkillPanel = screen.getByRole("tabpanel", { name: "单技能" });
  expect(
    within(singleSkillPanel).getByText("0 能量 → 威力 45"),
  ).toBeVisible();
});

test("Wish Power reacts to its target-status condition and Focus in the real editor", async () => {
  const user = userEvent.setup();
  const wishSnapshot = {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) =>
      spirit.id === "sonic-dog"
        ? { ...spirit, traitIds: ["focus-trait"] }
        : spirit,
    ),
  };
  render(<App initialSnapshot={wishSnapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const skillPicker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(skillPicker);
  await user.type(skillPicker, "愿力");
  await user.click(screen.getAllByRole("option", { name: /愿力冲击/ })[0]);

  const baseDamage = Number(screen.getByTestId("primary-damage").textContent);
  await user.click(
    screen.getByRole("checkbox", { name: "目标本回合使用状态技能" }),
  );
  const counterDamage = Number(
    screen.getByTestId("primary-damage").textContent,
  );
  expect(counterDamage).toBeGreaterThan(baseDamage);

  await user.click(screen.getByRole("checkbox", { name: "入场首回合" }));
  expect(Number(screen.getByTestId("primary-damage").textContent)).toBeGreaterThan(
    counterDamage,
  );
});

test("keeps single-skill manual power across a four-skill round trip", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const manualPower = screen.getByRole("spinbutton", { name: "静态威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "92{Enter}");
  await user.click(screen.getByRole("tab", { name: "四技能" }));
  await user.click(screen.getByRole("tab", { name: "单技能" }));

  expect(screen.getByRole("spinbutton", { name: "静态威力" })).toHaveValue(
    92,
  );
});

test("shows complete configurations in green and manual favorites in purple", async () => {
  localStorage.clear();
  localStorage.setItem(
    SPIRIT_CONFIG_STORAGE_KEY,
    JSON.stringify({
      configs: {
        "sonic-dog": {
          displayIvs: {
            hp: 0,
            speed: 60,
            physicalAttack: 60,
            magicalAttack: 60,
            physicalDefense: 0,
            magicalDefense: 0,
          },
          natureId: "adamant",
          skills: {
            four: ["fire-strike", "head-on-blow", null, null],
            single: "fire-strike",
          },
          spiritId: "sonic-dog",
          updatedAt: "2026-07-29T12:00:00.000Z",
        },
      },
      schemaVersion: 1,
    }),
  );
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectSpirit(user, "攻击方", "音速犬");

  const completeStar = screen.getByRole("button", {
    name: "手动收藏音速犬",
  });
  expect(completeStar).toHaveClass("is-favorite--complete");

  await user.click(completeStar);
  const manualStar = screen.getByRole("button", {
    name: "取消收藏音速犬",
  });
  expect(manualStar).toHaveClass("is-favorite--manual");
  expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY))).toContainEqual(
    expect.objectContaining({ spiritId: "sonic-dog" }),
  );

  await user.click(manualStar);
  expect(
    screen.getByRole("button", { name: "手动收藏音速犬" }),
  ).toHaveClass("is-favorite--complete");
  expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY))).toEqual([]);
});

test("restores one global spirit configuration with nested four-skill state", async () => {
  localStorage.clear();
  localStorage.setItem(
    SPIRIT_CONFIG_STORAGE_KEY,
    JSON.stringify({
      configs: {
        "sonic-dog": {
          displayIvs: {
            hp: 17,
            speed: 54,
            physicalAttack: 60,
            magicalAttack: 0,
            physicalDefense: 0,
            magicalDefense: 0,
          },
          natureId: "adamant",
          skills: {
            four: [
              "fire-strike",
              "mana-burst",
              {
                context: { enemySwitchedThisTurn: true },
                overrides: { basePower: 180 },
                skillId: "head-on-blow",
              },
              "multi-hit",
            ],
            single: "fire-strike",
          },
          spiritId: "sonic-dog",
          updatedAt: "2026-07-29T12:00:00.000Z",
        },
      },
      schemaVersion: 1,
    }),
  );
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await selectSpirit(user, "攻击方", "音速犬");
  await selectSpirit(user, "防御方", "水灵");

  expect(
    screen.getByRole("button", { name: "攻击方物攻增益" }),
  ).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "具体版" }));
  const attackStats = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  expect(
    screen.getByRole("combobox", { name: "攻击方性格" }),
  ).toHaveValue("adamant");
  expect(
    within(attackStats).getByRole("spinbutton", { name: "HP个体" }),
  ).toHaveValue(17);
  expect(
    screen.getByRole("checkbox", {
      name: "攻击方技能3敌方本回合换精灵",
    }),
  ).toBeChecked();
  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能3静态威力" }),
  ).toHaveValue(280);

  await selectSpirit(user, "攻击方", "风暴战犬");
  await selectSpirit(user, "攻击方", "音速犬");
  expect(
    screen.getByRole("checkbox", {
      name: "攻击方技能3敌方本回合换精灵",
    }),
  ).toBeChecked();
});

test("restores single-skill conditions and manual inputs after an immediate remount", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  const firstRender = render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const skillPicker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(skillPicker);
  await user.type(skillPicker, "当头棒喝");
  await user.click(screen.getByRole("option", { name: /当头棒喝/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  );
  const manualPower = screen.getByRole("spinbutton", { name: "静态威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "137{Enter}");
  firstRender.unmount();

  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue(
    "当头棒喝",
  );
  expect(
    screen.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  expect(screen.getByRole("spinbutton", { name: "静态威力" })).toHaveValue(
    137,
  );
});

test("restores defender single and four-skill edits after remounting", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  const firstRender = render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);
  await user.click(screen.getByRole("button", { name: "切换计算方向" }));

  const singlePicker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(singlePicker);
  await user.type(singlePicker, "当头棒喝");
  await user.click(screen.getByRole("option", { name: /当头棒喝/ }));
  await user.click(
    screen.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  );
  const singlePower = screen.getByRole("spinbutton", { name: "静态威力" });
  await user.clear(singlePower);
  await user.type(singlePower, "137{Enter}");

  await user.click(screen.getByRole("tab", { name: "四技能" }));
  const fourPicker = screen.getByRole("combobox", { name: "防御方技能1" });
  await user.clear(fourPicker);
  await user.type(fourPicker, "当头棒喝");
  await user.click(screen.getByRole("option", { name: /当头棒喝/ }));
  await user.click(
    screen.getByRole("checkbox", {
      name: "防御方技能1敌方本回合换精灵",
    }),
  );
  const fourPower = screen.getByRole("spinbutton", {
    name: "防御方技能1静态威力",
  });
  await user.clear(fourPower);
  await user.type(fourPower, "166{Enter}");
  firstRender.unmount();

  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);
  await user.click(screen.getByRole("button", { name: "切换计算方向" }));
  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue(
    "当头棒喝",
  );
  expect(
    screen.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  expect(screen.getByRole("spinbutton", { name: "静态威力" })).toHaveValue(
    137,
  );

  await user.click(screen.getByRole("tab", { name: "四技能" }));
  expect(
    screen.getByRole("combobox", { name: "防御方技能1" }),
  ).toHaveValue("当头棒喝");
  expect(
    screen.getByRole("checkbox", {
      name: "防御方技能1敌方本回合换精灵",
    }),
  ).toBeChecked();
  expect(
    screen.getByRole("spinbutton", { name: "防御方技能1静态威力" }),
  ).toHaveValue(166);
});

test("clear current page preserves saved spirit memory", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectSpirit(user, "攻击方", "音速犬");
  await selectSpirit(user, "防御方", "音速犬");

  await user.click(screen.getByRole("button", { name: "攻击方物攻增益" }));
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).configs[
        "sonic-dog"
      ].natureId,
    ).toBe("brave"),
  );
  expect(
    screen.getAllByRole("button", { name: "手动收藏音速犬" }),
  ).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: "防御方魔攻增益" }));
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).configs[
        "sonic-dog"
      ].natureId,
    ).toBe("calm"),
  );
  expect(screen.getAllByRole("button", { name: "手动收藏音速犬" })).toHaveLength(
    2,
  );

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "清除当前页配置" }));
  expect(
    JSON.parse(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).configs[
      "sonic-dog"
    ].natureId,
  ).toBe("calm");
});

test("cleanup removes only incomplete memories after confirmation", async () => {
  localStorage.clear();
  const complete = {
    displayIvs: {
      hp: 0,
      speed: 60,
      physicalAttack: 60,
      magicalAttack: 60,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    natureId: "adamant",
    skills: {
      four: ["fire-strike", "mana-burst", null, null],
      single: null,
    },
    spiritId: "sonic-dog",
    traitValues: {},
  };
  const incomplete = {
    ...complete,
    natureId: "neutral",
    spiritId: "storm-dog",
  };
  localStorage.setItem(SPIRIT_CONFIG_STORAGE_KEY, JSON.stringify({
    configs: { "sonic-dog": complete, "storm-dog": incomplete },
    schemaVersion: 2,
  }));
  const favorites = JSON.stringify([{
    id: "spirit:sonic-dog",
    kind: "spirit",
    spiritId: "sonic-dog",
  }]);
  localStorage.setItem(FAVORITES_STORAGE_KEY, favorites);
  const teams = JSON.stringify({
    activeTeamId: null,
    schemaVersion: 1,
    teams: [],
  });
  localStorage.setItem(TEAM_STORAGE_KEY, teams);

  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "清理未完成配置" }));
  const dialog = screen.getByRole("dialog", { name: "清理未完成配置" });
  expect(within(dialog).getByText(
    "仅清理未完成的精灵配置，收藏、完整配置和队伍不会删除。",
  )).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "确认清理" }));

  expect(
    Object.keys(JSON.parse(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).configs),
  ).toEqual(["sonic-dog"]);
  expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe(favorites);
  expect(localStorage.getItem(TEAM_STORAGE_KEY)).toBe(teams);
});

test("individual spirit changes return damage results to the attack side", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);
  await user.click(screen.getByRole("button", { name: "切换计算方向" }));

  await selectSpirit(user, "攻击方", "风暴战犬");

  const result = screen.getByRole("complementary", { name: "伤害结果" });
  expect(within(result).getByText("风暴战犬")).toBeVisible();
  expect(within(result).getByText("水灵")).toBeVisible();
  expect(within(result).getByText("风力冲击")).toBeVisible();
});

test("changing to an unremembered attacker restores role defaults instead of inheriting state", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(
    screen.getByRole("button", { name: "攻击方物攻增益" }),
  );
  await openDetailedMode(user);

  const skillPicker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(skillPicker);
  await user.type(skillPicker, "魔能爆");
  await user.click(screen.getByRole("option", { name: /魔能爆/ }));
  const manualPower = screen.getByRole("spinbutton", { name: "静态威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "143");
  await selectSpirit(user, "攻击方", "水灵");

  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue(
    "水之波纹",
  );
  expect(screen.getByRole("spinbutton", { name: "静态威力" })).toHaveValue(
    60,
  );
  await user.click(screen.getByRole("button", { name: "精简版" }));
  expect(
    screen.getByRole("button", { name: "攻击方普通性格" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("four-skill mode exposes bilateral damage previews", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("tab", { name: "四技能" }));

  expect(
    screen.getByLabelText(/攻击方风力冲击攻击水灵：\d+伤害，\d+\.\d% HP/),
  ).toBeVisible();
  expect(
    screen.getByLabelText(/防御方水之波纹攻击音速犬：\d+伤害，\d+\.\d% HP/),
  ).toBeVisible();
});

test("applies selected skill effects and declared hit counts without manual power math", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const picker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(picker);
  await user.type(picker, "当头棒喝");
  await user.click(screen.getByRole("option", { name: /当头棒喝/ }));

  expect(
    screen.getByRole("spinbutton", { name: "静态威力" }),
  ).toHaveValue(80);
  const switched = screen.getByRole("checkbox", {
    name: "敌方本回合换精灵",
  });
  expect(switched).not.toBeChecked();
  await user.click(switched);
  expect(
    screen.getByRole("spinbutton", { name: "静态威力" }),
  ).toHaveValue(180);

  await user.clear(picker);
  await user.type(picker, "乱打");
  await user.click(screen.getByRole("option", { name: /乱打/ }));
  expect(screen.getByRole("spinbutton", { name: "连击次数" })).toHaveValue(5);

  await user.clear(picker);
  await user.type(picker, "当头棒喝");
  await user.click(screen.getByRole("option", { name: /当头棒喝/ }));
  expect(
    screen.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  expect(
    screen.getByRole("spinbutton", { name: "静态威力" }),
  ).toHaveValue(180);
});

test("loads one team member into the attack side without linking later edits", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await user.click(screen.getByRole("button", { name: "打开队伍" }));
  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "编辑空位 1" }));

  const memberEditor = screen.getByRole("region", {
    name: "成员 1 配置",
  });
  const memberSpirit = within(memberEditor).getByRole("combobox", {
    name: "成员精灵",
  });
  await user.clear(memberSpirit);
  await user.type(memberSpirit, "水灵");
  await act(async () => {
    await user.click(
      within(memberEditor).getByRole("option", { name: /水灵/ }),
    );
  });
  await user.selectOptions(
    within(memberEditor).getByRole("combobox", { name: "成员性格" }),
    "adamant",
  );
  const memberAttackIv = within(memberEditor).getByRole("spinbutton", {
    name: "物攻个体",
  });
  fireEvent.change(memberAttackIv, { target: { value: "42" } });

  const personalStorageBefore = localStorage.getItem(
    SPIRIT_CONFIG_STORAGE_KEY,
  );
  const teamStorageBeforeLoad = localStorage.getItem(TEAM_STORAGE_KEY);

  await user.click(
    screen.getByRole("button", { name: "水灵设为攻击方" }),
  );

  expect(
    screen.queryByRole("dialog", { name: "队伍" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "攻击方精灵" }),
  ).toHaveValue("水灵");
  expect(
    screen.queryByRole("region", { name: "性格配置" }),
  ).not.toBeInTheDocument();
  await selectSpirit(user, "防御方", "音速犬");
  await openDetailedMode(user);
  const attackSide = within(
    screen.getByRole("region", { name: "性格配置" }),
  ).getByRole("group", { name: "攻击方能力" });
  const mainAttackIv = within(attackSide).getByRole("spinbutton", {
    name: "物攻个体",
  });
  expect(mainAttackIv).toHaveValue(42);
  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue(
    "水之波纹",
  );
  expect(screen.getByText("已载入攻击方 水灵")).toBeVisible();
  expect(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).toBe(
    personalStorageBefore,
  );
  expect(localStorage.getItem(TEAM_STORAGE_KEY)).toBe(teamStorageBeforeLoad);

  const storedBefore = localStorage.getItem(TEAM_STORAGE_KEY);
  await user.clear(mainAttackIv);
  await user.type(mainAttackIv, "7");
  expect(localStorage.getItem(TEAM_STORAGE_KEY)).toBe(storedBefore);
});

test("uses the selected spirit memory and otherwise starts from its own default skill set", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "攻击方物攻增益" }));
  const firstSkill = screen.getByRole("combobox", { name: "攻击方技能1" });
  await user.clear(firstSkill);
  await user.type(firstSkill, "魔能爆");
  await user.click(screen.getByRole("option", { name: /魔能爆/ }));

  const spiritPicker = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.clear(spiritPicker);
  await user.type(spiritPicker, "水灵");
  await user.click(screen.getByRole("option", { name: /水灵/ }));

  expect(
    screen.getByRole("combobox", { name: "攻击方技能1" }),
  ).toHaveValue("水之波纹");
  expect(
    screen.getByRole("combobox", { name: "攻击方技能2" }),
  ).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "攻击方技能3" }),
  ).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "攻击方技能4" }),
  ).toHaveValue("");

  await selectSpirit(user, "攻击方", "音速犬");
  expect(
    screen.getByRole("button", { name: "攻击方物攻增益" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("combobox", { name: "攻击方技能1" }),
  ).toHaveValue("魔能爆");
});

test("rejects a validly signed share that references an unknown spirit", async () => {
  const invalidState = createInitialState(snapshot);
  invalidState.sides.attacker.spiritId = "missing-spirit";
  const hash = await encodeShareState(invalidState);
  window.history.replaceState(null, "", hash);

  render(<App initialSnapshot={snapshot} />);

  expect(
    await screen.findByText("分享配置包含当前数据中不存在的精灵"),
  ).toBeVisible();
  expect(screen.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue(
    "",
  );
  window.history.replaceState(null, "", window.location.pathname);
});

test("offers current-version recalculation for an older valid share", async () => {
  const user = userEvent.setup();
  const oldState = createInitialState(snapshot);
  oldState.versions = { data: "s2-old", rules: "rules-old" };
  window.history.replaceState(null, "", await encodeShareState(oldState));

  render(<App initialSnapshot={snapshot} />);

  const dialog = await screen.findByRole("dialog", {
    name: "分享版本不一致",
  });
  expect(within(dialog).getByText(/原数据 s2-old/)).toBeVisible();
  expect(within(dialog).getByText(/当前数据 s3-test/)).toBeVisible();
  await waitFor(() => {
    expect(
      within(dialog).getByRole("button", { name: "按当前版本重算" }),
    ).toHaveFocus();
  });

  await user.click(
    within(dialog).getByRole("button", { name: "按当前版本重算" }),
  );
  expect(
    screen.queryByRole("dialog", { name: "分享版本不一致" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("已按当前版本重算，请核对右侧结果")).toBeVisible();
  window.history.replaceState(null, "", window.location.pathname);
});

test("opens one clear dialog for copying or loading a shared configuration", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "分享当前配置" }));

  const dialog = screen.getByRole("dialog", { name: "分享当前配置" });
  expect(dialog).toBeVisible();
  expect(within(dialog).getByText(/不会包含配置库和队伍/)).toBeVisible();
  expect(
    within(dialog).getByRole("button", { name: "复制当前配置链接" }),
  ).toBeDisabled();
  expect(within(dialog).getByRole("textbox", { name: "粘贴分享链接" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "分享当前配置" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开菜单" })).toHaveFocus();
});

test("loads a pasted share from the unified share dialog", async () => {
  const user = userEvent.setup();
  const hash = await encodeShareState(createInitialState(snapshot));
  render(<App initialSnapshot={snapshot} />);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "分享当前配置" }));
  const dialog = screen.getByRole("dialog", { name: "分享当前配置" });
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "粘贴分享链接" }),
    { target: { value: hash } },
  );
  await user.click(
    within(dialog).getByRole("button", { name: "载入分享配置" }),
  );

  expect(
    await screen.findByText("分享配置已载入"),
  ).toBeVisible();
  expect(
    screen.queryByRole("dialog", { name: "分享当前配置" }),
  ).not.toBeInTheDocument();
  window.history.replaceState(null, "", window.location.pathname);
});

test("menu reports its state and closes with Escape or an outside click", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  const trigger = screen.getByRole("button", { name: "打开菜单" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  await user.click(trigger);
  expect(
    screen.getByRole("button", { name: "关闭菜单" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("navigation", { name: "应用菜单" })).toBeVisible();

  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("navigation", { name: "应用菜单" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开菜单" })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  fireEvent.mouseDown(document.body);
  expect(
    screen.queryByRole("navigation", { name: "应用菜单" }),
  ).not.toBeInTheDocument();
});

test("menu keeps only useful actions and explains current-configuration sharing", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  expect(screen.getByRole("button", { name: "分享当前配置" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "复制分享链接" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "导入分享链接" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "安装 WebApp" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "常用精灵配置" })).toBeVisible();
  expect(screen.getByRole("button", { name: "数据来源" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "赛季记录" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "分享当前配置" }));
  const dialog = screen.getByRole("dialog", { name: "分享当前配置" });
  await waitFor(() => {
    expect(
      within(dialog).getByRole("textbox", { name: "当前配置链接" }).value,
    ).toMatch(/#v1\./);
  });
  expect(window.location.hash).toMatch(/^#v1\./);
  await user.click(
    within(dialog).getByRole("button", { name: "复制当前配置链接" }),
  );
  expect(screen.getByText("分享链接已复制")).toBeVisible();

  window.history.replaceState(null, "", window.location.pathname);
});

test("enables type analysis from display settings and remembers the switch", async () => {
  const user = userEvent.setup();
  const first = render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  expect(screen.queryByRole("region", { name: "属性分析" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "显示设置" }));
  await user.click(screen.getByRole("checkbox", { name: "属性克制与打击面" }));
  await user.click(screen.getByRole("button", { name: "完成" }));

  expect(screen.getByRole("region", { name: "属性分析" })).toBeVisible();
  expect(localStorage.getItem(TYPE_COVERAGE_STORAGE_KEY)).toBe("1");

  first.unmount();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  expect(screen.getByRole("region", { name: "属性分析" })).toBeVisible();
});

test("enables negative-status settlement, edits stacks, and remembers the switch", async () => {
  const user = userEvent.setup();
  const first = render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  expect(screen.queryByRole("region", { name: "负面状态结算" }))
    .not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "显示设置" }));
  await user.click(screen.getByRole("checkbox", { name: "负面状态结算" }));
  await user.click(screen.getByRole("button", { name: "完成" }));
  await user.click(screen.getByRole("button", { name: "高级选项" }));
  await user.click(screen.getByRole("button", { name: "防御方灼烧加一层" }));

  const settlement = screen.getByRole("region", { name: "负面状态结算" });
  expect(settlement).toBeVisible();
  expect(settlement).toHaveTextContent("灼烧");
  expect(settlement).toHaveTextContent("灼烧 ×1");
  expect(settlement).toHaveTextContent("1.8% · 8 HP");
  expect(localStorage.getItem(NEGATIVE_STATUS_SETTLEMENT_STORAGE_KEY)).toBe("1");

  first.unmount();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);
  await user.click(screen.getByRole("button", { name: "高级选项" }));
  expect(screen.getByRole("region", { name: "负面状态层数" })).toBeVisible();
});

test("切换四技能行到可编辑的显示威力并记住设置", async () => {
  const user = userEvent.setup();
  const first = render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));

  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能1静态威力" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "显示设置" }));
  expect(screen.getByText("显示威力：")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "显示威力" }));
  await user.click(screen.getByRole("button", { name: "完成" }));

  expect(screen.getByRole("spinbutton", { name: "攻击方技能1显示威力" })).toBeVisible();
  expect(
    screen.queryByRole("spinbutton", { name: "攻击方技能1静态威力" }),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem(POWER_DISPLAY_STORAGE_KEY)).toBe("panel");

  first.unmount();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await user.click(screen.getByRole("button", { name: "具体版" }));
  expect(screen.getByRole("spinbutton", { name: "攻击方技能1显示威力" })).toBeVisible();
});

test("loads the built-in popular library only on demand and imports through the existing flow", async () => {
  localStorage.clear();
  const teamBytes = JSON.stringify({
    activeTeamId: null,
    schemaVersion: 1,
    teams: [],
  });
  localStorage.setItem(TEAM_STORAGE_KEY, teamBytes);
  const library = {
    appVersion: "1.5.0",
    entries: [{
      displayIvs: {
        hp: 0,
        magicalAttack: 60,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      },
      natureId: "adamant",
      skills: ["fire-strike", "mana-burst", null, null],
      spiritId: "sonic-dog",
      traitValues: {},
    }],
    entryCount: 1,
    exportedAt: "2026-08-12T10:16:00.000Z",
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
    versions: { data: "s3-test", rules: "1.0.0" },
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(library),
  });
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "常用精灵配置" }));

  const dialog = await screen.findByRole("dialog", { name: "常用精灵配置" });
  expect(fetchMock).toHaveBeenCalledWith("/data/presets/pvp-popular-configs.json");
  expect(within(dialog).getByText("新增配置").nextElementSibling).toHaveTextContent("1");
  await user.click(within(dialog).getByRole("button", { name: "导入常用配置" }));

  expect(screen.getByText(/已导入 1 只配置/)).toBeVisible();
  expect(localStorage.getItem(TEAM_STORAGE_KEY)).toBe(teamBytes);
  expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY))).toEqual(
    expect.arrayContaining([expect.objectContaining({ spiritId: "sonic-dog" })]),
  );
  fetchMock.mockRestore();
});

test("opens configuration library export from the system menu with live counts", async () => {
  localStorage.clear();
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([{
    id: "spirit:sonic-dog",
    kind: "spirit",
    spiritId: "sonic-dog",
  }]));
  localStorage.setItem(SPIRIT_CONFIG_STORAGE_KEY, JSON.stringify({
    schemaVersion: 2,
    configs: {
      "sonic-dog": {
        spiritId: "sonic-dog",
        natureId: "adamant",
        displayIvs: {
          hp: 0,
          speed: 60,
          physicalAttack: 60,
          magicalAttack: 60,
          physicalDefense: 0,
          magicalDefense: 0,
        },
        skills: {
          four: ["fire-strike", "mana-burst", null, null],
          single: null,
        },
        traitValues: {},
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    },
  }));
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "配置库导出" }));

  const dialog = screen.getByRole("dialog", { name: "配置库导出" });
  expect(within(dialog).getByText("可导出 1 只精灵")).toBeVisible();
  expect(
    within(dialog).getByText("跳过").nextElementSibling,
  ).toHaveTextContent("0");
});

test("configuration library export recognizes complete legacy memories without manual favorites", async () => {
  localStorage.clear();
  localStorage.setItem("rock-calculator.spirit-configs.v1", JSON.stringify({
    schemaVersion: 1,
    configs: {
      "sonic-dog": {
        spiritId: "sonic-dog",
        natureId: "adamant",
        displayIvs: {
          hp: 0,
          speed: 60,
          physicalAttack: 60,
          magicalAttack: 60,
          physicalDefense: 0,
          magicalDefense: 0,
        },
        skills: {
          four: ["fire-strike", "mana-burst", null, null],
          single: null,
        },
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    },
  }));
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "配置库导出" }));

  const dialog = screen.getByRole("dialog", { name: "配置库导出" });
  expect(within(dialog).getByText("可导出 1 只精灵")).toBeVisible();
  const autoMetric = within(dialog).getByText("自动识别").parentElement;
  expect(within(autoMetric).getByText("1")).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "导出" })).toBeEnabled();
});

test("share falls back to a copyable link when clipboard access fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
    new DOMException("Document is not focused", "NotAllowedError"),
  );
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "分享当前配置" }));

  const dialog = screen.getByRole("dialog", { name: "分享当前配置" });
  expect(dialog).toBeVisible();
  await waitFor(() => {
    expect(
      within(dialog).getByRole("textbox", { name: "当前配置链接" }).value,
    ).toMatch(/#v1\./);
  });
  await user.click(
    within(dialog).getByRole("button", { name: "复制当前配置链接" }),
  );
  expect(screen.getByText("复制受限，请手动复制上方链接")).toBeVisible();

  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "分享当前配置" }),
  ).not.toBeInTheDocument();
  window.history.replaceState(null, "", window.location.pathname);
});

test("moves focus into the mobile result dialog and closes it with Escape", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "展开伤害结果" }));
  const close = screen.getByRole("button", { name: "关闭伤害结果" });
  expect(close).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "完整伤害结果" }),
  ).not.toBeInTheDocument();
});
