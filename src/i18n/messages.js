import { commonMessages } from "./common-messages.js";
import { teamMessages } from "./team-messages.js";
import { toolsMessages } from "./tools-messages.js";
import { appMessages } from "./app-messages.js";
import { configurationMessages } from "./configuration-messages.js";
import { skillQueryMessages } from "./skill-query-messages.js";

import { globalUiMessages } from "./global-ui-messages.js";
import { globalComponentsMessages } from "./global-components-messages.js";
import { globalFeaturesMessages } from "./global-features-messages.js";
import { GLOBAL_TOOLS_EXTRA_MESSAGES } from "./global-tools-extra-messages.js";
import { calculatorMessages } from "./calculator-messages.js";

export const UI_MESSAGES = { ...commonMessages, ...teamMessages, ...toolsMessages, ...appMessages, ...configurationMessages, ...skillQueryMessages, ...globalUiMessages, ...globalComponentsMessages, ...globalFeaturesMessages, ...calculatorMessages, ...GLOBAL_TOOLS_EXTRA_MESSAGES };
const missing = new Set();

export function normalizeLocale(locale) { return ["zh-CN", "en", "ja"].includes(locale) ? locale : "zh-CN"; }
export function getMissingUiMessages() { return [...missing]; }
export function clearMissingUiMessages() { missing.clear(); }

export function translateUi(locale, source, values = {}) {
  if (source === null || source === undefined) return "";
  const key = String(source);
  const selected = normalizeLocale(locale);
  let message = key;
  if (selected !== "zh-CN") {
    message = UI_MESSAGES[key]?.[selected];
    if (typeof message !== "string") {
      // ASCII symbols, version strings and values need no translation.
      if (!/[\u3400-\u9fff]/u.test(key)) message = key;
      else { missing.add(selected + ":" + key); message = selected === "ja" ? "翻訳未対応" : "Translation unavailable"; }
    }
  }
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
}
