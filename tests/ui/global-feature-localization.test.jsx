import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";
import { GlobalTeamDraftExchange } from "../../src/components/GlobalTeamDraftExchange.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages, translateUi } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { ConfigLibraryDialog } from "../../src/components/ConfigLibraryDialog.jsx";
import { useConfigLibraryFlow } from "../../src/hooks/useConfigLibraryFlow.js";
import { localizeGlobalSpirit, localizeGlobalSkill } from "../../src/runtime/global-entity-localization.js";
import { createTeamMember } from "../../src/state/team-presets.js";
import { parseFavoriteConfigLibrary } from "../../src/state/favorite-config-library.js";
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

const s3 = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
const dimo = s3.spirits.find((spirit) => spirit.fullName === "迪莫");

test("released S3 team import localizes canonical names while preserving custom names, JSON and unknown references", () => {
  const team = { id: "native-s3", name: "普通・My team", members: [createTeamMember(s3, dimo.id), { spiritId: "future:jinie-42" }, ...Array(4).fill(null)] };
  const input = serializeTeamDraft(team), onImport = vi.fn(() => true);
  const { container, rerender } = render(wrap("en", <GlobalTeamDraftExchange mode="import" snapshot={s3} onImport={onImport} />));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: input } });
  fireEvent.click(screen.getByRole("button", { name: translateUi("en", "预览队伍草稿") }));
  expect(container.querySelector(".team-exchange__members")).toHaveTextContent(localizeGlobalSpirit(dimo, "en").fullName);
  expect(container.querySelector(".team-exchange__members")).not.toHaveTextContent("迪莫");
  rerender(wrap("ja", <GlobalTeamDraftExchange mode="import" snapshot={s3} onImport={onImport} />));
  expect(container.querySelector(".team-exchange__members")).toHaveTextContent(localizeGlobalSpirit(dimo, "ja").fullName);
  expect(screen.getByText(team.name)).toBeVisible();
  expect(screen.getByText("future:jinie-42")).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue(input);
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: translateUi("ja", "确认导入为新队伍") }));
  expect(onImport).toHaveBeenCalledWith(team);
  expect(dimo.fullName).toBe("迪莫");
});

function importFixture() {
  const local = createTeamMember(s3, dimo.id);
  const incoming = { ...local, natureId: "cheerful", displayIvs: { ...local.displayIvs, physicalAttack: 60 },
    skills: [local.skills.four[1], local.skills.four[1], "future:skill-42", local.skills.four[3]], traitValues: { "future:trait-42": true } };
  const library = { format: "rock-calculator.favorite-config-library", schemaVersion: 1, serverId: "global", versions: { data: s3.meta.id, rules: s3.meta.rulesVersion }, entries: [
    incoming, { ...incoming, natureId: "future:nature-42", displayIvs: { ...incoming.displayIvs, hp: 61 }, skills: [] },
    { ...incoming, spiritId: "future:jinie-42" }, { ...incoming, spiritId: null },
  ] };
  return { local, library, parsed: parseFavoriteConfigLibrary(JSON.stringify(library), { snapshot: s3, existingSpiritConfigs: { configs: { [dimo.id]: local } } }) };
}

test("released S3 library import localizes real differences and repair details without modifying the import payload", () => {
  clearMissingUiMessages();
  const { local, parsed } = importFixture();
  const original = JSON.stringify(parsed), onConfirmImport = vi.fn();
  const { container, rerender } = render(wrap("en", <ConfigLibraryDialog mode="import" snapshot={s3} parsed={parsed} onConfirmImport={onConfirmImport} />));
  const changes = container.querySelector(".config-library-changes");
  const originalSkill = s3.skills.find((skill) => skill.id === local.skills.four[0]);
  expect(changes).toHaveTextContent(localizeGlobalSkill(originalSkill, "en").name);
  expect(changes.textContent).not.toMatch(/[\u3400-\u9fff]/);
  fireEvent.click(container.querySelector(".config-library-issues-toggle"));
  const details = container.querySelector("#config-library-import-issues");
  expect(details).toHaveTextContent("future:skill-42");
  expect(details).toHaveTextContent("future:trait-42");
  expect(details).toHaveTextContent("future:nature-42");
  expect(details.textContent).not.toMatch(/[\u3400-\u9fff]/);
  rerender(wrap("ja", <ConfigLibraryDialog mode="import" snapshot={s3} parsed={parsed} onConfirmImport={onConfirmImport} />));
  expect(container.querySelector(".config-library-changes")).toHaveTextContent(localizeGlobalSkill(originalSkill, "ja").name);
  expect(container.querySelector("#config-library-import-issues")).toHaveTextContent(translateUi("ja", "只清空对应技能槽，其他配置正常导入"));
  expect(container.querySelector("#config-library-import-issues")).toHaveTextContent("future:nature-42");
  expect(JSON.stringify(parsed)).toBe(original);
  expect(onConfirmImport).not.toHaveBeenCalled();
  expect(getMissingUiMessages()).toEqual([]);
});

