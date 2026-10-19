import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";
import SkillQueryEffect from "../../src/features/skill-query/SkillQueryEffect.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages, translateUi } from "../../src/i18n/messages.js";

const skills = ["中文技能甲", "中文技能乙", "中文技能丙", "中文技能丁", "中文技能戊"].map((name, index) => ({
  id: `cn-placeholder:skill-${index}`, name, type: index === 1 ? "水" : "普通", category: index === 1 ? "magical" : "physical",
  description: `${name}的中文参考描述`, basePower: 9876, cost: 6543, introducedSeason: "S4",
}));
const spirits = [
  { id: "cn-placeholder:first", fullName: "中文精灵甲", types: ["普通"], familyId: "first", asset: { localUrl: "/assets/spirits/bound-art.webp" }, reference: { sourceId: "first-source" } },
  { id: "cn-placeholder:second", fullName: "中文精灵乙", types: ["水"], familyId: "second", reference: { sourceId: "second-source" } },
];
// Inject CN fields deliberately: placeholder rendering must hide them even if a caller supplies them.
const season = { skills, spirits, learnsets: [
  { spiritId: spirits[0].id, skillIds: skills.map(({ id }) => id), acquisitions: Object.fromEntries(skills.map(({ id }) => [id, ["Lv. 99", "技能石"]])) },
  { spiritId: spirits[1].id, skillIds: [skills[0].id] },
] };
const wrap = (locale, content) => <LocaleProvider locale={locale}>{content}</LocaleProvider>;
const tr = (locale) => (source, values) => translateUi(locale, source, values);
beforeEach(() => clearMissingUiMessages());

test.each(["zh-CN", "en", "ja"])("%s placeholder skill intersection, limits, empty filters and portrait bindings work without unverified metadata", (locale) => {
  const t = tr(locale);
  const { container } = render(wrap(locale, <BidirectionalQuery placeholder season={season} skills={skills} spirits={spirits} />));
  expect(screen.queryByLabelText(t("技能所属赛季"))).not.toBeInTheDocument();
  const add = (index) => fireEvent.click(screen.getByRole("button", { name: t("添加{name}", { name: skills[index].name }) }));
  add(0);
  expect(screen.getByText(t("{count} 个匹配家族", { count: 2 }))).toBeInTheDocument();
  const first = screen.getByRole("button", { name: t("{name} 查看技能", { name: spirits[0].fullName }) });
  expect(first.querySelector("img.sq-portrait")).toHaveAttribute("src", "/assets/spirits/bound-art.webp");
  const second = screen.getByRole("button", { name: t("{name} 查看技能", { name: spirits[1].fullName }) });
  expect(second.querySelector("img.sq-portrait")).toHaveAttribute("src", expect.stringContaining("/assets/spirits/second-source.png"));
  expect(container.querySelector('img[src*="cn-placeholder:"]')).not.toBeInTheDocument();
  add(1);
  expect(screen.getByText(t("{count} 个匹配家族", { count: 1 }))).toBeInTheDocument();
  expect(screen.queryByLabelText(t("学习途径"))).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(t("筛选学习精灵")), { target: { value: "不匹配" } });
  expect(screen.getByText(t("没有符合条件的精灵，可减少技能条件或清除筛选。"))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("清除学习精灵筛选") }));
  expect(screen.getByText(t("{count} 个匹配家族", { count: 1 }))).toBeInTheDocument();
  add(2); add(3);
  expect(screen.getByText(t("已选满 4 个技能，请先移除一个。"))).toBeInTheDocument();
  const fifth = screen.getByRole("button", { name: t("添加{name}", { name: skills[4].name }) });
  fireEvent.click(fifth);
  expect(fifth).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: t("移除{name}", { name: skills[2].name }) }));
  fireEvent.click(fifth);
  expect(fifth).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelector(".sq-card-values, .sq-values, .sq-method, .sq-sources")).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent(/9876|6543|Lv\. 99/);
  expect(getMissingUiMessages()).toEqual([]);
});

test.each(["zh-CN", "en", "ja"])("%s placeholder Jini-to-skill filters and reverse lookup return to the same state", (locale) => {
  const t = tr(locale);
  const { container } = render(wrap(locale, <BidirectionalQuery placeholder season={season} skills={skills} spirits={spirits}
    gains={[{ spiritId: spirits[0].id, skillIds: [skills[1].id] }]} />));
  fireEvent.click(screen.getByRole("button", { name: t("查精灵技能") }));
  fireEvent.change(screen.getByLabelText(t("搜索技能或精灵")), { target: { value: spirits[0].fullName } });
  fireEvent.click(screen.getByRole("button", { name: t("{name} 查看技能", { name: spirits[0].fullName }) }));
  expect(screen.getByRole("heading", { name: spirits[0].fullName })).toBeInTheDocument();
  expect(screen.queryByLabelText(t("技能学习来源"))).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(t("精灵技能属性")), { target: { value: "水" } });
  fireEvent.change(screen.getByLabelText(t("精灵技能种类")), { target: { value: "magical" } });
  fireEvent.change(screen.getByLabelText(t("筛选精灵技能")), { target: { value: "不存在" } });
  expect(screen.getByText(t("没有符合筛选条件的技能，可清除筛选。"))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("清除精灵技能筛选") }));
  fireEvent.change(screen.getByLabelText(t("精灵技能属性")), { target: { value: "水" } });
  fireEvent.change(screen.getByLabelText(t("筛选精灵技能")), { target: { value: skills[1].name } });
  const table = within(container.querySelector(".sq-skill-table"));
  expect(table.getByText(skills[1].description)).toBeVisible();
  expect(container.querySelector(".sq-card-values, .sq-values, .sq-method, .sq-sources, em")).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent(/9876|6543|Lv\. 99|途径待补充/);
  fireEvent.click(table.getByRole("button", { name: t("查{name}的可学精灵", { name: skills[1].name }) }));
  expect(screen.getByText(t("{count} 个匹配家族", { count: 1 }))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("返回{name}技能", { name: spirits[0].fullName }) }));
  expect(screen.getByLabelText(t("筛选精灵技能"))).toHaveValue(skills[1].name);
  expect(screen.getByLabelText(t("精灵技能属性"))).toHaveValue("水");
  fireEvent.click(screen.getByRole("button", { name: t("隐藏效果说明") }));
  expect(container.querySelector(".sq-effect")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("显示效果说明") }));
  expect(screen.getByText(skills[1].description)).toBeVisible();
  expect(getMissingUiMessages()).toEqual([]);
});

test("placeholder expanded description keeps Chinese text without CN acquisition or source details", () => {
  const skill = { ...skills[0], methods: ["Lv. 99"], detailUrl: "https://wiki.biligame.com/test" };
  render(wrap("en", <SkillQueryEffect placeholder skill={skill} expanded onToggle={vi.fn()} />));
  expect(screen.getByText(skill.description)).toBeVisible();
  expect(screen.queryByText("Lv. 99")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(getMissingUiMessages()).toEqual([]);
});
