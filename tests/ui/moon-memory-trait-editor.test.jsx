import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { MoonMemoryTraitEditor } from "../../src/components/MoonMemoryTraitEditor.jsx";

const snapshot = {
  spirits: [
    {
      dexNo: "900",
      fullName: "银月狼王",
      id: "silver-moon-wolf",
      initials: "yylw",
      pinyin: "yinyuelangwang",
      traitIds: ["moon-memory"],
    },
    {
      dexNo: "077",
      fullName: "机械方方",
      id: "gear-square",
      initials: "jxff",
      pinyin: "jixiefangfang",
      traitIds: ["old-toy", "cold-light"],
    },
    {
      dexNo: "201",
      fullName: "纸袋怪",
      id: "paper-bag",
      initials: "zdg",
      pinyin: "zhidaiguai",
      traitIds: ["display-only"],
    },
    {
      dexNo: "301",
      fullName: "怒目怂猫",
      id: "intimidating-cat",
      initials: "nmsm",
      pinyin: "numusongmao",
      traitIds: ["intimidation"],
    },
    {
      dexNo: "302",
      fullName: "巨噬针鼹",
      id: "brave-echidna",
      initials: "jszy",
      pinyin: "jushizhenyan",
      traitIds: ["embolden"],
    },
  ],
  traits: [
    {
      description: "获得自己击败的精灵的特性。",
      id: "moon-memory",
      name: "铭记于月亮",
    },
    { description: "威力+20%。", id: "old-toy", name: "旧玩具" },
    { description: "满足条件时威力+100%。", id: "cold-light", name: "冷光源" },
    {
      description: "攻击后威力翻倍。",
      id: "display-only",
      name: "待验证特性",
    },
    { description: "打断后增加双攻。", id: "intimidation", name: "威慑" },
    { description: "队伍有虫系时增加双攻。", id: "embolden", name: "壮胆" },
    { description: "选择血脉效果。", id: "beast-flower", name: "稀兽花宝" },
  ],
};

const callbacks = {
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onValueChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("only renders for a spirit that natively owns Moon Memory", () => {
  const { rerender } = render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: [] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[1]}
    />,
  );

  expect(screen.queryByRole("combobox", { name: "搜索已吞噬特性" }))
    .not.toBeInTheDocument();

  rerender(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: [] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );
  expect(screen.getByRole("combobox", { name: "搜索已吞噬特性" }))
    .toBeVisible();
});

test("selects one trait from a multi-trait spirit search result", async () => {
  const user = userEvent.setup();
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: [] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  await user.type(
    screen.getByRole("combobox", { name: "搜索已吞噬特性" }),
    "jxff",
  );
  expect(screen.getAllByRole("option")).toHaveLength(2);
  await user.click(screen.getByRole("option", { name: /机械方方 · 冷光源/ }));

  expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
  expect(callbacks.onAdd).toHaveBeenCalledWith("cold-light");
  expect(callbacks.onAdd).not.toHaveBeenCalledWith("old-toy");
});

test("requires clicking an option even when the query exactly matches a trait", async () => {
  const user = userEvent.setup();
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: [] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  await user.type(
    screen.getByRole("combobox", { name: "搜索已吞噬特性" }),
    "旧玩具",
  );
  expect(callbacks.onAdd).not.toHaveBeenCalled();
  await user.click(screen.getByRole("option", { name: /机械方方 · 旧玩具/ }));
  expect(callbacks.onAdd).toHaveBeenCalledWith("old-toy");
});

test("supports keyboard selection without adding every trait on the spirit", async () => {
  const user = userEvent.setup();
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: [] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  const search = screen.getByRole("combobox", { name: "搜索已吞噬特性" });
  await user.type(search, "jxff");
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

  expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
  expect(callbacks.onAdd).toHaveBeenCalledWith("cold-light");
});

test("shows support status for every selected trait and removes one item at a time", async () => {
  const user = userEvent.setup();
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: ["old-toy", "display-only"] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  const supportedItem = screen.getByRole("listitem", { name: /旧玩具/ });
  const displayOnlyItem = screen.getByRole("listitem", { name: /待验证特性/ });
  expect(supportedItem).toHaveTextContent("已适配");
  expect(displayOnlyItem).toHaveTextContent("仅展示");

  await user.click(screen.getByRole("button", { name: "删除已吞噬特性旧玩具" }));
  expect(callbacks.onRemove).toHaveBeenCalledTimes(1);
  expect(callbacks.onRemove).toHaveBeenCalledWith("old-toy");
});

