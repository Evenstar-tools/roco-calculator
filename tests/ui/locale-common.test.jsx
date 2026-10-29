import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { UI_MESSAGES, clearMissingUiMessages, getMissingUiMessages, translateUi } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { SpiritStep } from "../../src/components/SpiritStep.jsx";
import { EmptyStateGuide } from "../../src/components/EmptyStateGuide.jsx";
import { DisplaySettingsDialog } from "../../src/components/DisplaySettingsDialog.jsx";
import { ShortcutDialog } from "../../src/components/ShortcutDialog.jsx";
import { WorkspaceOverlays } from "../../src/components/WorkspaceOverlays.jsx";
import { ProductAccessDialog } from "../../src/components/ProductAccessDialog.jsx";
import { DataSourceDialog } from "../../src/components/DataSourceDialog.jsx";
import { WhatsNewDialog } from "../../src/components/WhatsNewDialog.jsx";

vi.mock("../../src/components/TeamDrawer.jsx", () => ({ TeamDrawer: () => null }));
vi.mock("../../src/components/ConfigLibraryDialog.jsx", () => ({ ConfigLibraryDialog: () => null }));

beforeEach(() => { clearMissingUiMessages(); localStorage.clear(); });
const wrap = (locale, children, callbacks = {}) => <RuntimeProvider serverId="global" locale={locale} {...callbacks}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;

test("语言词典保留中文默认和占位符，非中文漏词明确记录而非悄悄回退", () => {
  expect(translateUi("zh-CN", "关闭{title}", { title: "测试" })).toBe("关闭测试");
  expect(translateUi("en", "关闭{title}", { title: "Settings" })).toBe("Close Settings");
  expect(translateUi("ja", "关闭{title}", { title: "設定" })).toBe("設定を閉じる");
  expect(translateUi("en", "An already translated message")).toBe("An already translated message");
  expect(translateUi("en", "测试漏词")).toBe("Translation unavailable");
  expect(getMissingUiMessages()).toEqual(["en:测试漏词"]);
  for (const [source, translations] of Object.entries(UI_MESSAGES)) {
    const tokens = [...source.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
    for (const locale of ["en", "ja"]) {
      expect(translations[locale], source + ":" + locale).toBeTypeOf("string");
      expect([...translations[locale].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort(), source + ":" + locale).toEqual(tokens);
    }
  }
});

test.each(["en", "ja"])("%s 使用原版header与精灵选择布局，国际服默认S3装饰", (locale) => {
  const t = (source) => translateUi(locale, source);
  const { container } = render(wrap(locale, <><AppHeader onMenuOpen={vi.fn()} /><SpiritStep spirits={[]} /><EmptyStateGuide title={t("国际服计算器")} message={t("国际服的数值、技能与规则尚未核验，暂不进行伤害计算。")} /></>));
  expect(container.querySelector(".app-header")).toBeInTheDocument();
  expect(container.querySelector(".versus-grid")).toBeInTheDocument();
  expect(container.querySelector(".app-header__season-character")).toHaveAttribute("src", "/assets/season/s3-jiaer.webp");
  expect(screen.getByRole("heading", { name: t("洛克计算器") + " · " + t("国际服") })).toBeVisible();
  const attacker = screen.getByRole("combobox", { name: translateUi(locale, "{side}精灵", { side: t("攻击方") }) });
  fireEvent.focus(attacker);
  expect(screen.getByText(t("暂无收藏精灵，请输入搜索"))).toBeVisible();
  expect(getMissingUiMessages()).toEqual([]);
});

test.each(["en", "ja"])("%s 原设置/快捷键/菜单/关于与分享弹层文案完整，语言切服保留原菜单交互", (locale) => {
  const t = (source) => translateUi(locale, source);
  const onLocaleChange = vi.fn(), onServerChange = vi.fn(), onShare = vi.fn(), onClose = vi.fn();
  const overlays = {
    menu: { open: true, actions: { onClose, onShare } }, mobileResult: {},
    share: { open: false, actions: {} }, team: {}, toast: {},
  };
  const view = render(wrap(locale, <WorkspaceOverlays {...overlays} />, { onLocaleChange, onServerChange }));
  fireEvent.change(screen.getByRole("combobox", { name: t("语言") }), { target: { value: "zh-CN" } });
  expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
  fireEvent.click(screen.getByRole("button", { name: t("国服") }));
  expect(onServerChange).toHaveBeenCalledWith("cn");
  expect(document.querySelectorAll(".app-menu__badge")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: t("分享当前配置"), exact: true }));
  expect(onShare).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledTimes(2);

  view.rerender(wrap(locale, <DisplaySettingsDialog open powerDisplayMode="panel" />));
  expect(screen.getByRole("dialog", { name: t("显示设置") })).toBeVisible();
  expect(screen.queryByText(t("暂不可计算伤害；显示偏好会保留。"))).not.toBeInTheDocument();
  expect(screen.queryByText(t("有效威力结算本系、克制、能力等级与其他威力乘区后取整（非负威力向下取整）；雨天计入威力加成区。手动填写后直接用于伤害计算。"))).toBeInTheDocument();
  view.rerender(wrap(locale, <ShortcutDialog settings={{ enabled: true, bindings: { attacker: "a", defender: "d", swap: "x", team: "t", help: "?" } }} onClose={vi.fn()} />));
  expect(screen.getByRole("dialog", { name: t("快捷键一览") })).toBeVisible();
  view.rerender(wrap(locale, <ProductAccessDialog open />));
  expect(screen.getByText(t("电脑版和小程序目前仅支持国服。"))).toBeVisible();
  view.rerender(wrap(locale, <DataSourceDialog open />));
  expect(screen.getByText(t("国际服计算器"))).toBeVisible();
  view.rerender(wrap(locale, <WhatsNewDialog open />));
  expect(screen.getByText(t("国际服计算器"))).toBeVisible();
  view.rerender(wrap(locale, <WorkspaceOverlays {...overlays} menu={{ open: false }} share={{ open: true, shareLink: "", importDraft: "", actions: {} }} />));
  expect(screen.getByRole("dialog", { name: t("分享当前配置") })).toBeVisible();
  expect(getMissingUiMessages()).toEqual([]);
});

