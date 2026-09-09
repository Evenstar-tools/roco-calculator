import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";

vi.mock("../../src/features/skill-query/load-catalog.js", () => {
  const data = { currentSeason: "S4", seasons: [{
    id: "S4",
    skills: [{ id: "scratch", name: "抓挠", type: "普通", category: "physical", introducedSeason: "S1", description: "造成伤害", cost: 0, basePower: 35 }, { id: "guard", name: "防御", type: "普通", category: "defense", cost: 1, basePower: null, description: "减少伤害" }],
    spirits: [{ id: "cat", fullName: "喵喵", familyId: "cat", stage: "一阶" }],
    learnsets: [{ spiritId: "cat", skillIds: ["scratch", "guard"], acquisitions: { scratch: ["默认学习", "技能石"], guard: ["等级待确认"] } }],
  }] };
  return { getCachedCatalog: () => data, loadSkillCatalog: () => Promise.resolve(data) };
});

test("查询条件保持，家族进入完整学习面，技能反查可返回原详情", async () => {
  render(<SkillQueryPanel onClose={vi.fn()} />);
  const search = screen.getByLabelText("搜索技能或精灵");
  fireEvent.change(search, { target: { value: "抓挠" } });
  fireEvent.change(screen.getByLabelText("技能属性"), { target: { value: "普通" } });
  fireEvent.change(screen.getByLabelText("技能种类"), { target: { value: "physical" } });
  fireEvent.change(screen.getByLabelText("技能所属赛季"), { target: { value: "S1" } });
  fireEvent.click(screen.getByRole("button", { name: "添加抓挠" }));
  const learning = await screen.findByLabelText("筛选学习精灵");
  expect(search.closest(".sq-query")).not.toBeNull();
  expect(learning.closest(".sq-results")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "喵喵 查看技能" }));
  expect(screen.getByRole("button", { name: "查看防御详情" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看防御详情" }));
  expect(screen.getByText("减少伤害")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查可学精灵", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "返回喵喵技能" }));
  expect(screen.getByRole("button", { name: "查看防御详情" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "返回匹配结果" }));
  expect(search).toHaveValue("抓挠");
  expect(screen.getByLabelText("技能属性")).toHaveValue("普通");
  expect(screen.getByLabelText("技能种类")).toHaveValue("physical");
  expect(screen.getByLabelText("技能所属赛季")).toHaveValue("S1");
  fireEvent.click(screen.getByRole("tab", { name: "老精灵新学" }));
  expect(within(screen.getByRole("dialog")).getAllByLabelText("搜索技能或精灵")).toHaveLength(1);
  expect(screen.getByLabelText("搜索技能或精灵").closest(".sq-query")).toBeNull();
});

test("精灵别名查询、来源筛选与空态不伪造学习条件", () => {
  render(<SkillQueryPanel onClose={vi.fn()} spirits={[{ id: "cat", aliases: ["猫猫"] }]} />);
  fireEvent.click(screen.getByRole("button", { name: "查精灵技能" }));
  expect(screen.queryByRole("button", { name: "喵喵 查看技能" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "猫猫" } });
  fireEvent.click(screen.getByRole("button", { name: "喵喵 查看技能" }));
  fireEvent.click(screen.getByRole("button", { name: "默认", exact: true }));
  expect(screen.queryByRole("button", { name: "查看防御详情" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "血脉", exact: true }));
  expect(screen.getByText(/没有符合筛选条件的技能/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "全部来源" }));
  expect(screen.getByText("等级待确认")).toBeInTheDocument();
});
