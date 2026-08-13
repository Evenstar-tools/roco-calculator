import { useEffect, useRef, useState } from "react";
import {
  CURRENT_USER_RELEASE,
  USER_RELEASE_NOTES,
} from "../data/user-release-notes.js";

export const FEEDBACK_QQ = "1215583051";
export const BWIKI_URL = "https://wiki.biligame.com/rocom/";

function ReleaseItem({ release, current = false }) {
  return (
    <article
      className={current
        ? "data-source-release data-source-release--current"
        : "data-source-release"}
    >
      <div className="data-source-release__heading">
        <div>
          <strong>{release.title}</strong>
          {release.date ? <span>{release.date}</span> : null}
        </div>
        <b>{release.version}</b>
      </div>
      <ul>
        {release.highlights.map((highlight) => (
          <li key={highlight}>{highlight}</li>
        ))}
      </ul>
    </article>
  );
}

function ReleaseNotesView({ onBack, onClose }) {
  return (
    <section
      aria-label="完整版本记录"
      aria-modal="true"
      className="share-dialog release-notes-dialog"
      role="dialog"
    >
      <header className="release-notes-dialog__header">
        <button
          aria-label="返回数据来源"
          className="release-notes-dialog__back"
          onClick={onBack}
          type="button"
        >
          ←
        </button>
        <div>
          <h2>完整版本记录</h2>
          <span>v1.0.0 — {CURRENT_USER_RELEASE.version}</span>
        </div>
      </header>
      <div className="release-notes-dialog__list">
        {USER_RELEASE_NOTES.map((release, index) => (
          <ReleaseItem
            current={index === 0}
            key={release.version}
            release={release}
          />
        ))}
      </div>
      <div className="dialog-actions">
        <button
          aria-label="关闭完整版本记录"
          className="secondary-action"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </div>
    </section>
  );
}

export function DataSourceDialog({ onClose, onCopyFeedback, open }) {
  const dialogRef = useRef(null);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const currentReleaseSummary = {
    ...CURRENT_USER_RELEASE,
    highlights: CURRENT_USER_RELEASE.highlights.slice(0, 3),
  };

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    dialogRef.current?.querySelector("a, button")?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (releaseNotesOpen) setReleaseNotesOpen(false);
      else onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [onClose, open, releaseNotesOpen]);

  useEffect(() => {
    if (!open) setReleaseNotesOpen(false);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div ref={dialogRef}>
        {releaseNotesOpen ? (
          <ReleaseNotesView
            onBack={() => setReleaseNotesOpen(false)}
            onClose={onClose}
          />
        ) : (
          <section
            aria-label="数据来源"
            aria-modal="true"
            className="share-dialog data-source-dialog"
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
            <section aria-label="版本记录" className="data-source-history">
              <div className="data-source-history__header">
                <strong>版本记录</strong>
                <button
                  aria-label="查看完整版本记录"
                  className="data-source-history__toggle"
                  onClick={() => setReleaseNotesOpen(true)}
                  type="button"
                >
                  完整记录
                </button>
              </div>
              <ReleaseItem current release={currentReleaseSummary} />
            </section>
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
        )}
      </div>
    </div>
  );
}
