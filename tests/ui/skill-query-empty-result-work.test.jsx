import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";

vi.mock("../../src/data/search-index.js", () => ({
  createSpiritSearchIndex: vi.fn(() => ({ search: () => [] })),
}));

const skill = { id: "s", name: "测试技能", type: "普通", category: "physical", description: "效果" };
const season = {
  skills: [skill],
  spirits: [{ id: "p", fullName: "测试精灵", familyId: "p", stage: "一阶" }],
  learnsets: [{ spiritId: "p", skillIds: ["s"], acquisitions: { s: ["默认学习"] } }],
};

test("没有查询条件时不建立家族索引，选中技能后才开始匹配", () => {
  vi.mocked(createSpiritSearchIndex).mockClear();
  render(<BidirectionalQuery season={season} skills={[skill]} spirits={[]} />);
  expect(screen.getByText("添加技能，查找全部可学的精灵。")).toBeInTheDocument();
  expect(createSpiritSearchIndex).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "添加测试技能" }));
  expect(createSpiritSearchIndex).toHaveBeenCalledTimes(1);
});
