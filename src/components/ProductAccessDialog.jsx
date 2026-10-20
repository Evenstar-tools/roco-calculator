import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { X } from "@phosphor-icons/react";
import { useRef } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";

const DESKTOP_RELEASES_URL =
  "https://github.com/Evenstar-tools/roco-calculator/releases/latest";
const MINIAPP_CODE_URL = "/assets/downloads/wechat-miniapp-code.jpg";

export function ProductAccessDialog({ onClose, open }) {
  const { t } = useLocale();
  const { serverId } = useRuntime();
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
        aria-label={t("获取应用")}
        aria-modal="true"
        className="share-dialog product-access-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="product-access-dialog__header">
          <h2>{t("获取应用")}</h2>
          <button aria-label={t("关闭获取应用")} className="product-access-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        {serverId === "global" && <p>{t("电脑版和小程序目前仅支持国服。")}</p>}
        <div className="product-access-dialog__grid">
          <article className="product-access-card product-access-card--desktop">
            <a
              aria-label={t("获取 Windows 电脑版")}
              className="product-access-desktop-link product-access-desktop-link--primary"
              href={DESKTOP_RELEASES_URL}
              rel="noreferrer"
              target="_blank"
            >
              <strong>{t("获取 Windows 电脑版")}</strong>
            </a>
          </article>
          <article className="product-access-card product-access-card--miniapp">
            <div className="product-access-card__title">
              <div>
                <strong>{t("微信小程序")}</strong>
                <span>{t("微信扫码或长按识别")}</span>
              </div>
            </div>
            <img
              alt={t("洛克计算器微信小程序码")}
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
          >{t("关闭")}</button>
        </div>
      </section>
    </div>
  );
}