test.each(["zh-CN", "en", "ja"])("%s 国际服不显示QQ号码或复制入口，保留其他反馈渠道", (locale) => {
  const t = (source) => translateUi(locale, source);
  const onCopyFeedback = vi.fn();
  const onClose = vi.fn();
  render(wrap(locale, <DataSourceDialog open onClose={onClose} onCopyFeedback={onCopyFeedback} />));
  expect(screen.queryByText("QQ 1215583051")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t("复制反馈 QQ") })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("查看问题反馈") }));
  expect(screen.getByRole("dialog", { name: t("问题反馈") })).toBeVisible();
  expect(screen.getByRole("link", { name: "1215583051@qq.com" })).toHaveAttribute("href", "mailto:1215583051@qq.com");
  expect(screen.getByRole("link", { name: t("诛仙剑下伤心花") })).toHaveAttribute("href", expect.stringContaining("space.bilibili.com"));
  fireEvent.click(screen.getByRole("button", { name: t("返回关于与来源") }));
  expect(screen.queryByText("QQ 1215583051")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t("复制反馈 QQ") })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("关闭关于与来源") }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onCopyFeedback).not.toHaveBeenCalled();
  expect(getMissingUiMessages()).toEqual([]);
});

test.each(["en", "ja"])("%s 从菜单关闭弹窗后焦点回到当前服菜单，不落在隐藏国服", (locale) => {
  function MenuHarness() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [productOpen, setProductOpen] = useState(false);
    return <>
      <div hidden inert><button aria-controls="app-menu">隐藏国服菜单</button></div>
      <AppHeader menuOpen={menuOpen} onMenuOpen={() => setMenuOpen(!menuOpen)} />
      <WorkspaceOverlays menu={{ open: menuOpen, actions: { onClose: () => setMenuOpen(false), onShowProductAccess: () => setProductOpen(true) } }} productAccess={{ open: productOpen, onClose: () => setProductOpen(false) }} mobileResult={{}} share={{}} team={{}} toast={{}} />
    </>;
  }
  render(wrap(locale, <MenuHarness />));
  const menu = screen.getByRole("button", { name: translateUi(locale, "打开菜单"), exact: true });
  fireEvent.click(menu);
  const entry = screen.getByRole("button", { name: translateUi(locale, "获取应用"), exact: true });
  entry.focus();
  fireEvent.click(entry);
  expect(screen.getByRole("dialog", { name: translateUi(locale, "获取应用") })).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(menu).toHaveFocus();
});
