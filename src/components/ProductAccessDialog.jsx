import { X } from "@phosphor-icons/react";
import { useRef } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";

const GITHUB_REPOSITORY_URL =
  "https://github.com/Evenstar-tools/roco-calculator";
const DESKTOP_RELEASES_URL =
  "https://github.com/Evenstar-tools/roco-calculator/releases/latest";
const MINIAPP_CODE_URL = "/assets/downloads/wechat-miniapp-code.jpg";

export function ProductAccessDialog({ onClose, open }) {
  const dialogRef = useRef(null);

  useModalFocus(open, dialogRef, onClose);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label="获取应用"
        aria-modal="true"
        className="share-dialog product-access-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="product-access-dialog__header">
          <h2>获取应用</h2>
          <button aria-label="关闭获取应用" className="product-access-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="product-access-dialog__grid">
          <article className="product-access-card product-access-card--desktop">
            <a
              aria-label="获取 Windows 电脑版"
              className="product-access-desktop-link product-access-desktop-link--primary"
              href={DESKTOP_RELEASES_URL}
              rel="noreferrer"
              target="_blank"
            >
              <strong>获取 Windows 电脑版</strong>
            </a>
            <a
              aria-label="GitHub 项目主页"
              className="product-access-desktop-link"
              href={GITHUB_REPOSITORY_URL}
              rel="noreferrer"
              target="_blank"
            >
              <strong>GitHub 项目主页</strong>
            </a>
          </article>
          <article className="product-access-card product-access-card--miniapp">
            <div className="product-access-card__title">
              <div>
                <strong>微信小程序</strong>
                <span>微信扫码或长按识别</span>
              </div>
            </div>
            <img
              alt="洛克计算器微信小程序码"
              height="180"
              src={MINIAPP_CODE_URL}
              width="180"
            />
          </article>
        </div>
        <div className="dialog-actions">
          <button
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
