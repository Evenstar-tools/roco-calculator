import { X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ResultRail } from "./ResultRail.jsx";
import { TeamDrawer } from "./TeamDrawer.jsx";
import { ConfigLibraryDialog } from "./ConfigLibraryDialog.jsx";

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
  menu,
  mobileResult,
  share,
  team,
  toast,
}) {
  const menuActions = menu.actions ?? {};
  const mobileActions = mobileResult.actions ?? {};
  const mobileRefs = mobileResult.refs ?? {};
  const shareActions = share.actions ?? {};
  const shareRefs = share.refs ?? {};

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
      mobileRefs.trigger?.current?.focus();
    };
  }, [mobileResult.open]);

  useEffect(() => {
    if (!share.open && !share.pendingState) {
      return undefined;
    }
    const trigger = document.activeElement;
    const dialog = share.open
      ? shareRefs.dialog?.current
      : shareRefs.version?.current;
    dialog?.querySelector(FOCUSABLE_SELECTOR)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        shareActions.onCloseAll?.();
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
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
      } else {
        document.querySelector('[aria-label="打开菜单"]')?.focus();
      }
    };
  }, [share.open, share.pendingState]);

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
  }, [menu.open]);

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = setTimeout(() => toast.onExpire?.(), 2200);
    return () => clearTimeout(timer);
  }, [toast.message]);

  return (
    <>
      {menu.open ? (
        <nav
          aria-label="应用菜单"
          className="app-menu"
          id="app-menu"
          ref={menu.ref}
        >
          <button
            onClick={() => {
              menuActions.onConfigLibraryExport?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            配置库导出
          </button>
          <button
            onClick={() => {
              menuActions.onConfigLibraryImport?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            配置库导入
          </button>
          <button
            onClick={() => {
              menuActions.onClearCurrent?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            清除当前页配置
          </button>
          <button
            onClick={() => {
              menuActions.onCleanupConfigs?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            清理未完成配置
          </button>
          <button
            onClick={() => {
              menuActions.onShare?.();
              menuActions.onClose?.();
            }}
            type="button"
          >
            分享当前配置
          </button>
        </nav>
      ) : null}

      {children}

      {mobileResult.configurationReady ? (
        <button
          aria-label="展开伤害结果"
          className={`mobile-result-bar mobile-result-bar--${mobileResult.viewMode}`}
          onClick={mobileActions.onOpen}
          ref={mobileRefs.trigger}
          type="button"
        >
          <span className="mobile-result-bar__matchup">
            {mobileResult.result.attackerName} → {mobileResult.result.defenderName}
          </span>
          <strong className="mobile-result-bar__damage">
            {mobileResult.result.selectedResult.totalDamage ?? "—"}
          </strong>
          <span className="mobile-result-bar__percent">
            {Number.isFinite(mobileResult.result.selectedResult.hpPercent)
              ? `${mobileResult.result.selectedResult.hpPercent.toFixed(1)}%`
              : "待输入"}
          </span>
        </button>
      ) : null}

      {mobileResult.configurationReady && mobileResult.open ? (
        <div
          aria-label="完整伤害结果"
          aria-modal="true"
          className="result-drawer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) mobileActions.onClose?.();
          }}
          ref={mobileRefs.drawer}
          role="dialog"
        >
          <button
            aria-label="关闭伤害结果"
            className="result-drawer__close"
            onClick={mobileActions.onClose}
            ref={mobileRefs.close}
            title="关闭结果"
            type="button"
          >
            <X aria-hidden="true" size={22} weight="bold" />
          </button>
          <ResultRail
            onCurrentHpChange={mobileActions.onCurrentHpChange}
            onCurrentHpPercentChange={mobileActions.onCurrentHpPercentChange}
            onDirectionToggle={mobileActions.onDirectionToggle}
            result={mobileResult.result}
          />
        </div>
      ) : null}

      {team.drawerProps ? (
        <TeamDrawer {...team.drawerProps} open={team.open} />
      ) : null}

      <ConfigLibraryDialog {...configLibrary} />

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
            aria-label="清理未完成配置"
            aria-modal="true"
            className="share-dialog"
            role="dialog"
          >
            <h2>清理未完成配置</h2>
            <p>仅清理未完成的精灵配置，收藏、完整配置和队伍不会删除。</p>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={cleanupConfigs.onConfirm}
                type="button"
              >
                确认清理
              </button>
              <button
                className="secondary-action"
                onClick={cleanupConfigs.onCancel}
                type="button"
              >
                取消
              </button>
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
            aria-label="分享当前配置"
            aria-modal="true"
            className="share-dialog share-config-dialog"
            onSubmit={shareActions.onImportSubmit}
            ref={shareRefs.dialog}
            role="dialog"
          >
            <h2>分享当前配置</h2>
            <p className="share-config-dialog__intro">
              链接包含双方精灵、性格、个体、技能、特性和当前战斗条件，不会包含配置库和队伍。
            </p>
            <section className="share-config-section">
              <h3>发送当前配置</h3>
              <label>
                <span>当前配置链接</span>
                <input
                  aria-label="当前配置链接"
                  disabled={!share.shareLink}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="选择双方精灵后生成"
                  readOnly
                  value={share.shareLink}
                />
              </label>
              <button
                className="secondary-action"
                disabled={!share.shareLink}
                onClick={shareActions.onCopy}
                type="button"
              >
                复制当前配置链接
              </button>
            </section>
            <section className="share-config-section">
              <h3>载入别人分享的配置</h3>
              <label>
                <span>粘贴完整链接或以 #v1 开头的内容</span>
                <input
                  aria-label="粘贴分享链接"
                  autoFocus={!share.shareLink}
                  onChange={(event) =>
                    shareActions.onImportDraftChange?.(event.target.value)
                  }
                  placeholder="粘贴分享链接"
                  value={share.importDraft}
                />
              </label>
              <button
                className="secondary-action"
                disabled={!share.importDraft.trim()}
                type="submit"
              >
                载入分享配置
              </button>
            </section>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={shareActions.onClose}
                type="button"
              >
                关闭
              </button>
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
            aria-label="分享版本不一致"
            aria-modal="true"
            className="share-dialog"
            ref={shareRefs.version}
            role="dialog"
          >
            <h2>分享版本不一致</h2>
            <p>
              原数据 {share.pendingState.versions.data} · 规则{" "}
              {share.pendingState.versions.rules}
            </p>
            <p>
              当前数据 {share.versions.data} · 规则 {share.versions.rules}
            </p>
            <small>
              旧快照未内置。可保留全部输入并按当前版本重算，结果会在右侧即时更新。
            </small>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={shareActions.onPendingConfirm}
                type="button"
              >
                按当前版本重算
              </button>
              <button
                className="secondary-action"
                onClick={shareActions.onPendingClose}
                type="button"
              >
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast.message ? <div className="toast">{toast.message}</div> : null}
    </>
  );
}