test("does not add a selected trait twice", async () => {
  const user = userEvent.setup();
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: ["old-toy"] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  await user.type(
    screen.getByRole("combobox", { name: "搜索已吞噬特性" }),
    "旧玩具",
  );
  const option = screen.getByRole("option", { name: /机械方方 · 旧玩具/ });
  expect(option).toHaveAttribute("aria-disabled", "true");
  expect(option).toHaveTextContent("已添加");
  await user.click(option);
  expect(callbacks.onAdd).not.toHaveBeenCalled();
});

test("stops at five swallowed traits and allows adding again after removal", async () => {
  const user = userEvent.setup();
  const fullSide = {
    acquiredTraitIds: [
      "old-toy",
      "display-only",
      "intimidation",
      "embolden",
      "beast-flower",
    ],
  };
  const { rerender } = render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={fullSide}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  expect(screen.getByText("已吞噬 5/5")).toBeVisible();
  const search = screen.getByRole("combobox", { name: "搜索已吞噬特性" });
  await user.type(search, "冷光源");
  const optionAtLimit = screen.getByRole("option", {
    name: /机械方方 · 冷光源/,
  });
  expect(optionAtLimit).toHaveAttribute("aria-disabled", "true");
  expect(optionAtLimit).toHaveTextContent("已达上限");
  await user.click(optionAtLimit);
  expect(callbacks.onAdd).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "删除已吞噬特性旧玩具" }));
  expect(callbacks.onRemove).toHaveBeenCalledWith("old-toy");
  rerender(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{
        ...fullSide,
        acquiredTraitIds: fullSide.acquiredTraitIds.filter(
          (traitId) => traitId !== "old-toy",
        ),
      }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  expect(screen.getByText("已吞噬 4/5")).toBeVisible();
  await user.click(search);
  const optionAfterRemoval = screen.getByRole("option", {
    name: /机械方方 · 冷光源/,
  });
  expect(optionAfterRemoval).toHaveAttribute("aria-disabled", "false");
  await user.click(optionAfterRemoval);
  expect(callbacks.onAdd).toHaveBeenCalledWith("cold-light");
});

test("isolates controls with the same canonical key by trait id", async () => {
  const user = userEvent.setup();
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{
        acquiredTraitIds: ["intimidation", "embolden"],
        acquiredTraitValues: {},
      }}
      sideKey="defender"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  const intimidation = screen.getByRole("checkbox", {
    name: "威慑 · 已打断敌方技能",
  });
  const embolden = screen.getByRole("checkbox", {
    name: "壮胆 · 队伍存在虫系精灵",
  });
  expect(intimidation.id).not.toBe(embolden.id);

  await user.click(intimidation);
  expect(callbacks.onValueChange).toHaveBeenCalledWith(
    "intimidation",
    "trait.traitActivated.8c9e2197",
    true,
  );
  expect(callbacks.onValueChange).not.toHaveBeenCalledWith(
    "embolden",
    expect.anything(),
    expect.anything(),
  );
});

test("reads and writes number controls from the selected trait namespace", () => {
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{
        acquiredTraitIds: ["old-toy"],
        acquiredTraitValues: {
          "old-toy": { "trait.traitStacks.2d041ca6": 3 },
        },
      }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  const input = screen.getByRole("spinbutton", {
    name: "旧玩具 · 己方已使用不同技能系列数",
  });
  expect(input).toHaveValue(3);
  fireEvent.change(input, { target: { value: "5" } });
  expect(callbacks.onValueChange).toHaveBeenCalledWith(
    "old-toy",
    "trait.traitStacks.2d041ca6",
    5,
  );
});

test("writes choice controls with their canonical trait key", () => {
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: ["beast-flower"] }}
      sideKey="defender"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  fireEvent.change(
    screen.getByRole("combobox", { name: "稀兽花宝 · 血脉" }),
    { target: { value: "normal" } },
  );
  expect(callbacks.onValueChange).toHaveBeenCalledWith(
    "beast-flower",
    "trait.bloodlineType.70001bcb",
    "normal",
  );
});

test("does not invent controls for display-only traits", () => {
  render(
    <MoonMemoryTraitEditor
      {...callbacks}
      side={{ acquiredTraitIds: ["display-only"] }}
      sideKey="attacker"
      snapshot={snapshot}
      spirit={snapshot.spirits[0]}
    />,
  );

  const item = screen.getByRole("listitem", { name: /待验证特性/ });
  expect(item).toHaveTextContent("仅展示");
  expect(item.querySelector("input, select")).toBeNull();
});
