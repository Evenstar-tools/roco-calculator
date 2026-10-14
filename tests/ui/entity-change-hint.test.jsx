import { render, screen, within } from "@testing-library/react";
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
  expect(screen.getByText("更新")).toBeVisible();
  expect(screen.queryByText(/前瞻/u)).not.toBeInTheDocument();

  await user.click(trigger);
  await user.unhover(trigger);
  expect(screen.getByRole("tooltip", { name: "加油蟹本期改动" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip", { name: "加油蟹本期改动" })).not.toBeInTheDocument();
});

test.each(["关闭按钮", "遮罩", "详情内容"])("列表改动详情%s不误选精灵", async (action) => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <SpiritPicker
      label="攻击方"
      onSelect={onSelect}
      selected={null}
      side="attack"
      spirits={[spirit]}
    />,
  );
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  await user.click(screen.getByRole("button", { name: "查看加油蟹本期改动" }));
  const tooltip = screen.getByRole("tooltip", { name: "加油蟹本期改动" });
  if (action === "详情内容") {
    await user.click(within(tooltip).getByText("108 → 92"));
  } else if (action === "关闭按钮") {
    await user.click(within(tooltip).getByRole("button", { name: "关闭改动详情" }));
  } else {
    await user.click(screen.getAllByRole("button", { name: "关闭改动详情" })
      .find((button) => !tooltip.contains(button)));
  }
  expect(onSelect).not.toHaveBeenCalled();
  if (action !== "详情内容") {
    expect(screen.queryByRole("tooltip", { name: "加油蟹本期改动" })).not.toBeInTheDocument();
  }
});

test("选择器保留输入焦点时 Escape 也关闭已选精灵的悬浮改动详情", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <SpiritPicker
      label="攻击方"
      onSelect={onSelect}
      selected={spirit}
      side="attack"
      spirits={[spirit]}
    />,
  );
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.click(input);
  const trigger = screen.getAllByRole("button", { name: "查看加油蟹本期改动" })
    .find((button) => button.closest(".spirit-card"));
  await user.hover(trigger);
  expect(input).toHaveFocus();
  expect(screen.getByRole("tooltip", { name: "加油蟹本期改动" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByRole("tooltip", { name: "加油蟹本期改动" })).not.toBeInTheDocument();
});

test("新增精灵有实际改动时，已选卡片和候选列表均优先叹号而非 NEW", async () => {
  const user = userEvent.setup();
  const updatedSpirit = {
    ...spirit,
    previewDefaults: { natureId: "neutral" },
    changeInfo: {
      ...spirit.changeInfo,
      isNew: true,
      items: [
        { kind: "new", label: "新增精灵", after: "S4 新增" },
        ...spirit.changeInfo.items,
      ],
    },
  };
  render(
    <SpiritPicker
      label="攻击方"
      onSelect={vi.fn()}
      selected={updatedSpirit}
      side="attack"
      spirits={[updatedSpirit]}
    />,
  );
  const title = screen.getByText("加油蟹", { selector: ".spirit-card__title strong" });
  expect(title).not.toHaveAttribute("data-new");
  expect(screen.getByRole("button", { name: "查看加油蟹本期改动" })).toBeVisible();
  await user.click(screen.getByRole("combobox", { name: "攻击方精灵" }));
  const option = screen.getByRole("option", { name: /加油蟹/u });
  expect(option.querySelector("strong")).not.toHaveAttribute("data-new");
  await user.click(within(option).getByRole("button", { name: "查看加油蟹本期改动" }));
  expect(screen.getByText("108 → 92")).toBeVisible();
});

test("新增技能有实际改动时仍优先叹号，不常驻改动正文", async () => {
  const user = userEvent.setup();
  const updatedSkill = {
    ...skill,
    changeInfo: {
      ...skill.changeInfo,
      isNew: true,
      items: [
        { kind: "new", label: "新增技能", after: "S4 新增" },
        ...skill.changeInfo.items,
      ],
    },
  };
  render(
    <SkillPicker
      ariaLabel="攻击方技能1"
      onSelect={vi.fn()}
      selected={updatedSkill}
      skills={[updatedSkill]}
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
  expect(screen.getByText("银月狼王", { selector: ".spirit-card__title strong" })).toHaveAttribute("data-new", "true");

  rerender(
    <SpiritPicker
      label="攻击方"
      onSelect={vi.fn()}
      selected={newBoss}
      side="attack"
      spirits={[newBoss]}
    />,
  );
  expect(screen.getByText("烈焰狂战士", { selector: ".spirit-card__title strong" })).toHaveAttribute("data-new", "true");
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
