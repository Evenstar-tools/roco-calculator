import { useEffect, useRef } from "react";
import { SHORTCUT_LABELS } from "../state/shortcut-settings.js";

const SHORTCUT_ROWS = [
  ["Tab", "模式切换", "点按切换精简／具体；按住临时切换，松开返回，期间修改会保留。"],
  ["Ctrl+Z", "撤回", "撤回一步；按住不放会连续撤回，松开立即停止。"],
  ["Ctrl+Alt+1／2", "萌化配置保留", "分别切换攻击方／防御方；刷新保留，新开页面重置。高阶配置萌化后往返可保留。"],
  ["Ctrl+Shift+Z", "重做", "重做上一步撤回的配置。"],
  ["1～6", "队伍成员", "在队伍面板中选择对应编号的成员。"],
  ["Esc", "关闭当前层", "逐层关闭菜单或弹窗，不清空当前配置。"],
];

export function ShortcutDialog({ settings, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.querySelector("button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function keyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [...ref.current.querySelectorAll("button,input")];
    if (!nodes.length) return;
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0].focus();
    }
  }

  return (
    <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="shortcut-dialog" role="dialog" aria-modal="true" aria-label="快捷键一览" ref={ref} onKeyDown={keyDown}>
        <header className="shortcut-dialog__header">
          <div>
            <span className="shortcut-dialog__eyebrow">帮助 · 操作说明</span>
            <h2>快捷键一览</h2>
          </div>
          <button className="shortcut-dialog__close" type="button" onClick={onClose}>关闭</button>
        </header>

        <div className="shortcut-dialog__content">
          <label className="shortcut-dialog__toggle">
            <span>
              <strong>启用计算器快捷键</strong>
              <small>输入框保留原生操作，萌化组合键除外；弹窗内不触发。</small>
            </span>
            <input type="checkbox" checked={settings.enabled} onChange={event => onChange({ ...settings, enabled: event.target.checked })} />
          </label>

          <section className="shortcut-dialog__section" aria-labelledby="shortcut-dialog-basic">
            <div className="shortcut-dialog__section-title" id="shortcut-dialog-basic">基础操作</div>
            <dl className="shortcut-dialog__table">
              {SHORTCUT_ROWS.map(([key, title, description]) => (
                <div key={key}>
                  <dt><kbd>{key}</kbd><span>{title}</span></dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="shortcut-dialog__section" aria-labelledby="shortcut-dialog-entry">
            <div className="shortcut-dialog__section-title" id="shortcut-dialog-entry">页面入口</div>
            <div className="shortcut-dialog__bindings">
              {Object.entries(SHORTCUT_LABELS).map(([key, label]) => (
                <div className="shortcut-dialog__binding" key={key}>
                  <span>{label}</span>
                  <kbd>{settings.bindings[key]}</kbd>
                </div>
              ))}
            </div>
            <p className="shortcut-dialog__note">页面入口使用当前快捷键；按键显示为只读，避免误以为可以在这里改键。</p>
          </section>
        </div>
      </section>
    </div>
  );
}
