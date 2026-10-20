import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { getMissingUiMessages, clearMissingUiMessages } from "../../src/i18n/messages.js";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";
import TransmissionPanel from "../../src/features/transmission/TransmissionPanel.jsx";
import TypeQueryPanel from "../../src/features/type-query/TypeQueryPanel.jsx";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import DeerPage from "../../src/features/deer/DeerPage.jsx";
import { getCachedCatalog, loadSkillCatalog } from "../../src/features/skill-query/load-catalog.js";
import { loadServerSnapshot } from "../../src/runtime/load-snapshot.js";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";

vi.mock("../../src/features/skill-query/load-catalog.js", () => ({ getCachedCatalog: vi.fn(), loadSkillCatalog: vi.fn() }));
vi.mock("../../src/runtime/load-snapshot.js", () => ({ loadServerSnapshot: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); clearMissingUiMessages(); });

const tools = [
  ["skills", SkillQueryPanel, {}, "skill-query", "Global skill data", "スキルデータ"],
  ["transmission", TransmissionPanel, {}, "transmission-panel", "Global transmission rules", "伝動ルール"],
  ["types", TypeQueryPanel, { selectedTypes: ["光", "武"] }, "type-query", "Global type matchups", "タイプ相性"],
  ["speed", RankingsPanel, { kind: "speed" }, "rank-dialog", "Global stats and rules", "数値とルール"],
  ["durability", RankingsPanel, { kind: "durability" }, "rank-dialog", "Global stats and rules", "数値とルール"],
];

function Providers({ locale = "en", children }) {
  return <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;
}

test.each(tools)("Global %s keeps its original dialog shell, translates the state, and never reads CN data", (name, Tool, props, className, enStatus, jaStatus) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No data requests are permitted"));
  // Skill queries inspect the explicit reference marker; no marker means no query.
  const snapshot = name === "skills" ? UNVERIFIED_GLOBAL_SNAPSHOT
    : new Proxy({}, { get() { throw new Error("Unverified tool read calculation data"); } });
  const onClose = vi.fn();
  const { rerender } = render(<Providers><Tool {...props} snapshot={snapshot} onClose={onClose} /></Providers>);
  expect(screen.getByRole("dialog")).toHaveClass(className);
  expect(screen.getByRole("status")).toHaveTextContent(enStatus);
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  expect(loadSkillCatalog).not.toHaveBeenCalled();
  expect(getCachedCatalog).not.toHaveBeenCalled();
  expect(loadServerSnapshot).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);

  rerender(<Providers locale="ja"><Tool {...props} snapshot={snapshot} onClose={onClose} /></Providers>);
  expect(screen.getByRole("status")).toHaveTextContent(jaStatus);
  expect(screen.getByRole("dialog").textContent).not.toContain("翻訳未対応");
  fireEvent.click(screen.getByRole("button", { name: /を閉じる$/ }));
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(getMissingUiMessages()).toEqual([]);
});

test("closed Global rankings do not show a dialog or trap focus", () => {
  render(<Providers><RankingsPanel kind={null} onClose={vi.fn()} /></Providers>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe("hidden");
});

test("Global deer entry never loads CN snapshots, presets or calculator and returns to its own server", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("CN data must not load"));
  const { rerender } = render(<Providers><DeerPage /></Providers>);
  expect(screen.getByRole("status")).toHaveTextContent("KO thresholds cannot be calculated yet");
  expect(screen.getByRole("link", { name: "Back to calculator" })).toHaveAttribute("href", "/en/");
  expect(loadServerSnapshot).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  rerender(<Providers locale="ja"><DeerPage /></Providers>);
  expect(screen.getByRole("link", { name: "計算機に戻る" })).toHaveAttribute("href", "/global/ja/");
  expect(screen.getByRole("status")).toHaveTextContent("撃破ラインは計算できません");
  expect(getMissingUiMessages()).toEqual([]);
});
