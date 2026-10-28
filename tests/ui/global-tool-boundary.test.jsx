import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { translateUi } from "../../src/i18n/messages.js";
import SkillQueryPanel from "../../src/features/skill-query/SkillQueryPanel.jsx";
import TransmissionPanel from "../../src/features/transmission/TransmissionPanel.jsx";
import TypeQueryPanel from "../../src/features/type-query/TypeQueryPanel.jsx";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import DeerPage from "../../src/features/deer/DeerPage.jsx";
import { getCachedCatalog, loadSkillCatalog } from "../../src/features/skill-query/load-catalog.js";
import { loadServerSnapshot } from "../../src/runtime/load-snapshot.js";

vi.mock("../../src/features/skill-query/load-catalog.js", () => ({ getCachedCatalog: vi.fn(), loadSkillCatalog: vi.fn() }));
vi.mock("../../src/runtime/load-snapshot.js", () => ({ loadServerSnapshot: vi.fn() }));

const snapshot = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
const catalog = unpackCatalog(JSON.parse(readFileSync("public/data/global/skill-query/catalog.json", "utf8")));
const reduced = { ...snapshot, spirits: snapshot.spirits.filter(spirit => ["魔力猫", "波普鹿", "音速犬"].includes(spirit.fullName)) };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

const tools = [
  ["skills", SkillQueryPanel, {}, "skill-query", "关闭技能查询"],
  ["transmission", TransmissionPanel, {}, "transmission-panel", "关闭传动计算器"],
  ["types", TypeQueryPanel, { typeChart: snapshot.typeChart, spirits: snapshot.spirits, selectedTypes: ["光", "武"], onTypesChange: vi.fn() }, "type-query", "关闭属性查询"],
  ["speed", RankingsPanel, { kind: "speed" }, "rank-dialog", "关闭排行榜"],
  ["durability", RankingsPanel, { kind: "durability" }, "rank-dialog", "关闭排行榜"],
];

function Providers({ locale = "en", children }) {
  return <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;
}

test.each(tools)("released Global %s retains the dialog, supports language switching and uses only Global data", async (name, Tool, props, className, closeKey) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No CN data requests are permitted"));
  getCachedCatalog.mockReturnValue(catalog);
  loadSkillCatalog.mockResolvedValue(catalog);
  const onClose = vi.fn();
  const content = <Tool {...props} snapshot={reduced} onClose={onClose} />;
  const { rerender } = render(<Providers>{content}</Providers>);
  expect(screen.getByRole("dialog")).toHaveClass(className);
  if (name === "skills") {
    await waitFor(() => expect(loadSkillCatalog).toHaveBeenCalledWith("global"));
    expect(getCachedCatalog).toHaveBeenCalledWith("global");
    expect(screen.getByLabelText(translateUi("en", "技能属性"))).toBeVisible();
  } else expect(loadSkillCatalog).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).not.toHaveTextContent(/Unverified|CN reference|cannot be calculated yet/);
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  expect(loadServerSnapshot).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);

  rerender(<Providers locale="ja">{content}</Providers>);
  fireEvent.click(screen.getByRole("button", { name: translateUi("ja", closeKey), exact: true }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("closed Global rankings do not show a dialog or trap focus", () => {
  render(<Providers><RankingsPanel kind={null} onClose={vi.fn()} /></Providers>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe("hidden");
});

test("Global deer loads its own calculation snapshot without CN presets and returns to the matching language route", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("CN data must not load"));
  loadServerSnapshot.mockResolvedValue(snapshot);
  const { container, rerender } = render(<Providers><DeerPage /></Providers>);
  await waitFor(() => expect(container.querySelectorAll(".deer-table tbody tr").length).toBeGreaterThan(0));
  expect(loadServerSnapshot).toHaveBeenCalledWith("global", { signal: expect.any(AbortSignal) });
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: translateUi("en", "返回主站") })).toHaveAttribute("href", "/en/");
  rerender(<Providers locale="ja"><DeerPage /></Providers>);
  expect(screen.getByRole("link", { name: translateUi("ja", "返回主站") })).toHaveAttribute("href", "/jp/");
  expect(container.querySelectorAll(".deer-table tbody tr").length).toBeGreaterThan(0);
});
