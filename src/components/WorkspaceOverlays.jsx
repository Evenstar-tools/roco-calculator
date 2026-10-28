import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { ResultRail } from "./ResultRail.jsx";
import { damagePresentation } from "./damagePresentation.jsx";
import { TeamDrawer } from "./TeamDrawer.jsx";
import { ConfigLibraryDialog } from "./ConfigLibraryDialog.jsx";
import { DataSourceDialog } from "./DataSourceDialog.jsx";
import { ProductAccessDialog } from "./ProductAccessDialog.jsx";
import { FirstRunGuide } from "./FirstRunGuide.jsx";
import { DisplaySettingsDialog } from "./DisplaySettingsDialog.jsx";
import { WhatsNewDialog } from "./WhatsNewDialog.jsx";
import { USER_MANUAL_URL } from "../data/product-links.js";
import { POPULAR_CONFIG_COUNT } from "../data/preset-metadata.js";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(event, container) {
  if (event.key !== "Tab" || !container) return;
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function WorkspaceOverlays({
  children,
  cleanupConfigs = {},
  configLibrary,
  dataSource = {},
  displaySettings = {},
  firstRunGuide = {},
  menu,
  mobileResult,
  productAccess = {},
  share,
  team,
  toast,
  whatsNew = {},
}) {
  const { t } = useLocale();
  const runtime = useRuntime();
  const menuActions = menu.actions ?? {};
  const mobileActions = mobileResult.actions ?? {};
  const mobileRefs = mobileResult.refs ?? {};
  const shareActions = share.actions ?? {};
  const shareRefs = share.refs ?? {};
  const displaySettingsRef = useRef(null);
  const mobilePresentation = damagePresentation(mobileResult.result?.selectedResult);

  useEffect(() => {
    if (!mobileResult.open) return undefined;
    mobileRefs.close?.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        mobileActions.onClose?.();
        return;
      }
      trapFocus(event, mobileRefs.drawer?.current);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (mobileRefs.restoreFocus?.current !== false) {
        mobileRefs.trigger?.current?.focus();
      }
      if (mobileRefs.restoreFocus) mobileRefs.restoreFocus.current = true;
    };
    // 只在抽屉开关时绑定一次；actions/refs 每轮渲染都是新对象，列入依赖会反复装卸监听。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上
  }, [mobileResult.open]);

  useEffect(() => {
    if (!share.open && !share.pendingState && !displaySettings.open) {
      return undefined;
    }
    const trigger = document.activeElement;
    const dialog = displaySettings.open ? displaySettingsRef.current : share.open
      ? shareRefs.dialog?.current
      : shareRefs.version?.current;
    dialog?.querySelector(FOCUSABLE_SELECTOR)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (displaySettings.open) displaySettings.onClose?.();
        else shareActions.onCloseAll?.();
        return;
      }
      trapFocus(event, dialog);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) {
        trigger.focus();
      } else {
        [...document.querySelectorAll('[aria-controls="app-menu"]')]
          .find((button) => !button.closest("[hidden], [inert]"))?.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions/refs 每轮都是新对象
  }, [share.open, share.pendingState, displaySettings.open]);

  useEffect(() => {
    if (!menu.open) return undefined;
    menu.ref?.current?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      menuActions.onClose?.();
      menu.buttonRef?.current?.focus();
    };
    const onMouseDown = (event) => {
      if (
        menu.ref?.current?.contains(event.target) ||
        menu.buttonRef?.current?.contains(event.target)
      ) {
        return;
      }
      menuActions.onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu.actions/ref 每轮都是新对象
  }, [menu.open]);

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = setTimeout(() => toast.onExpire?.(), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只按 message 重启计时，避免 toast 对象抖动
  }, [toast.message]);

  return (
    <>
      {menu.open ? (
        <nav
          aria-label={t("应用菜单")}
          className="app-menu"
          id="app-menu"
          ref={menu.ref}
        >
          <div aria-hidden="true" className="app-menu__group-label">{t("配置")}</div>
          <button
            onClick={() => {
              menuActions.onClearCurrent?.();
              menuActions.onClose?.();
            }}
            type="button"
          >{t("清除当前页配置")}</button>
          <button
            aria-label={t("常用精灵配置")}
            className="app-menu__primary"
            onClick={() => {
              menuActions.onPopularConfigLibrary?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            <span>{t("常用精灵配置")}</span>
            {runtime.serverId === "cn" && <span className="app-menu__badge">{POPULAR_CONFIG_COUNT}</span>}
          </button>
          <button type="button" onClick={() => { menuActions.onConfigLibraryExport?.(); menuActions.onClose?.(); }}>{t("导入导出")}</button>
          {runtime.serverId === "global" && <button type="button" onClick={() => { menuActions.onShare?.(); menuActions.onClose?.(); }}>{t("分享当前配置")}</button>}
          <div aria-hidden="true" className="app-menu__separator" />
          <div aria-hidden="true" className="app-menu__group-label">{t("帮助")}</div>
          <button
            onClick={() => {
              menuActions.onShowShortcuts?.();
              menuActions.onClose?.();
            }}
            type="button"
          >{t("快捷键一览")}</button>
          <button
            onClick={() => {
              menuActions.onFirstRunGuide?.();
              menuActions.onClose?.();
            }}
            type="button"
          >{t("新手引导")}</button>
          <button
            aria-label={t("新功能 {version}", { version: whatsNew.version ?? "" }).trim()}
            className="app-menu__primary"
            onClick={() => {
              menuActions.onShowWhatsNew?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            <span>{t("新功能")}</span>
            {whatsNew.version ? (
              <span className="app-menu__badge">{whatsNew.version}</span>
            ) : null}
          </button>
          <button
            onClick={() => {
              menuActions.onShowDisplaySettings?.();
              menuActions.onClose?.();
            }}
            type="button"
          >{t("显示设置")}</button>
          <div aria-hidden="true" className="app-menu__separator" />
          {runtime.serverId === "global" && (runtime.onServerChange || menuActions.onOpenGlobal) && <>
            <div aria-hidden="true" className="app-menu__group-label">{t("服务器")} · {t(runtime.serverId === "global" ? "国际服" : "国服")}</div>
            <button type="button" onClick={() => { menuActions.onClose?.(); if (runtime.onServerChange) runtime.onServerChange(runtime.serverId === "global" ? "cn" : "global"); else menuActions.onOpenGlobal(); }}>{t(runtime.serverId === "global" ? "国服" : "国际服 · Global CBT")}</button>
            {runtime.serverId === "global" && runtime.onLocaleChange && <label className="app-menu__group-label" style={{ display: "block", minWidth: 0 }}>{t("语言")}
              <select aria-label={t("语言")} value={runtime.locale} onChange={(event) => runtime.onLocaleChange(event.target.value)} style={{ width: "100%", minHeight: 36, marginTop: 6, fontSize: 13, letterSpacing: "normal" }}>
                <option value="en">English</option><option value="zh-CN">简体中文</option><option value="ja">日本語</option>
              </select>
            </label>}
            <div aria-hidden="true" className="app-menu__separator" />
          </>}
          <div aria-hidden="true" className="app-menu__group-label">{t("关于")}</div>
          <a
            aria-label={t("查看使用说明书（飞书文档，新窗口打开）")}
            href={USER_MANUAL_URL}
            onClick={() => menuActions.onClose?.()}
            rel="noopener noreferrer"
            target="_blank"
          >{t("使用说明书")}</a>
          <button
            onClick={() => {
              menuActions.onShowProductAccess?.();
              menuActions.onClose?.();
            }}
            type="button"
          >{t("获取应用")}</button>
          <button
            onClick={() => {
              menuActions.onShowDataSource?.();
              menuActions.onClose?.();
            }}
            type="button"
          >{t("关于与来源")}</button>
        </nav>
      ) : null}

      {children}

      <FirstRunGuide {...firstRunGuide} />

      <WhatsNewDialog {...whatsNew} />

      {mobileResult.configurationReady ? (
        <div className="mobile-result-dock">
        <button
          aria-label={t("展开伤害结果")}
          className={`mobile-result-bar mobile-result-bar--${mobileResult.viewMode}${mobileActions.onOpenComparison ? " mobile-result-bar--with-comparison" : ""}`}
          onClick={mobileActions.onOpen}
          ref={mobileRefs.trigger}
          type="button"
        >
          <span className="mobile-result-bar__matchup">
            {mobileResult.result.attackerName} → {mobileResult.result.defenderName}
          </span>
          <span className="mobile-result-bar__skill">
            {mobileResult.result.selectedSkillName}
          </span>
          <strong className="mobile-result-bar__damage">
            {mobilePresentation.damage ?? "—"}
          </strong>
          <span className="mobile-result-bar__percent">
            {Number.isFinite(mobilePresentation.percent)
              ? `${mobilePresentation.percent.toFixed(1)}%`
              : t(mobileResult.result.selectedResult.reason === "非伤害技能不计算伤害" ? "非伤害" : "待输入")}
          </span>
        </button>
        {mobileActions.onOpenComparison ? <button type="button" className="mobile-comparison-entry damage-comparison-entry" onClick={mobileActions.onOpenComparison}>{t("承伤对比")}</button> : null}
        </div>
      ) : null}

      {mobileResult.configurationReady && mobileResult.open ? (
        <div
          aria-label={t("完整伤害结果")}
          aria-modal="true"
          className="result-drawer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) mobileActions.onClose?.();
          }}
          // eslint-disable-next-line react-hooks/refs -- 把父级传入的 ref 挂到抽屉根节点，不是读取 .current
          ref={mobileRefs.drawer}
          role="dialog"
        >
          <button
            aria-label={t("关闭伤害结果")}
            className="result-drawer__close"
            onClick={mobileActions.onClose}
            // eslint-disable-next-line react-hooks/refs -- 把关闭按钮 ref 交给焦点管理
            ref={mobileRefs.close}
            title={t("关闭结果")}
            type="button"
          >
            <X aria-hidden="true" size={22} weight="bold" />
          </button>
          <ResultRail
            activeAdvancedConditions={mobileResult.activeAdvancedConditions}
            onAdvancedOptionsOpen={mobileActions.onAdvancedOptionsOpen}
            onCurrentHpChange={mobileActions.onCurrentHpChange}
            onCurrentHpPercentChange={mobileActions.onCurrentHpPercentChange}
            onDirectionToggle={mobileActions.onDirectionToggle}
            onSkillResultSelect={mobileActions.onSkillResultSelect}
            onNegativeStatusRepeatChange={mobileActions.onNegativeStatusRepeatChange}
            onOpenComparison={mobileActions.onOpenComparison}
            onOpenStarfall={mobileActions.onOpenStarfall}
            result={mobileResult.result}
            showTypeCoverage={mobileResult.showTypeCoverage}
          />
        </div>
      ) : null}

      {team.drawerProps ? (
        <TeamDrawer {...team.drawerProps} open={team.open} />
      ) : null}

      <ConfigLibraryDialog {...configLibrary} />

      <DataSourceDialog {...dataSource} />

      <ProductAccessDialog {...productAccess} />

      <DisplaySettingsDialog {...displaySettings} dialogRef={displaySettingsRef} />

      {cleanupConfigs.open ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cleanupConfigs.onCancel?.();
            }
          }}
        >
          <section
            aria-label={t("清理未完成配置")}
            aria-modal="true"
            className="share-dialog"
            role="dialog"
          >
            <h2>{t("清理未完成配置")}</h2>
            <p>{t("仅清理未完成的精灵配置，收藏、完整配置和队伍不会删除。")}</p>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={cleanupConfigs.onConfirm}
                type="button"
              >{t("确认清理")}</button>
              <button
                className="secondary-action"
                onClick={cleanupConfigs.onCancel}
                type="button"
              >{t("取消")}</button>
            </div>
          </section>
        </div>
      ) : null}

      {share.open ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) shareActions.onClose?.();
          }}
        >
          <form
            aria-label={t("分享当前配置")}
            aria-modal="true"
            className="share-dialog share-config-dialog"
            onSubmit={shareActions.onImportSubmit}
            ref={shareRefs.dialog}
            role="dialog"
          >
            <h2>{t("分享当前配置")}</h2>
            <p className="share-config-dialog__intro">{t(runtime.serverId === "global" ? "链接保留当前配置草稿中的输入，不包含配置库和队伍；国际服数据核验前不计算结果。" : "链接包含双方精灵、性格、个体、技能、特性和当前战斗条件，不会包含配置库和队伍。")}</p>
            <section className="share-config-section">
              <h3>{t("发送当前配置")}</h3>
              <label>
                <span>{t("当前配置链接")}</span>
                <input
                  aria-label={t("当前配置链接")}
                  disabled={!share.shareLink}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder={t(runtime.serverId === "global" ? "正在生成配置链接" : "选择双方精灵后生成")}
                  readOnly
                  value={share.shareLink}
                />
              </label>
              <button
                className="secondary-action"
                disabled={!share.shareLink}
                onClick={shareActions.onCopy}
                type="button"
              >{t("复制当前配置链接")}</button>
            </section>
            <section className="share-config-section">
              <h3>{t("载入别人分享的配置")}</h3>
              <label>
                <span>{t("粘贴完整分享链接或分享码")}</span>
                <input
                  aria-label={t("粘贴分享链接")}
                  autoFocus={!share.shareLink}
                  onChange={(event) =>
                    shareActions.onImportDraftChange?.(event.target.value)
                  }
                  placeholder={t("粘贴分享链接")}
                  value={share.importDraft}
                />
              </label>
              <button
                className="secondary-action"
                disabled={!share.importDraft.trim()}
                type="submit"
              >{t("载入分享配置")}</button>
            </section>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={shareActions.onClose}
                type="button"
              >{t("关闭")}</button>
            </div>
          </form>
        </div>
      ) : null}

      {share.pendingState ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              shareActions.onPendingClose?.();
            }
          }}
        >
          <section
            aria-label={t("分享版本不一致")}
            aria-modal="true"
            className="share-dialog"
            // eslint-disable-next-line react-hooks/refs -- 把版本冲突对话框 ref 交给焦点管理
            ref={shareRefs.version}
            role="dialog"
          >
            <h2>{t("分享版本不一致")}</h2>
            <p>{t("原数据 ")}{share.pendingState.versions.data}{t(" · 规则")}{" "}
              {share.pendingState.versions.rules}
            </p>
            <p>{t("当前数据 ")}{share.versions.data}{t(" · 规则 ")}{share.versions.rules}
            </p>
            <small>{t("旧快照未内置。可保留全部输入并按当前版本重算，结果会在右侧即时更新。")}</small>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={shareActions.onPendingConfirm}
                type="button"
              >{t("按当前版本重算")}</button>
              <button
                className="secondary-action"
                onClick={shareActions.onPendingClose}
                type="button"
              >{t("取消")}</button>
            </div>
          </section>
        </div>
      ) : null}

      {toast.message && !/permission denied/i.test(toast.message) ? (
        <div className="toast">{toast.message}</div>
      ) : null}
    </>
  );
}
