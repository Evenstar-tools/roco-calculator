import { readFileSync } from "node:fs";
import { useState } from "react";
import { fireEvent, render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { translateUi } from "../../src/i18n/messages.js";
import { localizeToolText } from "../../src/i18n/useToolLocale.js";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { localizeGlobalSkill } from "../../src/runtime/global-entity-localization.js";
import TypeQueryPanel from "../../src/features/type-query/TypeQueryPanel.jsx";
import TransmissionPanel from "../../src/features/transmission/TransmissionPanel.jsx";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";
import { TeamMemberEditor } from "../../src/components/TeamMemberEditor.jsx";
import { createTeamMember } from "../../src/state/team-presets.js";
import { DeerWorkspace } from "../../src/features/deer/DeerPage.jsx";

const snapshot = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
const wrap = (locale, child) => <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{child}</LocaleProvider></RuntimeProvider>;
const chinese = (node) => [...new Set(node.textContent.match(/[\u3400-\u9fff]+/g) ?? [])];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function TypeHarness() { const [types, setTypes] = useState(["水", "龙"]); return <TypeQueryPanel typeChart={snapshot.typeChart} spirits={snapshot.spirits} selectedTypes={types} onTypesChange={setTypes} onClose={vi.fn()} />; }

test("Global type query uses official labels and retains selected class keys across languages", () => {
 const { container, rerender } = render(wrap("en", <TypeHarness />));
 fireEvent.click(container.querySelector(".type-query__column .type-query__chip"));
 expect(chinese(container).join(" | ")).toBe("");
 expect(within(screen.getByRole("group", {name:"Choose classes"})).getByRole("button", {name:"Water"})).toHaveAttribute("aria-pressed","true");
 rerender(wrap("ja", <TypeHarness />));
 expect(within(screen.getByRole("group", {name:"属性を選択"})).getAllByRole("button").filter(node=>node.getAttribute("aria-pressed")==="true")).toHaveLength(2);
});

test("Global Drive keeps canonical mechanisms while localizing skills and saved traces", () => {
 const names = ["啮合传递", "地刺", "轮班", "主轴"];
 const skills = names.map(name=>snapshot.skills.find(entry=>entry.name===name));
 const sides = { attacker:{skills:{four:skills.map(skill=>skill.id)}} };
 const before = skills.map(skill=>skill.name);
 const {container,rerender}=render(wrap("en",<TransmissionPanel snapshot={snapshot} sides={sides} onClose={vi.fn()}/>));
 fireEvent.click(screen.getByRole("button",{name:"Load attacker's skills"}));
 expect(container.querySelector(".transmission-config label")).toHaveTextContent(/^Slot 1 ·/);
 fireEvent.click(screen.getByRole("button",{name:"Start",exact:true}));
 const order=[...container.querySelectorAll('.transmission-slots strong')].map(node=>node.textContent);
 expect(order).toHaveLength(4);
 expect(order).toContain(localizeGlobalSkill(skills[2],"en").name);
 expect(chinese(container).join(" | ")).toBe("");
 fireEvent.click(screen.getByRole("button", { name: "Simulate next turn" }));
 expect(container.querySelector(".transmission-history")).toHaveTextContent("Turn 1 · Wait");
 rerender(wrap("ja",<TransmissionPanel snapshot={snapshot} sides={sides} onClose={vi.fn()}/>));
 expect(container.querySelectorAll('.transmission-history > li')).toHaveLength(3);
 expect([...container.querySelectorAll('.transmission-slots strong')].map(node=>node.textContent)).toContain(localizeGlobalSkill(skills[2],"ja").name);
 expect(skills.map(skill=>skill.name)).toEqual(before);
});

test.each(["durability","speed"])("Global %s rankings render English with real S3 data",kind=>{
 const reduced={...snapshot,spirits:snapshot.spirits.filter(spirit=>["魔力猫","音速犬","波普鹿"].includes(spirit.fullName))};
 const {container}=render(wrap("en",<RankingsPanel kind={kind} snapshot={reduced} onClose={vi.fn()}/>));
 expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
 expect(chinese(container).join(" | "), [...container.querySelectorAll("*")].filter(n=>n.children.length===0 && /[\u3400-\u9fff]/.test(n.textContent)).map(n=>n.outerHTML).join("\n")).toBe("");
});

test.each(["zh-CN", "en", "ja"])("Global %s passive builds retain base rows, localize details and support opting out", locale => {
 const cases = [["蹦床松鼠", "10能量"], ["卷胡巨獭", "总能耗＜4"], ["古卷匣魔像", "入场敌方魔力1"], ["上岸蛙", "非周末"]];
 const reduced = { ...snapshot, spirits: snapshot.spirits.filter(spirit => cases.some(([name]) => name === spirit.fullName)) };
 const t = source => localizeToolText(source, locale);
 const { container } = render(wrap(locale, <RankingsPanel kind="durability" snapshot={reduced} onClose={vi.fn()} />));
 const table = within(screen.getByRole("table", { name: t("标准耐久完整榜") }));
 const toggle = screen.getByRole("checkbox", { name: t("特殊配置") });
 expect(toggle).toBeChecked();
 expect(table.getAllByRole("row")).toHaveLength(9);
 for (const [name, label] of cases) {
  fireEvent.change(screen.getByLabelText(t("搜索耐久榜精灵")), { target: { value: name } });
  expect(table.getAllByRole("row")).toHaveLength(3);
  fireEvent.click(table.getByRole("button", { name: new RegExp(t(`${name} · ${label}`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
  const detail = within(screen.getByRole("region", { name: t("榜单配置详情") }));
  expect(detail.getByRole("columnheader", { name: t("特性后耐久") })).toBeVisible();
  expect(detail.getByRole("heading", { level: 3 })).toHaveTextContent(t(`${name} · ${label}`));
  if (locale === "en") expect(chinese(screen.getByRole("region", { name: t("榜单配置详情") }))).toEqual([]);
  fireEvent.click(detail.getByRole("button", { name: t("返回榜单") }));
  fireEvent.click(toggle);
  expect(table.getAllByRole("row")).toHaveLength(2);
  fireEvent.click(toggle);
 }
 if (locale === "en") expect(chinese(container)).toEqual([]);
});

test("Global deer workspace calculates and renders English with the S3 snapshot",()=>{
 const defender=snapshot.spirits.find(entry=>entry.fullName==="魔力猫");
 const presets={ [defender.id]:createTeamMember(snapshot,defender.id) };
 const {container,rerender}=render(wrap("en",<DeerWorkspace snapshot={snapshot} presets={presets}/>));
 expect(screen.getByRole("button",{name:"Jini preset",exact:true})).toHaveAttribute("aria-pressed","true");
 expect(container.querySelectorAll('.deer-table tbody tr').length).toBeGreaterThan(0);
 const followup = screen.getByRole("checkbox", { name: translateUi("en", "显示先发补刀") });
 if (!followup.checked) fireEvent.click(followup);
 expect([...new Set([...container.querySelectorAll(".deer-threshold")].map(cell => cell.dataset.label))]).toEqual([translateUi("en", "单招最低"), translateUi("en", "接先发最低")]);
 fireEvent.click(screen.getByRole("button", { name: /Battle conditions/ }));
 expect([...screen.getByLabelText("Weather").options].map(option => option.value)).not.toContain("dream");
 const untranslated=[];
 for (const button of container.querySelectorAll('.deer-expand')) {
  fireEvent.click(button);
  untranslated.push(...[...container.querySelectorAll('.deer-detail p')].map(node=>node.textContent).filter(text=>/[\u3400-\u9fff]/.test(text)));
 }
 expect(untranslated.join("\n")).toBe("");
 expect(chinese(container).join(" | "), [...container.querySelectorAll("*")].filter(n=>n.children.length===0 && /[\u3400-\u9fff]/.test(n.textContent)).map(n=>n.outerHTML).join("\n")).toBe("");
 rerender(wrap("ja",<DeerWorkspace snapshot={snapshot} presets={presets}/>));
 expect(screen.getByRole("button",{name:"ジニのプリセット",exact:true})).toHaveAttribute("aria-pressed","true");
 expect([...new Set([...container.querySelectorAll(".deer-threshold")].map(cell => cell.dataset.label))]).toEqual([translateUi("ja", "单招最低"), translateUi("ja", "接先发最低")]);
});


test("Global skill query loads its own catalog, displays official text and keeps filters across language changes", async () => {
 const catalog=JSON.parse(readFileSync("public/data/global/skill-query/catalog.json","utf8"));
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>catalog});vi.stubGlobal("fetch",fetch);
 const {container,rerender}=render(wrap("en",<SkillQueryPanel snapshot={snapshot} skills={snapshot.skills} spirits={snapshot.spirits} onClose={vi.fn()}/>));
 await screen.findByLabelText(translateUi("en","技能属性"));
 expect(fetch).toHaveBeenCalledWith("/data/global/skill-query/catalog.json");
 fireEvent.change(screen.getByLabelText(translateUi("en","技能属性")),{target:{value:"水"}});
 expect(chinese(container).join(" | ")).toBe("");
 rerender(wrap("ja",<SkillQueryPanel snapshot={snapshot} skills={snapshot.skills} spirits={snapshot.spirits} onClose={vi.fn()}/>));
 expect(container.querySelector('.sq-filter-fields select')).toHaveValue("水");
 vi.unstubAllGlobals();
});

test("released Global member editor shows calculated stats and default skills",()=>{
 const spirit=snapshot.spirits.find(entry=>entry.fullName==="波普鹿");
 const member=createTeamMember(snapshot,spirit.id);
 const {container}=render(wrap("en",<TeamMemberEditor snapshot={snapshot} index={0} member={member} onChange={vi.fn()}/>));
 expect(container.querySelectorAll('.stat-tile')).toHaveLength(6);
 expect(container.querySelectorAll('.team-member-editor__skills input[role="combobox"]')).toHaveLength(4);
 expect(chinese(container).join(" | ")).toBe("");
});
