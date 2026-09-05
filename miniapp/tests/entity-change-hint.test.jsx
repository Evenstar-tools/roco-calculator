import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import CombatantCard from "../src/components/CombatantCard.jsx";
import SkillPicker from "../src/components/SkillPicker.jsx";
import SpiritPicker from "../src/components/SpiritPicker.jsx";

const patch = {
  id: "s4-preview-2026-09-10",
  label: "S4 前瞻调整",
  date: "2026.09.10",
  status: "preview",
};

describe("移动端实体改动提示", () => {
  test("点击精灵叹号打开底部详情，且不触发卡片切换", () => {
    const onActivate = vi.fn();
    const spirit = {
      id: "cheer-crab",
      fullName: "加油蟹",
      types: ["水"],
      changeInfo: {
        patch,
        entityName: "加油蟹",
        items: [{ kind: "stat", label: "物攻", before: 108, after: 92 }],
      },
    };

    render(
      <CombatantCard
        identityOnly
        onActivate={onActivate}
        onChange={() => {}}
        side="attacker"
        spirit={spirit}
        spirits={[spirit]}
      />,
    );

    expect(screen.queryByText("108 → 92")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看加油蟹本期改动" }));
    expect(screen.getByRole("dialog", { name: "加油蟹本期改动" })).toBeVisible();
    expect(screen.getByText("108 → 92")).toBeVisible();
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("已选技能和技能列表项只显示叹号，点击后打开详情", () => {
    const skill = {
      id: "remote-access",
      name: "远程访问",
      type: "机械",
      category: "status",
      basePower: 0,
      cost: 1,
      changeInfo: {
        patch,
        entityName: "远程访问",
        items: [{ kind: "stat", label: "能耗", before: 2, after: 1 }],
      },
    };
    render(
      <SkillPicker
        choices={[skill]}
        label="攻击方技能 1"
        onChange={vi.fn()}
        value={skill.id}
      />,
    );

    expect(screen.queryByText("2 → 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看远程访问本期改动" }));
    expect(screen.getByRole("dialog", { name: "远程访问本期改动" })).toBeVisible();
    expect(screen.getByText("2 → 1")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "攻击方技能 1选项" })).not.toBeInTheDocument();
  });

  test("S4 全新精灵与首领显示 NEW 标识，技能仍不显示改动叹号", () => {
    const newSpirit = {
      id: "silver-moon-wolf-king",
      fullName: "银月狼王",
      types: ["幽", "幻"],
      changeInfo: {
        patch,
        entityName: "银月狼王",
        isNew: true,
        items: [{ kind: "new", label: "新增精灵", after: "特性·铭记于月亮" }],
      },
    };
    const newSkill = {
      id: "new-s4-skill",
      name: "S4 新技能",
      type: "幽",
      category: "status",
      basePower: 0,
      cost: 1,
      changeInfo: {
        patch,
        entityName: "S4 新技能",
        isNew: true,
        items: [{ kind: "new", label: "新增技能", after: "S4 新增" }],
      },
    };
    const newBoss = {
      id: "flame-berserker",
      fullName: "烈焰狂战士",
      stage: "首领",
      types: ["火"],
      changeInfo: {
        patch,
        entityName: "烈焰狂战士",
        isNew: true,
        items: [
          { kind: "new", label: "新增首领占位", after: "特性·蒸汽革命" },
        ],
      },
    };

    const newSpiritView = render(
      <CombatantCard
        identityOnly
        onActivate={vi.fn()}
        onChange={() => {}}
        side="attacker"
        spirit={newSpirit}
        spirits={[newSpirit]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "查看银月狼王本期改动" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("银月狼王为本期新增精灵"))
      .toHaveTextContent("NEW");
    newSpiritView.unmount();

    const newBossView = render(
      <CombatantCard
        identityOnly
        onActivate={vi.fn()}
        onChange={() => {}}
        side="attacker"
        spirit={newBoss}
        spirits={[newBoss]}
      />,
    );
    expect(screen.getByLabelText("烈焰狂战士为本期新增首领"))
      .toHaveTextContent("NEW");
    newBossView.unmount();

    const newBossPickerView = render(
      <SpiritPicker
        onChange={vi.fn()}
        side="attacker"
        spirits={[newBoss]}
        value={null}
      />,
    );
    fireEvent.input(screen.getByLabelText("搜索攻击方宠物"), {
      target: { value: "烈焰" },
    });
    expect(
      within(screen.getByRole("button", { name: "选择烈焰狂战士" }))
        .getByLabelText("烈焰狂战士为本期新增首领"),
    ).toHaveTextContent("NEW");
    newBossPickerView.unmount();

    render(
      <SkillPicker
        choices={[newSkill]}
        label="攻击方技能 1"
        onChange={vi.fn()}
        value={newSkill.id}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "查看S4 新技能本期改动" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("NEW")).not.toBeInTheDocument();
  });
});
