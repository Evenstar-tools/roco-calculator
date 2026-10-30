import { useEffect, useEffectEvent, useState } from "react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";

export function PresetUpdateNotice({ loadPopularConfigLibrary, onOpen }) {
  const { serverId } = useRuntime();
  const { t } = useLocale();
  const [notice, setNotice] = useState(null);
  const check = useEffectEvent((signal) => loadPopularConfigLibrary({ signal }));

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    // Reuse the import preview: only additions and safe preset updates are actionable.
    Promise.resolve().then(() => check(controller.signal)).then((parsed) => {
      if (controller.signal.aborted) return;
      const count = (parsed?.preview?.added ?? 0) + (parsed?.preview?.updated ?? 0);
      if (count <= 0) return;
      // 只有新增（如首次使用）时不是“更新”，按导入表述。
      setNotice({ serverId, count, importOnly: !(parsed?.preview?.updated > 0) });
      timer = setTimeout(() => setNotice(null), 2000);
    }).catch(() => {}); // A background check must not interrupt calculation or imply an update.
    return () => { controller.abort(); clearTimeout(timer); };
  }, [serverId]);

  if (!notice || notice.serverId !== serverId) return null;
  return (
    <div className="preset-update-notice" role="status">
      <span>{t(notice.importOnly ? "常用精灵配置可导入（{count}）" : "常用精灵配置可更新（{count}）", { count: notice.count })}</span>
      <button className="secondary-action" type="button" onClick={() => {
        setNotice(null);
        onOpen();
      }}>{t("查看")}</button>
    </div>
  );
}
