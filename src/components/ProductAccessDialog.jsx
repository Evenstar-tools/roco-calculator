import { useEffect, useRef } from "react";

const DESKTOP_RELEASES_URL =
  "https://github.com/Evenstar-tools/roco-calculator/releases/latest";
const MINIAPP_CODE_URL = "/assets/downloads/wechat-miniapp-code.jpg";

export function ProductAccessDialog({ onClose, open }) {
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
  }, [onClose, open]);

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
        </header>
        <div className="product-access-dialog__grid">
          <article className="product-access-card product-access-card--desktop">
            <div>
              <strong>Windows 桌面版</strong>
              <span>在 GitHub Releases 下载</span>
            </div>
            <a
              aria-label="打开 Windows 下载页"
              className="secondary-action"
              href={DESKTOP_RELEASES_URL}
              rel="noreferrer"
              target="_blank"
            >
              打开下载页
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
            aria-label="关闭获取应用"
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
