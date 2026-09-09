import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";

vi.mock("../../src/features/skill-query/load-catalog.js", () => {
  const data = { currentSeason: "S4", seasons: [{
    id: "S4",
    skills: [{ id: "scratch", name: "抓挠", type: "普通", category: "physical", introducedSeason: "S1", description: "造成伤害", cost: 0, basePower: 35 }],
    spirits: [{ id: "cat", fullName: "喵喵", familyId: "cat", stage: "一阶" }],
    learnsets: [{ spiritId: "cat", skillIds: ["scratch"], acquisitions: { scratch: ["默认学习"] } }],
  }] };
  return { getCachedCatalog: () => data, loadSkillCatalog: () => Promise.resolve(data) };
});

test("查询筛选归属列表且返回时保持四项条件，学习筛选归属详情", async () => {
  render(<SkillQueryPanel onClose={vi.fn()} />);
  const search = screen.getByLabelText("搜索技能或精灵");
  fireEvent.change(search, { target: { value: "抓挠" } });
  fireEvent.change(screen.getByLabelText("技能属性"), { target: { value: "普通" } });
  fireEvent.change(screen.getByLabelText("技能种类"), { target: { value: "physical" } });
  fireEvent.change(screen.getByLabelText("技能所属赛季"), { target: { value: "S1" } });
  fireEvent.click(screen.getByRole("button", { name: "抓挠 普通 · 物攻" }));
  const learning = await screen.findByLabelText("筛选学习精灵");
  expect(search.closest(".skill-query__browser")).not.toBeNull();
  expect(learning.closest(".skill-query__learning-heading")).not.toBeNull();
  // jsdom 不切换媒体断点；这里只验证返回处理，手机可见性由 E2E 覆盖。
  fireEvent.click(screen.getByText("← 返回技能列表"));
  expect(search).toHaveValue("抓挠");
  expect(screen.getByLabelText("技能属性")).toHaveValue("普通");
  expect(screen.getByLabelText("技能种类")).toHaveValue("physical");
  expect(screen.getByLabelText("技能所属赛季")).toHaveValue("S1");
  fireEvent.click(screen.getByRole("tab", { name: "老精灵新学" }));
  expect(within(screen.getByRole("dialog")).getAllByLabelText("搜索技能或精灵")).toHaveLength(1);
  expect(screen.getByLabelText("搜索技能或精灵").closest(".skill-query__browser")).toBeNull();
});