test("configuration-library file selection stays localized, retains previews on cancel and retries the same file", async () => {
  const storedData = { previewFavoriteConfigLibrary: vi.fn((text) => parseFavoriteConfigLibrary(text, { snapshot: s3 })), importFavoriteConfigLibrary: vi.fn() };
  function Library() {
    const flow = useConfigLibraryFlow({ initialState: { versions: { data: s3.meta.id, rules: s3.meta.rulesVersion } }, snapshot: s3, storedData, onToast: vi.fn() });
    return <><button type="button" onClick={flow.openConfigLibraryImport}>Open</button><ConfigLibraryDialog {...flow.overlayProps} /></>;
  }
  const { rerender } = render(wrap("en", <Library />));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const input = screen.getByLabelText(translateUi("en", "选择配置库文件"));
  expect(input).not.toBeVisible();
  const click = vi.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: translateUi("en", "选择配置库 JSON（最大 5 MB）") }));
  expect(click).toHaveBeenCalledTimes(1);
  const file = { size: 10, name: "My_library_設定_普通_2026.json", text: vi.fn().mockResolvedValueOnce("{invalid").mockResolvedValue(JSON.stringify(importFixture().library)) };
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent(translateUi("en", "配置库 JSON 无法解析"));
  expect(screen.getByRole("button", { name: translateUi("en", "导入"), exact: true })).toBeDisabled();
  expect(screen.getByText(file.name)).toBeVisible();
  expect(input).toHaveValue("");
  rerender(wrap("ja", <Library />));
  expect(screen.getByRole("alert")).toHaveTextContent(translateUi("ja", "配置库 JSON 无法解析"));
  expect(screen.getByText(file.name)).toBeVisible();
  expect(storedData.previewFavoriteConfigLibrary).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText(translateUi("ja", "选择配置库文件")), { target: { files: [file] } });
  expect(await screen.findByText(localizeGlobalSpirit(dimo, "ja").fullName)).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(translateUi("ja", "选择配置库文件")), { target: { files: [] } });
  expect(screen.getByText(localizeGlobalSpirit(dimo, "ja").fullName)).toBeVisible();
  expect(screen.getByText(file.name)).toBeVisible();
  expect(storedData.previewFavoriteConfigLibrary).toHaveBeenCalledTimes(2);
  expect(storedData.importFavoriteConfigLibrary).not.toHaveBeenCalled();
});

test("team JSON files use a localized picker and retain filename, preview and language across cancel and retry", async () => {
  const team = { name: "My team", members: [createTeamMember(s3, dimo.id), ...Array(5).fill(null)] };
  const content = serializeTeamDraft(team), onImport = vi.fn(() => true);
  const { rerender } = render(wrap("en", <GlobalTeamDraftExchange mode="import" snapshot={s3} onImport={onImport} />));
  const input = screen.getByLabelText(translateUi("en", "选择 JSON 文件"));
  expect(input).not.toBeVisible();
  const click = vi.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: translateUi("en", "选择 JSON 文件") }));
  expect(click).toHaveBeenCalledTimes(1);
  const file = { size: content.length, name: "My_very_long_team_普通_設定_export_2026.json", text: vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValue(content) };
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent(translateUi("en", "队伍草稿读取失败。"));
  expect(input).toHaveValue("");
  expect(screen.getByText(file.name)).toBeVisible();
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText("My team")).toBeVisible();
  fireEvent.change(input, { target: { files: [] } });
  expect(screen.getByText("My team")).toBeVisible();
  expect(screen.getByText(file.name)).toBeVisible();
  rerender(wrap("ja", <GlobalTeamDraftExchange mode="import" snapshot={s3} onImport={onImport} />));
  expect(screen.getByRole("button", { name: translateUi("ja", "选择 JSON 文件") })).toBeVisible();
  expect(screen.getByText(file.name)).toBeVisible();
  expect(screen.getByText(localizeGlobalSpirit(dimo, "ja").fullName)).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue(content);
  expect(file.text).toHaveBeenCalledTimes(2);
  expect(onImport).not.toHaveBeenCalled();
});
