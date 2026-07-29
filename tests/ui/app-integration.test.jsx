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
import { encodeShareState } from "../../src/state/share.js";
import { SPIRIT_CONFIG_STORAGE_KEY } from "../../src/state/spirit-configs.js";
import { TEAM_STORAGE_KEY } from "../../src/state/team-presets.js";

const snapshot = {
  learnsets: [
    {
      spiritId: "sonic-dog",
      skillIds: [
        "fire-strike",
        "mana-burst",
        "head-on-blow",
        "multi-hit",
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
  ],
  meta: {
    bwikiRevision: 41360,
    id: "s3-test",
    rulesVersion: "1.0.0",
    seasonId: "s3",
  },
  skills: [
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
      category: "magical",
      cost: 1,
      id: "water-strike",
      name: "水之波纹",
      provenance: { basePower: "test" },
      ruleId: null,
      type: "水",
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
  ],
  traits: [],
};

beforeEach(() => {
  localStorage.removeItem(SPIRIT_CONFIG_STORAGE_KEY);
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
  ).toHaveValue("adamant");

  await user.click(screen.getByRole("button", { name: "精简版" }));
  expect(
    screen.getByRole("button", { name: "攻击方物攻增益" }),
  ).toHaveAttribute("aria-pressed", "true");
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
  expect(attackHp).not.toBeChecked();
  expect(defenseHp).toBeChecked();
  expect(defenseMagicDefense).not.toBeChecked();

  await user.click(attackHp);
  expect(attackHp).toBeChecked();

  await user.click(screen.getByRole("button", { name: "具体版" }));
  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", {
    name: "攻击方能力",
  });
  expect(
    within(attackSide).getByRole("spinbutton", { name: "HP个体" }),
  ).toHaveValue(60);

  await user.click(screen.getByRole("button", { name: "精简版" }));
  await user.click(
    screen.getByRole("checkbox", { name: "攻击方生命个体加点" }),
  );
  await user.click(screen.getByRole("button", { name: "具体版" }));
  expect(
    within(
      screen.getByRole("region", { name: "性格配置" }),
    ).getAllByRole("spinbutton", { name: "HP个体" })[0],
  ).toHaveValue(0);
});

test("reveals the calculator after both spirits are selected and reset clears both", async () => {
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
  await user.click(screen.getByRole("button", { name: "重置全部配置" }));
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
  ).toHaveValue(0);
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
    name: "攻击方技能1威力",
  });
  await user.clear(firstPower);
  await user.type(firstPower, "123");
  expect(firstPower).toHaveValue(123);
  expect(
    screen.getByRole("status", {
      name: /攻击方风力冲击攻击水灵：\d+伤害/,
    }),
  ).toBeVisible();
});

