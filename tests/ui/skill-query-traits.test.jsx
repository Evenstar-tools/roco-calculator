import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";

vi.mock("../../src/data/trait-icons.js", () => ({ getTraitIconUrl: trait => trait.iconUrl ?? null }));

const season = {
  id: "S3", skills: [], learnsets: [],
  spirits: [{ id: "s1", fullName: "第一形态", familyId: "family", traitIds: ["t1"] },
    { id: "s2", fullName: "第二形态", familyId: "family", traitIds: ["t2", "t3"] }],
  traits: [{ id: "t1", name: "原始特性", description: "本赛季效果", iconUrl: "/assets/traits/original.png" },
    { id: "t2", name: "进化特性", description: "条件满足时触发。\n持续两回合。" },
    { id: "t3", name: "补充特性", description: "" }],
};

test("精灵详情读取所选赛季的特性，切换形态更新图标和完整描述，不拿当前快照覆盖历史", () => {
  render(<BidirectionalQuery season={season} initialSpiritId="s1" spirits={[
    { id: "s1", traitName: "新赛季同名特性", traitDescription: "不应覆盖历史的新版效果" },
  ]} />);
  const traits = screen.getByRole("region", { name: "精灵特性" });
  expect(within(traits).getByRole("heading", { name: "原始特性" })).toBeInTheDocument();
  expect(within(traits).getByText("本赛季效果")).toBeInTheDocument();
  expect(screen.queryByText("不应覆盖历史的新版效果")).not.toBeInTheDocument();
  expect(traits.querySelector("img")).toHaveAttribute("src", "/assets/traits/original.png");
  fireEvent.error(traits.querySelector("img"));
  expect(traits.querySelector("img")).toBeNull();
  expect(within(traits).getByText("本赛季效果")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("精灵形态"), { target: { value: "s2" } });
  expect(within(traits).getByRole("heading", { name: "进化特性" })).toBeInTheDocument();
  expect(within(traits).getByText(/持续两回合/)).toHaveTextContent("条件满足时触发。 持续两回合。");
  expect(within(traits).getByText("特性描述待确认")).toBeInTheDocument();
  expect(within(traits).queryByText("原始特性")).not.toBeInTheDocument();
});

test("没有特性资料时不套用其它精灵特性或伪造图标", () => {
  render(<BidirectionalQuery season={{ ...season, traits: [] }} initialSpiritId="s1" />);
  expect(screen.queryByRole("region", { name: "精灵特性" })).not.toBeInTheDocument();
});
