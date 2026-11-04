import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";

const skills = ["甲", "乙"].map((name, index) => ({
  id: name, name, type: "草", category: "magical", cost: index + 1, basePower: 60, description: `${name}的效果`, introducedSeason: "S5",
}));
const spirits = [
  { id: "a", fullName: "叶子甲", familyId: "f1", types: ["草"], stage: "二阶" },
  { id: "a2", fullName: "叶子乙", familyId: "f1", types: ["草"], stage: "三阶" },
  { id: "b", fullName: "石头丙", familyId: "f2", types: ["地"], stage: "一阶" },
  { id: "c", fullName: "不会学", familyId: "f3", types: ["水"], stage: "一阶" },
];
const pool = { skillIds: ["甲", "乙"], acquisitions: { 甲: ["技能石"], 乙: ["默认学习 Lv.10"] } };
const season = { skills, spirits, learnsets: [
  { spiritId: "a", ...pool }, { spiritId: "a2", ...pool },
  { spiritId: "b", skillIds: ["甲", "乙"], acquisitions: { 甲: ["默认学习 Lv.5"], 乙: ["血脉技能 · 地血脉 Lv.15"] } },
  { spiritId: "c", skillIds: [], acquisitions: {} },
] };
function add(name) {
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: `添加${name}` }));
}
const ways = (name) => [...screen.getByRole("button", { name: `${name} 查看技能` }).closest("article").querySelectorAll(".sq-learner-ways span")].map(line => line.textContent);
const cards = () => screen.getAllByRole("button", { name: / 查看技能$/ }).map(button => button.getAttribute("aria-label"));

test("右栏仍直接列出可学家族，已选按钮进入整页，卡片写明学法并可按来源筛选", () => {
  const { container } = render(<BidirectionalQuery season={season} skills={skills} spirits={[]} />);
  add("甲");
  expect(container.querySelectorAll(".sq-selected > div")).toHaveLength(1);
  expect(cards()).toEqual(["叶子乙 查看技能", "石头丙 查看技能"]);
  expect(container.querySelector(".sq-learner-ways")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看匹配家族（2）" }));
  expect(container.querySelector(".sq-library")).toBeNull();
  expect(container.querySelector(".sq-selection")).not.toBeVisible();
  expect(screen.getByRole("button", { name: "取消甲" })).toHaveAttribute("aria-pressed", "true");
  expect(ways("叶子乙")).toEqual(["甲技能石"]);
  expect(ways("石头丙")).toEqual(["甲默认学习 Lv.5"]);
  fireEvent.change(screen.getByRole("combobox", { name: "学习途径" }), { target: { value: "技能石" } });
  expect(cards()).toEqual(["叶子乙 查看技能"]);
});

test("组合查询从整页回技能库继续添加，详情返回整页，删空后提示添加技能", () => {
  const { container } = render(<BidirectionalQuery season={season} skills={skills} spirits={[]} />);
  add("甲");
  fireEvent.click(screen.getByRole("button", { name: "查看匹配家族（2）" }));
  fireEvent.click(screen.getByRole("button", { name: "返回选技能 · 1/4" }));
  expect(container.querySelector(".sq-library")).not.toBeNull();
  add("乙");
  expect(container.querySelectorAll(".sq-selected > div")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "查看匹配家族（2）" }));
  expect(ways("叶子乙")).toEqual(["甲技能石", "乙默认学习 Lv.10"]);
  fireEvent.change(screen.getByRole("combobox", { name: "学习途径" }), { target: { value: "default" } });
  expect(screen.queryAllByRole("button", { name: / 查看技能$/ })).toHaveLength(0);
  fireEvent.change(screen.getByRole("combobox", { name: "学习途径" }), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "叶子乙 查看技能" }));
  expect(screen.getByRole("heading", { name: "叶子乙" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回匹配结果" }));
  expect(screen.getByRole("button", { name: "取消乙" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消甲" }));
  fireEvent.click(screen.getByRole("button", { name: "取消乙" }));
  expect(screen.getByText("添加技能，查找全部可学的精灵。")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回选技能 · 0/4" }));
  expect(container.querySelector(".sq-library")).not.toBeNull();
});
