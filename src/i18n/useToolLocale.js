import { useMemo } from "react";
import { useLocale } from "./LocaleContext.jsx";
import { UI_MESSAGES, translateUi } from "./messages.js";
import { getGlobalEntityText } from "../runtime/global-entity-localization.js";
import { GLOBAL_ENTITY_TEXT } from "../data/global-entity-text.js";
import { localizeType } from "./type-labels.js";
import { ELEMENT_TYPES } from "../domain/type-chart.js";

const formatters = new Map();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// This formatter is presentation-only. Engine objects, IDs and canonical Chinese
// mechanism keys are never replaced; saved traces can be rendered in any locale.
export function localizeToolText(source, locale, values = {}) {
  if (source === null || source === undefined) return "";
  if (typeof source !== "string") return source;
  if (locale === "zh-CN") return translateUi(locale, source, values);
  if (locale === "ja" && /[\u3040-\u30ff]/.test(source) && !UI_MESSAGES[source]?.[locale]) return source;
  let format = formatters.get(locale);
  if (!format) {
    const entities = new Map();
    for (const entries of Object.values(GLOBAL_ENTITY_TEXT)) for (const entry of Object.values(entries)) {
      if (!entry.available) continue;
      if (entry.name?.["zh-CN"] && entry.name?.[locale]) entities.set(entry.name["zh-CN"], entry.name[locale]);
      if (entry.description?.["zh-CN"] && entry.description?.[locale]) entities.set(entry.description["zh-CN"], entry.description[locale]);
    }
    // Exact project identities take precedence over shared native species names.
    for (const [kind, entries] of Object.entries(GLOBAL_ENTITY_TEXT)) for (const [id, entry] of Object.entries(entries)) {
      if (entry.available && entry.projectName && entry.name?.[locale]) entities.set(entry.projectName, kind === "spirit" ? getGlobalEntityText(kind, id, "fullName", locale) : entry.name[locale]);
    }
    for (const type of ELEMENT_TYPES) entities.set(type, localizeType(type, locale));
    const patterns = Object.keys(UI_MESSAGES).filter((key) => key.includes("{") && key.replace(/\{[^}]+\}/g, "").trim().length > 0).map((key) => {
      const names = [...key.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      const parts = key.split(/\{[^}]+\}/g);
      return { key, names, matcher: new RegExp(`^${parts.map(escape).join("(.+?)")}$`), weight: parts.join("").length };
    }).sort((a, b) => b.weight - a.weight);
    const fragments = new Map([...entities, ...Object.entries(UI_MESSAGES).filter(([key, entry]) => !key.includes("{") && entry[locale]).map(([key, entry]) => [key, entry[locale]])]);
    // Single-character element labels are handled by typeName at their own UI sites.
    const keys = [...fragments.keys()].filter(key => key.length > 1 && /[\u3400-\u9fff]/.test(key)).sort((a, b) => b.length - a.length);
    format = { entities, patterns, fragments, matcher: new RegExp(keys.map(escape).join("|"), "g") };
    formatters.set(locale, format);
  }
  const localValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? localizeToolText(value, locale) : value]));
  if (UI_MESSAGES[source]?.[locale]) return translateUi(locale, source, localValues);
  if (format.entities.has(source)) return format.entities.get(source);
  for (const pattern of format.patterns) {
    const match = source.match(pattern.matcher);
    if (!match || match.slice(1).includes(source)) continue;
    const captures = Object.fromEntries(pattern.names.map((name, index) => [name, localizeToolText(match[index + 1], locale)]));
    return translateUi(locale, pattern.key, captures);
  }
  return source.replace(/\{([^}]+)\}/g, (match, key) => localValues[key] ?? match).replace(format.matcher, match => format.fragments.get(match));
}

export function useToolLocale() {
  const context = useLocale();
  const t = useMemo(() => (source, values) => localizeToolText(source, context.locale, values), [context.locale]);
  return { ...context, t };
}
