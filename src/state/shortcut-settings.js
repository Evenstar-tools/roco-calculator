export const SHORTCUT_DEFAULTS = { attacker: "a", defender: "d", swap: "x", team: "t", help: "?" };
export const SHORTCUT_LABELS = { attacker: "搜索攻击方", defender: "搜索防御方", swap: "交换攻防配置", team: "打开／关闭队伍", help: "快捷键速查" };
const KEY = "rock-calculator.shortcuts.v1";
export const isShortcutInput = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'));
export function validBindings(bindings) {
  const values = Object.keys(SHORTCUT_DEFAULTS).map(key => bindings?.[key]);
  return values.every(value => typeof value === "string" && /^[a-z?]$/.test(value)) && new Set(values).size === values.length;
}
export function readShortcutSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    return { enabled: value?.enabled !== false, bindings: validBindings(value?.bindings) ? value.bindings : { ...SHORTCUT_DEFAULTS } };
  } catch { return { enabled: true, bindings: { ...SHORTCUT_DEFAULTS } }; }
}
export function writeShortcutSettings(value) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* 当前会话仍生效。 */ }
}
