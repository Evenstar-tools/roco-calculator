import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { useEffect, useRef } from "react";
import { FEATURED_USER_RELEASE, S4_FEATURE_INTRO } from "../data/user-release-notes.js";
import { GLOBAL_RELEASE_SUMMARY } from "../data/global-release-summary.js";
import { USER_MANUAL_URL } from "../data/product-links.js";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function WhatsNewDialog({
  onClose,
  onOpenTeam,
  onOpenFeature,
  onOpenHistory,
  open = false,
  release = FEATURED_USER_RELEASE,
}) {
  const { t } = useLocale();
  const { serverId } = useRuntime();
  const dialogRef = useRef(null);
  const content = serverId === "global" ? GLOBAL_RELEASE_SUMMARY : S4_FEATURE_INTRO;

  useEffect(() => {
    if (!open || !content) return undefined;
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("[data-autofocus]")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [content, onClose, open]);

  if (!open || !content) return null;

  return (
    <div
      className="dialog-backdrop whats-new-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label={t("新功能介绍")}
        aria-modal="true"
        className="share-dialog whats-new-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="whats-new-dialog__header">
          <span>{serverId === "global" ? t(content.eyebrow) : content.eyebrow ?? release.version}</span>
          <h2>{serverId === "global" ? t(content.title) : content.title}</h2>
          {content.description ? <p>{serverId === "global" ? t(content.description) : content.description}</p> : null}
        </header>
        <ol className="whats-new-dialog__list">
          {content.items.map((item, index) => (
            <li key={item.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{serverId === "global" ? t(item.title) : item.title}{item.enhanced ? <small className="whats-new-dialog__badge">{t("增强")}</small> : null}</strong>
                {item.description ? <p>{serverId === "global" ? t(item.description) : item.description}</p> : null}
              </div>
              {item.action ? <button type="button" className="whats-new-dialog__feature" aria-label={serverId === "global" ? `${t(item.action)} ${t(item.title)}` : `${item.action}${item.title}`} onClick={() => onOpenFeature?.(item.id)}>{serverId === "global" ? t(item.action) : item.action}</button> : null}
            </li>
          ))}
        </ol>
        <a
          aria-label={t("查看使用说明书（飞书文档，新窗口打开）")}
          className="whats-new-dialog__manual"
          href={USER_MANUAL_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span>{t("查看使用说明书")}</span>
          <small>{t("飞书文档 · 新窗口打开")}</small>
        </a>
        <button className="whats-new-dialog__history" type="button" onClick={onOpenHistory}>{t("完整版本记录")}</button>
        <div className="dialog-actions whats-new-dialog__actions">
          <button className="secondary-action" onClick={onClose} type="button">{t("知道了")}</button>
          <button
            className="whats-new-dialog__primary"
            data-autofocus
            onClick={onOpenTeam}
            type="button"
          >{t("打开队伍")}</button>
        </div>
      </section>
    </div>
  );
}
