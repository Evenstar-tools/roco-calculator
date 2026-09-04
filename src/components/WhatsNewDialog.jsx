import { useEffect, useRef } from "react";
import { FEATURED_USER_RELEASE } from "../data/user-release-notes.js";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function WhatsNewDialog({
  onClose,
  onOpenTeam,
  open = false,
  release = FEATURED_USER_RELEASE,
}) {
  const dialogRef = useRef(null);
  const content = release?.whatsNew;

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
        aria-label="新功能介绍"
        aria-modal="true"
        className="share-dialog whats-new-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="whats-new-dialog__header">
          <span>{content.eyebrow ?? release.version}</span>
          <h2>{content.title}</h2>
          {content.description ? <p>{content.description}</p> : null}
        </header>
        <ol className="whats-new-dialog__list">
          {content.items.map((item, index) => (
            <li key={item.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{item.title}</strong>
                {item.description ? <p>{item.description}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        <div className="dialog-actions whats-new-dialog__actions">
          <button className="secondary-action" onClick={onClose} type="button">
            知道了
          </button>
          <button
            className="whats-new-dialog__primary"
            data-autofocus
            onClick={onOpenTeam}
            type="button"
          >
            打开队伍
          </button>
        </div>
      </section>
    </div>
  );
}
