import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { applyS5SeasonAnnouncement, S5_SEASON_ANNOUNCEMENT } from "../../src/features/s5-preview/season-announcement.js";

const catalogState = vi.hoisted(() => ({ value: null }));
vi.mock("../../src/features/skill-query/load-catalog.js", () => ({
  getCachedCatalog: () => catalogState.value,
  loadSkillCatalog: () => Promise.resolve(catalogState.value),
}));
const snapshot = { seasonAnnouncement: { id: S5_SEASON_ANNOUNCEMENT.patch.id } };
beforeEach(() => {
  catalogState.value = unpackCatalog(JSON.parse(readFileSync("public/data/skill-query/catalog.json", "utf8")));
});
function setup(currentSnapshot = snapshot) {
  const s4 = catalogState.value.seasons.find(({ id }) => id === "S4");
  return render(<SkillQueryPanel onClose={vi.fn()} snapshot={currentSnapshot} skills={s4.skills} spirits={s4.spirits} />);
}

test("公告快照默认查 S5，参数提示可查看 before/after，切回 S4/S3 恢复历史资料", () => {
  setup();
  expect(screen.getByLabelText("查询赛季")).toHaveValue("S5");
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "蹦跶" } });
  const adjusted = screen.getByRole("button", { name: "添加蹦跶" });
  expect(adjusted).toHaveTextContent("威力 95");
  fireEvent.click(adjusted);
  fireEvent.click(screen.getByRole("button", { name: "查看蹦跶本期改动" }));
  expect(within(screen.getByRole("tooltip", { name: "蹦跶本期改动" })).getByText("110 → 95")).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "关闭改动详情" }).at(-1));
  fireEvent.change(screen.getByLabelText("查询赛季"), { target: { value: "S4" } });
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "蹦跶" } });
  expect(screen.getByRole("button", { name: "添加蹦跶" })).toHaveTextContent("威力 110");
  expect(screen.queryByRole("button", { name: "查看蹦跶本期改动" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("查询赛季"), { target: { value: "S3" } });
  expect(screen.getByLabelText("查询赛季")).toHaveValue("S3");
  expect(screen.getByRole("button", { name: "找可学精灵" })).toBeInTheDocument();
  expect(catalogState.value.currentSeason).toBe("S4");
});

test("10 项旧技能改动单独汇总，公告不把这些技能列为 S5 新技能", () => {
  const { container } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "赛季新技能" }));
  expect(screen.getByText("本次公告未公布 S5 新增技能。")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "赛季技能调整" }));
  expect(container.querySelectorAll(".skill-query__adjustments article")).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "查看破防本期改动" }));
  const change = within(screen.getByRole("tooltip", { name: "破防本期改动" }));
  expect(change.getByText("2 → 1")).toBeVisible();
  expect(change.getByText(/双防-70%/)).toBeVisible();
  expect(change.getByText("敌方获得双防-80%，应对防御：额外使被应对技能冷却2回合。")).toBeVisible();
});

test("学习更新显示新增与血脉撤销，跳转后的 S5 查询不再列出已撤销技能", () => {
  const { container } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "赛季学习更新" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "深渊蛙" } });
  expect(screen.getByText("调整前：冷风")).toBeVisible();
  expect(screen.getByText("调整后：冰爪")).toBeVisible();
  expect(screen.getByText("调整后：气沉丹田")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "深渊蛙", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "血脉", exact: true }));
  const skills = within(container.querySelector(".sq-skill-table"));
  expect(skills.queryByText("冷风")).not.toBeInTheDocument();
  expect(skills.getByText("冰爪")).toBeVisible();
  fireEvent.change(screen.getByLabelText("查询赛季"), { target: { value: "S4" } });
  fireEvent.click(screen.getByRole("button", { name: "查精灵技能" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "深渊蛙" } });
  fireEvent.click(screen.getByRole("button", { name: "深渊蛙 查看技能" }));
  fireEvent.click(screen.getByRole("button", { name: "血脉", exact: true }));
  expect(within(container.querySelector(".sq-skill-table")).getByText("冷风")).toBeVisible();
});

