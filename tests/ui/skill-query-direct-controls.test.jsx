import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";

const skills = ["甲", "乙", "丙", "丁", "戊"].map((name, i) => ({
  id: name, name, type: "普通", category: "physical", cost: i, basePower: 50,
  description: `${name}的效果`, introducedSeason: "S4",
}));
const season = { skills, spirits: [{ id: "s", fullName: "测试精灵", familyId: "f" }],
  learnsets: [{ spiritId: "s", skillIds: skills.map(s => s.id), acquisitions: Object.fromEntries(skills.map(s => [s.id, ["技能石"]])) }] };
function setup() { return render(<BidirectionalQuery season={season} skills={skills} spirits={[]} />); }
function add(name) {
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: `添加${name}` }));
}

test("筛选常驻、连续四技能无需切页、删除中间条件后可补充", () => {
  const { container } = setup();
  expect(screen.getByLabelText("技能属性").closest("details")).toBeNull();
  for (const name of ["甲", "乙", "丙", "丁"]) add(name);
  expect(screen.getByText(/已选满 4 个技能/)).toBeInTheDocument();
  expect(screen.getByLabelText("搜索技能或精灵")).toHaveValue("丁");
  expect(screen.queryByRole("button", { name: "编辑条件" })).not.toBeInTheDocument();
  expect(container.querySelector(".sq-workspace--results")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "移除乙" }));
  add("戊");
  expect([...container.querySelectorAll(".sq-selected strong")].map(el => el.textContent)).toEqual(["甲", "丙", "丁", "戊"]);
  fireEvent.change(screen.getByLabelText("技能所属赛季"), { target: { value: "S4" } });
  fireEvent.click(screen.getByRole("button", { name: "清除技能筛选" }));
  expect(container.querySelectorAll(".sq-selected strong")).toHaveLength(4);
});

test("精灵技能筛选和学习精灵空结果可清除，不丢失当前对象或已选技能", () => {
  const { container } = setup(); add("甲");
  fireEvent.change(screen.getByLabelText("筛选学习精灵"), { target: { value: "无结果" } });
  expect(screen.getByText(/没有符合条件的精灵/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清除学习精灵筛选" }));
  fireEvent.click(screen.getByRole("button", { name: "测试精灵 查看技能" }));
  expect(screen.getByLabelText("筛选精灵技能").closest("details")).toBeNull();
  fireEvent.change(screen.getByLabelText("筛选精灵技能"), { target: { value: "无结果" } });
  expect(screen.getByText(/没有符合筛选条件的技能/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清除精灵技能筛选" }));
  expect(screen.getByRole("heading", { name: "测试精灵" })).toBeInTheDocument();
  expect(container.querySelectorAll(".sq-skill-table article")).toHaveLength(5);
  expect(container.querySelectorAll(".sq-selected strong")).toHaveLength(1);
});

test("摘要和反查无需展开，往返恢复筛选及桌面和手机滚动位置", () => {
  const { container } = setup(); add("甲");
  const workspace = container.querySelector(".sq-workspace"), results = container.querySelector(".sq-results");
  workspace.scrollTop = 200; results.scrollTop = 120;
  fireEvent.click(screen.getByRole("button", { name: "测试精灵 查看技能" }));
  expect(workspace).toHaveClass("sq-workspace--detail");
  expect(workspace.scrollTop).toBe(0);
  fireEvent.change(screen.getByLabelText("筛选精灵技能"), { target: { value: "乙" } });
  const table = within(container.querySelector(".sq-skill-table"));
  expect(table.getByText("乙的效果")).toBeInTheDocument();
  expect(table.getByRole("button", { name: "查看乙详情" })).toHaveAttribute("aria-expanded", "false");
  workspace.scrollTop = 350; results.scrollTop = 240;
  fireEvent.click(table.getByRole("button", { name: "查乙的可学精灵" }));
  fireEvent.click(screen.getByRole("button", { name: "测试精灵 查看技能" }));
  fireEvent.click(screen.getByRole("button", { name: "返回匹配结果" }));
  fireEvent.click(screen.getByRole("button", { name: "返回测试精灵技能" }));
  expect(workspace.scrollTop).toBe(350); expect(results.scrollTop).toBe(240);
  expect(screen.getByLabelText("筛选精灵技能")).toHaveValue("乙");
  fireEvent.click(screen.getByRole("button", { name: "返回匹配结果" }));
  expect(workspace.scrollTop).toBe(200); expect(results.scrollTop).toBe(120);
  expect(container.querySelector("button button")).toBeNull();
});

test("卡片原位选中和取消，选满不替换，清空条件不清搜索", () => {
  const { container } = setup();
  const list = container.querySelector(".sq-suggestions");
  const first = list.firstElementChild;
  fireEvent.click(first);
  expect(list.firstElementChild).toBe(first);
  expect(first).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(first);
  expect(first).toHaveAttribute("aria-pressed", "false");
  for (const name of ["甲", "乙", "丙", "丁"]) add(name);
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "戊" } });
  const fifth = screen.getByRole("button", { name: "添加戊" });
  expect(fifth).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(fifth);
  expect(container.querySelectorAll(".sq-selected strong")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "清空", exact: true }));
  expect(screen.getByLabelText("搜索技能或精灵")).toHaveValue("戊");
  expect(fifth).toHaveAttribute("aria-disabled", "false");
});

test("隐藏只移除效果文字，保留数值和效果检索，详情及返回共用开关", () => {
  const { container } = setup();
  fireEvent.click(screen.getByRole("button", { name: "隐藏效果说明" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "甲的效果" } });
  const card = screen.getByRole("button", { name: "添加甲" });
  expect(card).toHaveTextContent("威力 50");
  expect(card).toHaveTextContent("能耗 0");
  expect(container.querySelector(".sq-card-description")).toBeNull();
  fireEvent.click(card);
  fireEvent.click(screen.getByRole("button", { name: "测试精灵 查看技能" }));
  expect(container.querySelectorAll(".sq-skill-table article")).toHaveLength(5);
  expect(container.querySelector(".sq-effect")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "显示效果说明" }));
  expect(screen.getByText("甲的效果")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回匹配结果" }));
  expect(screen.getByRole("button", { name: "隐藏效果说明" })).toBeInTheDocument();
  expect(container.querySelector(".sq-card-description")).toHaveTextContent("甲的效果");
});