test("defaults the defender to neutral nature with only HP individual-value points", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const natureStep = screen.getByRole("region", { name: "性格配置" });
  const attackSide = within(natureStep).getByRole("group", { name: "攻击方能力" });
  const defenseSide = within(natureStep).getByRole("group", { name: "防御方能力" });

  expect(within(defenseSide).getByRole("combobox")).toHaveValue("neutral");
  expect(within(attackSide).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(60);
  expect(within(attackSide).getByRole("spinbutton", { name: "魔攻个体" })).toHaveValue(60);
  expect(within(attackSide).getByRole("spinbutton", { name: "速度个体" })).toHaveValue(60);
  expect(within(defenseSide).getByRole("spinbutton", { name: "HP个体" })).toHaveValue(60);
  expect(within(defenseSide).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(0);
  expect(within(defenseSide).getByRole("spinbutton", { name: "物防个体" })).toHaveValue(0);
  expect(within(defenseSide).getByRole("spinbutton", { name: "魔防个体" })).toHaveValue(0);
});

test("applies the original site's linear ten-percent power levels beyond six", async () => {
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

  for (let level = 1; level < 10; level += 1) {
    await user.click(addLevel);
  }
  expect(within(attackSide).getByText("10层 · +100%")).toBeVisible();
  expect(addLevel).toBeDisabled();
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

test("selecting a dynamic skill clears a previous manual power override", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const manualPower = screen.getByRole("spinbutton", { name: "手动威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "222");
  const skillPicker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(skillPicker);
  await user.type(skillPicker, "魔能");
  await user.click(screen.getByRole("option", { name: /魔能爆/ }));

  expect(screen.getByText("魔能爆需要当前能量")).toBeVisible();
});

test("keeps single-skill manual power across a four-skill round trip", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);
  await openDetailedMode(user);

  const manualPower = screen.getByRole("spinbutton", { name: "手动威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "92");
  await user.click(screen.getByRole("tab", { name: "四技能" }));
  await user.click(screen.getByRole("tab", { name: "单技能" }));

  expect(screen.getByRole("spinbutton", { name: "手动威力" })).toHaveValue(
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
    within(attackStats).getByRole("spinbutton", { name: "HP个体" }),
  ).toHaveValue(17);
  expect(
    screen.getByRole("checkbox", {
      name: "攻击方技能3敌方本回合换精灵",
    }),
  ).toBeChecked();
  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能3威力" }),
  ).toHaveValue(180);

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
  const manualPower = screen.getByRole("spinbutton", { name: "手动威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "137");
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
  expect(screen.getByRole("spinbutton", { name: "手动威力" })).toHaveValue(
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
  const singlePower = screen.getByRole("spinbutton", { name: "手动威力" });
  await user.clear(singlePower);
  await user.type(singlePower, "137");

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
    name: "防御方技能1威力",
  });
  await user.clear(fourPower);
  await user.type(fourPower, "166");
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
  expect(screen.getByRole("spinbutton", { name: "手动威力" })).toHaveValue(
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
    screen.getByRole("spinbutton", { name: "防御方技能1威力" }),
  ).toHaveValue(166);
});

test("automatically saves the last edited side and reset clears spirit memory", async () => {
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
    ).toBe("adamant"),
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
    ).toBe("smart"),
  );
  expect(screen.getAllByRole("button", { name: "收藏音速犬" })).toHaveLength(
    2,
  );

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "重置全部配置" }));
  expect(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).toBeNull();
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
  const manualPower = screen.getByRole("spinbutton", { name: "手动威力" });
  await user.clear(manualPower);
  await user.type(manualPower, "143");
  await selectSpirit(user, "攻击方", "水灵");

  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue(
    "水之波纹",
  );
  expect(screen.getByRole("spinbutton", { name: "手动威力" })).toHaveValue(
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
    within(screen.getByLabelText("技能威力")).getByText("80"),
  ).toBeVisible();
  const switched = screen.getByRole("checkbox", {
    name: "敌方本回合换精灵",
  });
  expect(switched).not.toBeChecked();
  await user.click(switched);
  expect(
    within(screen.getByLabelText("技能威力")).getByText("180"),
  ).toBeVisible();

  await user.clear(picker);
  await user.type(picker, "乱打");
  await user.click(screen.getByRole("option", { name: /乱打/ }));
  expect(screen.getByRole("spinbutton", { name: "连击次数" })).toHaveValue(5);

  await user.clear(picker);
  await user.type(picker, "当头棒喝");
  await user.click(screen.getByRole("option", { name: /当头棒喝/ }));
  expect(
    screen.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).not.toBeChecked();
  expect(
    within(screen.getByLabelText("技能威力")).getByText("80"),
  ).toBeVisible();
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
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).configs[
        "water-spirit"
      ],
    ).toMatchObject({
      displayIvs: expect.objectContaining({ physicalAttack: 42 }),
      natureId: "adamant",
    }),
  );

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

test("opens a pasteable share-link importer from the menu", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "导入分享链接" }));

  expect(
    screen.getByRole("dialog", { name: "导入分享链接" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "分享链接" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "导入分享链接" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开菜单" })).toHaveFocus();
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

test("menu actions expose share, data, and season feedback", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "复制分享链接" }));
  expect(window.location.hash).toMatch(/^#v1\./);
  expect(screen.getByText("分享链接已复制")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "数据来源" }));
  expect(screen.getByText("BWIKI 修订 41360")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "赛季记录" }));
  expect(screen.getByText("当前赛季 s3")).toBeVisible();

  window.history.replaceState(null, "", window.location.pathname);
});

test("share falls back to a copyable link when clipboard access fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
    new DOMException("Document is not focused", "NotAllowedError"),
  );
  render(<App initialSnapshot={snapshot} />);
  await selectDefaultSpirits(user);

  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "复制分享链接" }));

  const dialog = screen.getByRole("dialog", { name: "复制分享链接" });
  expect(dialog).toBeVisible();
  expect(
    within(dialog).getByRole("textbox", { name: "生成的分享链接" }).value,
  ).toMatch(/#v1\./);
  expect(screen.getByText("复制受限，请手动复制")).toBeVisible();

  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "复制分享链接" }),
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
