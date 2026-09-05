import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SkillPicker } from "../../src/components/SkillPicker.jsx";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";

const patch = {
  id: "s4-preview-2026-09-10",
  label: "S4 前瞻调整",
  date: "2026.09.10",
  status: "preview",
};

const spirit = {
  id: "cheer-crab",
  fullName: "加油蟹",
  stage: "三阶",
  types: ["水", "萌"],
  traitName: "物极必反",
  changeInfo: {
    patch,
    entityId: "cheer-crab",
    entityName: "加油蟹",
    items: [
      { kind: "stat", field: "physicalAttack", label: "物攻", before: 108, after: 92 },
      { kind: "trait", label: "特性·物极必反", before: "旧效果", after: "新效果" },
    ],
  },
};

const skill = {
  id: "remote-access",
  name: "远程访问",
  type: "机械",
  category: "status",
  basePower: 0,
  cost: 1,
  changeInfo: {
    patch,
    entityId: "remote-access",
    entityName: "远程访问",
    items: [{ kind: "stat", field: "cost", label: "能耗", before: 2, after: 1 }],
  },
};

test("精灵改动只在叹号交互后展示，点击后可固定", async () => {
  const user = userEvent.setup();
  render(
    <SpiritPicker
      label="攻击方"
      onSelect={vi.fn()}
      selected={spirit}
      side="attack"
      spirits={[spirit]}
    />,
  );

  expect(screen.queryByText("108 → 92")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "查看加油蟹本期改动" });
  await user.hover(trigger);
  expect(screen.getByRole("tooltip", { name: "加油蟹本期改动" })).toBeVisible();
  expect(screen.getByText("108 → 92")).toBeVisible();

  await user.click(trigger);
  await user.unhover(trigger);
  expect(screen.getByRole("tooltip", { name: "加油蟹本期改动" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip", { name: "加油蟹本期改动" })).not.toBeInTheDocument();
});

test("技能选择器在已选技能和候选项旁显示叹号，不常驻改动正文", async () => {
  const user = userEvent.setup();
  render(
    <SkillPicker
      ariaLabel="攻击方技能1"
      onSelect={vi.fn()}
      selected={skill}
      skills={[skill]}
    />,
  );

  expect(screen.queryByText("2 → 1")).not.toBeInTheDocument();
  const triggers = screen.getAllByRole("button", { name: "查看远程访问本期改动" });
  await user.hover(triggers[0]);
  expect(screen.getByText("2 → 1")).toBeVisible();
});

test("S4 全新最终形态与首领显示 NEW 标识，技能仍不显示改动叹号", async () => {
  const user = userEvent.setup();
  const newSpirit = {
    ...spirit,
    id: "silver-moon-wolf-king",
    fullName: "银月狼王",
    previewDefaults: { natureId: "cheerful" },
    changeInfo: {
      patch,
      entityName: "银月狼王",
      isNew: true,
      items: [{ kind: "new", label: "新增精灵", after: "特性·铭记于月亮" }],
    },
  };
  const newSkill = {
    ...skill,
    id: "new-s4-skill",
    name: "S4 新技能",
    changeInfo: {
      patch,
      entityName: "S4 新技能",
      isNew: true,
      items: [{ kind: "new", label: "新增技能", after: "S4 新增" }],
    },
  };
  const newBoss = {
    ...spirit,
    id: "flame-berserker",
    fullName: "烈焰狂战士",
    stage: "首领",
    changeInfo: {
      patch,
      entityName: "烈焰狂战士",
      isNew: true,
      items: [
        { kind: "new", label: "新增首领占位", after: "特性·蒸汽革命" },
      ],
    },
  };

  const { rerender } = render(
    <SpiritPicker
      label="攻击方"
      onSelect={vi.fn()}
      selected={newSpirit}
      side="attack"
      spirits={[newSpirit]}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "查看银月狼王本期改动" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("银月狼王")).toHaveAttribute("data-new", "true");

  rerender(
    <SpiritPicker
      label="攻击方"
      onSelect={vi.fn()}
      selected={newBoss}
      side="attack"
      spirits={[newBoss]}
    />,
  );
  expect(screen.getByText("烈焰狂战士")).toHaveAttribute("data-new", "true");
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(
    screen.getByRole("option", { name: /烈焰狂战士/u }).querySelector("strong"),
  ).toHaveAttribute("data-new", "true");

  rerender(
    <SkillPicker
      ariaLabel="攻击方技能1"
      onSelect={vi.fn()}
      selected={newSkill}
      skills={[newSkill]}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "查看S4 新技能本期改动" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("NEW")).not.toBeInTheDocument();
});
