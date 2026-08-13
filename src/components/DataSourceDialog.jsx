import { useEffect, useRef } from "react";

export const FEEDBACK_QQ = "1215583051";
export const BWIKI_URL = "https://wiki.biligame.com/rocom/";

export function DataSourceDialog({ onClose, onCopyFeedback, open }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    dialogRef.current?.querySelector("a, button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label="数据来源"
        aria-modal="true"
        className="share-dialog data-source-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2>数据来源</h2>
        <a href={BWIKI_URL} rel="noreferrer" target="_blank">
          <strong>洛克王国：世界 BWIKI</strong>
          <span>精灵、技能、属性与美术资料</span>
        </a>
        <div className="data-source-dialog__row">
          <strong>规则校验</strong>
          <span>公开资料与实机结果</span>
        </div>
        <div className="data-source-dialog__feedback">
          <div>
            <strong>问题反馈</strong>
            <span>QQ {FEEDBACK_QQ}</span>
          </div>
          <button
            aria-label="复制反馈 QQ"
            className="secondary-action"
            onClick={onCopyFeedback}
            type="button"
          >
            复制
          </button>
        </div>
        <div className="dialog-actions">
          <button
            aria-label="关闭数据来源"
            className="secondary-action"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>
      </section>
    </div>
  );
}
