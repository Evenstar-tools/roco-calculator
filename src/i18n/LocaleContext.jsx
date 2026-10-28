import { createContext, useContext, useMemo } from "react";
import { translateUi, normalizeLocale } from "./messages.js";
import { localizeType } from "./type-labels.js";

const LocaleContext = createContext({ locale: "zh-CN", typeName: (type) => type, t: (source, values) => translateUi("zh-CN", source, values) });

export function LocaleProvider({ locale = "zh-CN", children }) {
  const selected = normalizeLocale(locale);
  const value = useMemo(() => ({ locale: selected, typeName: (type) => localizeType(type, selected), t: (source, values) => translateUi(selected, source, values) }), [selected]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
