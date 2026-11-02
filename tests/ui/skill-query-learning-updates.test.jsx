import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";

const fixture = vi.hoisted(() => {
  const common = { id: "common", name: "防御", type: "普通", category: "defense" };
  const grass = { id: "grass", name: "外附传播", type: "草", category: "magical", introducedSeason: "S4" };
  const fire = { id: "fire", name: "火焰冲击", type: "火", category: "physical", introducedSeason: "S4" };
  const poison = { id: "poison", name: "投毒", type: "毒", category: "physical", introducedSeason: "S4" };
  const spirits = [
    ...["种子", "草", "花", "果"].map((name, index) => ({ id: `sea-${index}`, fullName: `蹦蹦${name}（海神球形态）`,
      familyId: "sea", types: ["草"], dexNo: 20 + index, stage: ["一阶", "二阶", "三阶", "首领"][index],
      asset: { localUrl: "/assets/spirits/spirit_0123456789abcdef.png" } })),
    { id: "fire-one", fullName: "火花", familyId: "fire-family", types: ["火"], dexNo: 1, stage: "一阶",
      asset: { localUrl: "/assets/spirits/spirit_abcdef0123456789.png" } },
    { id: "fire-two", fullName: "火焰", familyId: "fire-family", types: ["火"], dexNo: 2, stage: "二阶" },
  ];
  const data = { currentSeason: "S4", seasons: [
    { id: "S3", skills: [common], spirits, learnsets: spirits.map(spirit => ({ spiritId: spirit.id, skillIds: ["common"] })) },
    { id: "S4", skills: [common, grass, fire, poison], spirits: spirits.map(spirit => ({ ...spirit,
      ...(spirit.id.startsWith("sea-") ? { changeInfo: { patch: { id: "s4-learning" }, items: [
        { kind: "learnset", label: "新增可学习技能", after: "外附传播", note: "技能书" },
        { kind: "learnset", label: "新增可学习技能", after: "投毒", note: "技能书" },
      ] } } : {}),
    })), learnsets: spirits.map(spirit => ({ spiritId: spirit.id,
      skillIds: ["common", ...(spirit.id.startsWith("sea-") ? ["grass", "poison"] : spirit.id === "fire-one" ? ["fire"] : [])] })) },
  ] };
  return { data, spirits };
});
vi.mock("../../src/features/skill-query/load-catalog.js", () => ({
  getCachedCatalog: () => fixture.data, loadSkillCatalog: () => Promise.resolve(fixture.data),
}));

test("learning updates show portraits, one family row and a separate branch in dex order", () => {
  const { container } = render(<SkillQueryPanel onClose={vi.fn()} spirits={fixture.spirits} />);
  fireEvent.click(screen.getByRole("tab", { name: "赛季学习更新" }));
  const rows = container.querySelectorAll(".skill-query__gains article");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("火花");
  expect(rows[0]).not.toHaveTextContent("家族");
  expect(rows[1]).toHaveTextContent("家族");
  expect(rows[1]).toHaveTextContent("蹦蹦花（海神球形态）");
  expect(rows[1].querySelector(".learning-update__portrait")).toHaveAttribute("src", fixture.spirits[0].asset.localUrl);
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "蹦蹦果" } });
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(1);
  expect(screen.getByText("家族", { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "蹦蹦花（海神球形态）", exact: true }));
  expect(screen.getByRole("heading", { name: "蹦蹦花（海神球形态）" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回赛季查询" }));
  expect(screen.getByLabelText("搜索技能或精灵")).toHaveValue("蹦蹦果");
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(1);
});

test("learning update filters and reset preserve the complete family scope", () => {
  const { container } = render(<SkillQueryPanel onClose={vi.fn()} spirits={fixture.spirits} />);
  fireEvent.click(screen.getByRole("tab", { name: "赛季学习更新" }));
  fireEvent.change(screen.getByRole("combobox", { name: "技能属性" }), { target: { value: "火" } });
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(1);
  expect(container.querySelector(".skill-query__gains article")).toHaveTextContent("火花");
  fireEvent.change(screen.getByRole("combobox", { name: "技能种类" }), { target: { value: "magical" } });
  expect(within(screen.getByRole("dialog")).getByText("没有符合条件的学习更新。" )).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(2);
});

test("skill search intersects type filters without matching hidden addition records", () => {
  const { container } = render(<SkillQueryPanel onClose={vi.fn()} spirits={fixture.spirits} />);
  fireEvent.click(screen.getByRole("tab", { name: "赛季学习更新" }));
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "投毒" } });
  fireEvent.change(screen.getByRole("combobox", { name: "技能属性" }), { target: { value: "草" } });
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("搜索技能或精灵"), { target: { value: "海神球" } });
  expect(container.querySelectorAll(".skill-query__gains article")).toHaveLength(1);
  expect(container.querySelector(".skill-query__gains article")).toHaveTextContent("外附传播");
  expect(container.querySelector(".skill-query__gains article")).not.toHaveTextContent("投毒");
  expect(container.querySelector(".skill-query__gains article")).not.toHaveTextContent("新增可学习技能");
});
