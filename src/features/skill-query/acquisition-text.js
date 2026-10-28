import { localizeToolText } from "../../i18n/useToolLocale.js";
import { localizeType } from "../../i18n/type-labels.js";
import { getGlobalEntityTextByName } from "../../runtime/global-entity-localization.js";
import { acquisitionSummary } from "./query-model.js";

// Keep canonical acquisition strings for filtering; format only at the display boundary.
export function localizeAcquisitionMethods(methods = [], locale = "zh-CN", { summary = false } = {}) {
  if (locale === "zh-CN") return summary ? acquisitionSummary(methods) : methods.join(" / ");
  const t = (text, values) => localizeToolText(text, locale, values);
  if (!methods.length) return t("途径待补充");
  return [...new Set(methods.map((source) => {
    const text = source.replace(/^解锁[：:]\s*/u, "");
    let match;
    if ((match = /^Lv\.\s*(\d+)$/iu.exec(text))) return t("等级习得：Lv.{level}", { level: match[1] });
    if ((match = /^(.+)系血脉$/u.exec(text))) return t("{type}系血脉", { type: localizeType(match[1], locale) });
    if ((match = /^\[技能石\](.+)$/u.exec(text))) return t("技能石：{name}", { name: getGlobalEntityTextByName("skill", match[1], "name", locale, t(match[1])) });
    if ((match = /^（传说）合体[：:]\s*(.+)$/u.exec(text))) return t("传说合体：{name}", { name: getGlobalEntityTextByName("spirit", match[1], "name", locale, t(match[1])) });
    return t(text);
  }))].join(" / ");
}