test("血脉替换保留旧技能的独立技能石途径，查询来源与说明一致", () => {
  const s4 = catalogState.value.seasons.find(({ id }) => id === "S4");
  const spirit = s4.spirits.find(({ fullName }) => fullName === "森巨人");
  const oldSkill = s4.skills.find(({ name }) => name === "贯手");
  // 明确注入第二来源，覆盖单一血脉基线无法检出的误删回归。
  s4.learnsets.find(({ spiritId }) => spiritId === spirit.id).acquisitions[oldSkill.id].push("技能石");
  const { container } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "赛季学习更新" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "森巨人" } });
  expect(screen.getByText("原血脉途径已替换；贯手的其他学习途径保留")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "森巨人", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "血脉", exact: true }));
  expect(within(container.querySelector(".sq-skill-table")).queryByText("贯手")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "技能石", exact: true }));
  expect(within(container.querySelector(".sq-skill-table")).getByText("贯手")).toBeVisible();
});

test("S5 普通查询仍可读取烈火守护和撕咬的 S4 提示，汇总页不重报旧记录", () => {
  const full = applyS5SeasonAnnouncement(JSON.parse(readFileSync("data/snapshots/current.json", "utf8")));
  const { container } = setup(full);
  fireEvent.click(screen.getByRole("button", { name: "查精灵技能" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "烈火守护" } });
  fireEvent.click(screen.getByRole("button", { name: "烈火守护 查看技能" }));
  fireEvent.click(screen.getByRole("button", { name: "查看烈火守护本期改动" }));
  const fire = within(screen.getByRole("tooltip", { name: "烈火守护本期改动" }));
  expect(fire.getByText("2026.09.10")).toBeVisible();
  expect(fire.getByText("117 → 79")).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "关闭改动详情" }).at(-1));
  fireEvent.click(screen.getByRole("button", { name: "返回匹配结果" }));
  fireEvent.click(screen.getByRole("button", { name: "找可学精灵" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "撕咬" } });
  fireEvent.click(screen.getByRole("button", { name: "添加撕咬" }));
  fireEvent.click(screen.getByRole("button", { name: "查看撕咬本期改动" }));
  expect(within(screen.getByRole("tooltip", { name: "撕咬本期改动" })).getByText("30 → 20")).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "关闭改动详情" }).at(-1));
  fireEvent.click(screen.getByRole("tab", { name: "赛季技能调整" }));
  expect(container.querySelectorAll(".skill-query__adjustments article")).toHaveLength(10);
  expect(within(container.querySelector(".skill-query__adjustments")).queryByRole("button", { name: "撕咬", exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "赛季学习更新" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "卡拉波斯" } });
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(0);
});

test("同技能的 S5 与历史补丁在普通查询可读，S5 调整汇总只展示本轮组", () => {
  const full = applyS5SeasonAnnouncement(JSON.parse(readFileSync("data/snapshots/current.json", "utf8")));
  const skill = full.skills.find(({ name }) => name === "蹦跶");
  // 当前真实 S4/S5 技能调整无交集；显式合成前次补丁，覆盖未来同技能连续调整。
  skill.changeInfo = { ...skill.changeInfo, history: [{
    entityName: "蹦跶", patch: { id: "fixture-s4-prior", label: "S4 测试补丁", date: "2026.09.10" },
    items: [{ kind: "stat", label: "基础威力", before: 120, after: 110 }],
  }] };
  const { container } = setup(full);
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "蹦跶" } });
  fireEvent.click(screen.getByRole("button", { name: "添加蹦跶" }));
  fireEvent.click(screen.getByRole("button", { name: "查看蹦跶本期改动" }));
  const all = within(screen.getByRole("tooltip", { name: "蹦跶本期改动" }));
  expect(all.getByText("110 → 95")).toBeVisible();
  expect(all.getByText("120 → 110")).toBeVisible();
  expect(all.getByText("2026.09.10")).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "关闭改动详情" }).at(-1));
  fireEvent.click(screen.getByRole("tab", { name: "赛季技能调整" }));
  expect(container.querySelectorAll(".skill-query__adjustments article")).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "查看蹦跶本期改动" }));
  const current = within(screen.getByRole("tooltip", { name: "蹦跶本期改动" }));
  expect(current.getByText("110 → 95")).toBeVisible();
  expect(current.queryByText("120 → 110")).not.toBeInTheDocument();
  expect(current.queryByText("S4 测试补丁")).not.toBeInTheDocument();
});
