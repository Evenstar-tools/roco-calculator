import { useEffect, useRef, useState } from "react";
import {
  FEATURED_USER_RELEASE,
  USER_RELEASE_NOTES,
} from "../data/user-release-notes.js";

const BWIKI_URL = "https://wiki.biligame.com/rocom/";
export const FEEDBACK_QQ = "1215583051";
const FEEDBACK_EMAIL = "1215583051@qq.com";
const FEEDBACK_BILIBILI_URL =
  "https://space.bilibili.com/9281359?spm_id_from=333.1007.0.0";
const FEATURED_RELEASE_SUMMARY = {
  ...FEATURED_USER_RELEASE,
  highlights:
    FEATURED_USER_RELEASE.summaryHighlights ??
    FEATURED_USER_RELEASE.highlights.slice(0, 3),
};

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
          aria-label="返回关于与来源"
          className="release-notes-dialog__back"
          onClick={onBack}
          type="button"
        >
          ←
        </button>
        <div>
          <h2>完整版本记录</h2>
          <span>v1.0.0 — {FEATURED_USER_RELEASE.version}</span>
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

function DetailView({ feedback, onBack, onClose }) {
  const title = feedback ? "问题反馈" : "免责声明";
  return (
    <section
      aria-label={title}
      aria-modal="true"
      className="share-dialog release-notes-dialog legal-notice-dialog"
      role="dialog"
    >
      <header className="release-notes-dialog__header">
        <button
          aria-label="返回关于与来源"
          className="release-notes-dialog__back"
          onClick={onBack}
          type="button"
        >
          ←
        </button>
        <h2>{title}</h2>
      </header>
      {feedback ? (
        <div className="feedback-detail-list">
          <div>
            <strong>B站私信</strong>
            <a href={FEEDBACK_BILIBILI_URL} rel="noreferrer" target="_blank">
              诛仙剑下伤心花
            </a>
          </div>
          <div>
            <strong>邮箱</strong>
            <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>
          </div>
        </div>
      ) : (
        <div className="legal-notice-dialog__content">
          <p>本项目是玩家自建工具，非官方产品。</p>
          <p>数据和计算仅供参考，请以游戏内结果为准。</p>
          <p>游戏名称、角色与素材权利归原权利人所有。</p>
        </div>
      )}
      <div className="dialog-actions">
        <button
          aria-label={`关闭${title}`}
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

export function DataSourceDialog({ dataVersion, onClose, onCopyFeedback, open }) {
  const dialogRef = useRef(null);
  const [view, setView] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    dialogRef.current?.querySelector("a, button")?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (view) setView("");
      else onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [onClose, open, view]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 关闭时清掉子视图，避免下次打开闪到旧页
      setView("");
    }
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      ref={dialogRef}
    >
      {view === "release" ? (
        <ReleaseNotesView
          onBack={() => setView("")}
          onClose={onClose}
        />
      ) : view ? (
        <DetailView
          feedback={view === "feedback"}
          onBack={() => setView("")}
          onClose={onClose}
        />
      ) : (
        <section
          aria-label="关于与来源"
          aria-modal="true"
          className="share-dialog data-source-dialog"
          role="dialog"
        >
          <h2>关于与来源</h2>
          <p className="data-source-dialog__summary">
            非官方工具。资料来自公开页面和实机校验。
          </p>
          {dataVersion ? (
            <p
              className="data-source-dialog__data-version"
              title="数字为 BWIKI 页面修订号"
            >
              数据快照：{dataVersion}
            </p>
          ) : null}
          <section aria-label="版本记录" className="data-source-history">
            <div className="data-source-history__header">
              <strong>版本记录</strong>
              <button
                aria-label="查看完整版本记录"
                className="data-source-history__toggle"
                onClick={() => setView("release")}
                type="button"
              >
                完整记录
              </button>
            </div>
            <ReleaseItem current release={FEATURED_RELEASE_SUMMARY} />
          </section>
          <a href={BWIKI_URL} rel="noreferrer" target="_blank">
            <strong>洛克王国：世界 BWIKI</strong>
            <span>精灵、技能、属性与美术资料</span>
          </a>
          <div className="data-source-dialog__feedback">
            <button
              aria-label="查看问题反馈"
              className="data-source-dialog__feedback-open"
              onClick={() => setView("feedback")}
              type="button"
            >
              <strong>问题反馈</strong>
              <span>QQ {FEEDBACK_QQ}</span>
            </button>
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
              aria-label="查看免责声明"
              className="secondary-action"
              onClick={() => setView("disclaimer")}
              type="button"
            >
              免责声明
            </button>
            <button
              aria-label="关闭关于与来源"
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
  );
}
