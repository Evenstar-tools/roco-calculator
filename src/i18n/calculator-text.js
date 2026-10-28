import { useMemo } from "react";
import { useLocale } from "./LocaleContext.jsx";
import { UI_MESSAGES, translateUi } from "./messages.js";
import { calculatorMessages } from "./calculator-messages.js";
import { localizeType } from "./type-labels.js";
import * as entityText from "../runtime/global-entity-localization.js";
import { GLOBAL_ENTITY_TEXT } from "../data/global-entity-text.js";

const missing = new Set();
const translatedStrings = Object.fromEntries(["en", "ja"].map((locale) => [locale, new Set([
  ...Object.values(UI_MESSAGES).map((entry) => entry[locale]),
  ...Object.values(GLOBAL_ENTITY_TEXT).flatMap((entries) => Object.values(entries).flatMap((entry) => [entry.name?.[locale], entry.description?.[locale], entry.form?.[locale]])),
])]));
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.keys(calculatorMessages).filter((key) => /\{v\d+\}/.test(key)).map((key) => {
  const names = [];
  const parts = key.split(/(\{v\d+\})/g).map((part) => {
    const match = /^\{(v\d+)\}$/.exec(part);
    if (!match) return escape(part);
    names.push(match[1]);
    return /^(累计状态：|增益：|当前：|本次可得：|使用后可得：)/.test(key) ? "(.*?)" : "([^｜；　·]*?)";
  });
  return { key, names, pattern: new RegExp(`^${parts.join("")}$`, "u"), weight: key.replace(/\{v\d+\}/g, "").length };
}).filter(({ weight }) => weight > 1).sort((a, b) => b.weight - a.weight);

export function getMissingCalculatorTexts() { return [...missing]; }
export function clearMissingCalculatorTexts() { missing.clear(); }

/** Display only: calculation objects and saved identifiers never pass through this function. */
export function translateCalculatorText(source, locale = "zh-CN", values, depth = 0) {
  if (typeof source !== "string") return source;
  const render = (key, substitutions = {}) => translateUi(locale, key,
    Object.fromEntries(Object.entries(substitutions).map(([name, value]) =>
      [name, typeof value === "string" && depth < 8 ? translateCalculatorText(value, locale, undefined, depth + 1) : value])));
  if (values) return render(source, values);
  if (locale === "zh-CN" || !source || depth > 8) return source;
  if (UI_MESSAGES[source]) return render(source);
  if (translatedStrings[locale]?.has(source)) return source;
  if (!/[\u3400-\u9fff]/u.test(source)) return source;
  const translatedType = localizeType(source, locale);
  if (translatedType !== source || localizeType(source, "en") !== source) return translatedType;
  const matches = [...new Set(["skill", "trait", "spirit"].map((kind) =>
    entityText.getGlobalEntityTextByName?.(kind, source, "name", locale, "") ?? "").filter(Boolean))];
  if (matches.length === 1) return matches[0];
  const trimmed = source.trim();
  if (trimmed !== source && UI_MESSAGES[trimmed]) return source.replace(trimmed, render(trimmed));
  for (const { key, names, pattern } of patterns) {
    const match = pattern.exec(source);
    if (match) return render(key, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
  }
  // Calculation summaries are explicitly separated clauses; translate each clause independently.
  for (const separator of ["　", "｜", " · ", " ＋ ", "；", " → ", "·", "、"]) {
    if (source.includes(separator)) {
      return source.split(separator).map((part) => translateCalculatorText(part, locale, undefined, depth + 1)).join(separator);
    }
  }
  missing.add(`${locale}:${source}`);
  return source;
}

export function useCalculatorLocale() {
  const { locale } = useLocale();
  return useMemo(() => ({
    locale,
    tc: (source, values) => translateCalculatorText(source, locale, values),
    typeLabel: (type) => localizeType(type, locale),
    markLabel: (name) => locale === "zh-CN" ? name : translateCalculatorText(name + "印记", locale),
    entityName: (kind, entity) => locale === "zh-CN" ? entity?.displayName ?? entity?.fullName ?? entity?.name ?? ""
      : entityText.getGlobalEntityText(kind, entity, "name", locale,
          entityText.getGlobalEntityTextByName(kind, entity?.fullName ?? entity?.name, "name", locale, entity?.fullName ?? entity?.name ?? "")),
    entityDescription: (kind, entity) => locale === "zh-CN" ? entity?.description ?? ""
      : entityText.getGlobalEntityText(kind, entity, "description", locale, entity?.description ?? ""),
  }), [locale]);
}
