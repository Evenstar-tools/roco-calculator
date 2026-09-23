import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";

const skills = Array.from({ length: 120 }, (_, index) => ({
  id: `skill-${index}`,
  name: `测试技能${String(index).padStart(3, "0")}`,
  description: `第 ${index} 个技能效果`,
  type: "普通",
  category: "physical",
  introducedSeason: "S4",
  cost: 1,
  basePower: 50,
}));
const season = { id: "S4", skills, spirits: [], learnsets: [] };

test("大型技能库首批卡片有上限，筛选数量仍是完整结果", () => {
  const { container } = render(<BidirectionalQuery season={season} skills={skills} spirits={[]} />);
  expect(screen.getByRole("heading", { name: "技能库 120" })).toBeInTheDocument();
  expect(container.querySelectorAll(".sq-suggestions > button").length).toBeLessThanOrEqual(48);
  while (screen.queryByRole("button", { name: /显示更多技能/ })) {
    fireEvent.click(screen.getByRole("button", { name: /显示更多技能/ }));
  }
  expect(container.querySelectorAll(".sq-suggestions > button")).toHaveLength(120);

  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "测试技能119" } });
  expect(screen.getByRole("button", { name: "添加测试技能119" })).toBeInTheDocument();
  expect(container.querySelectorAll(".sq-suggestions > button")).toHaveLength(1);

  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "" } });
  expect(screen.getByRole("heading", { name: "技能库 120" })).toBeInTheDocument();
  expect(container.querySelectorAll(".sq-suggestions > button").length).toBeLessThanOrEqual(48);
});
