import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";
import { GlobalTeamDraftExchange } from "../../src/components/GlobalTeamDraftExchange.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages, translateUi } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { serializeTeamDraft } from "../../src/state/team-draft-exchange.js";

function wrap(locale, child) {
  return <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{child}</LocaleProvider></RuntimeProvider>;
}
const names = { en: { spirit: "Abriel", skill: "A Long Tidal Refraction Skill", effect: "Restore energy after using this skill. ".repeat(8) }, ja: { spirit: "アブー", skill: "長い名称のリフレクトレイ", effect: "このスキルを使うと、エネルギーが回復する。".repeat(8) } };
function queryCatalog(locale) {
  const text = names[locale];
  return {
    skills: [{ id: "cn-placeholder:skill", name: text.skill, aliases: Object.values(names).map(({ skill }) => skill), type: "水", category: "magical", description: text.effect }],
    spirits: [{ id: "cn-placeholder:spirit", fullName: text.spirit, aliases: ["阿布", "Abriel", "アブー"], types: ["龙"], stage: "一阶", familyId: "family", reference: { sourceId: "spirit" } }],
    learnsets: [{ spiritId: "cn-placeholder:spirit", skillIds: ["cn-placeholder:skill"] }],
  };
}

test("switching Global query language keeps skill IDs, search, filters and detail navigation", () => {
  clearMissingUiMessages();
  const en = queryCatalog("en"), ja = queryCatalog("ja");
  const enT = (key, values) => translateUi("en", key, values), jaT = (key, values) => translateUi("ja", key, values);
  const { rerender, container } = render(wrap("en", <BidirectionalQuery placeholder season={en} skills={en.skills} spirits={en.spirits} />));
  fireEvent.change(screen.getByLabelText(enT("搜索技能或精灵")), { target: { value: "Tidal" } });
  fireEvent.change(screen.getByLabelText(enT("技能属性")), { target: { value: "水" } });
  fireEvent.change(screen.getByLabelText(enT("技能种类")), { target: { value: "magical" } });
  fireEvent.click(screen.getByRole("button", { name: enT("添加{name}", { name: names.en.skill }) }));
  expect(container.textContent).not.toMatch(/CN reference|Unverified|pinyin/i);
  rerender(wrap("ja", <BidirectionalQuery placeholder season={ja} skills={ja.skills} spirits={ja.spirits} />));
  expect(screen.getByLabelText(jaT("搜索技能或精灵"))).toHaveValue("Tidal");
  expect(screen.getByLabelText(jaT("技能属性"))).toHaveValue("水");
  expect(screen.getByLabelText(jaT("技能种类"))).toHaveValue("magical");
  expect(screen.getByRole("button", { name: jaT("取消{name}", { name: names.ja.skill }) })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(names.ja.effect)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: jaT("{name} 查看技能", { name: names.ja.spirit }) }));
  expect(screen.getByRole("heading", { name: names.ja.spirit })).toBeVisible();
  expect(container.querySelector(".sq-card-values, .sq-values, .sq-method")).not.toBeInTheDocument();
  expect(getMissingUiMessages()).toEqual([]);
});

test("switching Global team import language preserves typed JSON and preview without applying it", () => {
  clearMissingUiMessages();
  const team = { id: "draft", name: "Saved team", members: [{ spiritId: "cn-placeholder:spirit", natureId: null }, ...Array(5).fill(null)] };
  const input = serializeTeamDraft(team), onImport = vi.fn(() => true);
  const { rerender } = render(wrap("en", <GlobalTeamDraftExchange mode="import" snapshot={queryCatalog("en")} onImport={onImport} />));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: input } });
  fireEvent.click(screen.getByRole("button", { name: translateUi("en", "预览队伍草稿") }));
  expect(screen.getByText("Abriel")).toBeVisible();
  rerender(wrap("ja", <GlobalTeamDraftExchange mode="import" snapshot={queryCatalog("ja")} onImport={onImport} />));
  expect(screen.getByRole("textbox")).toHaveValue(input);
  expect(screen.getByText("アブー")).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: translateUi("ja", "确认导入为新队伍") }));
  expect(onImport).toHaveBeenCalledWith(team);
  expect(getMissingUiMessages()).toEqual([]);
});
