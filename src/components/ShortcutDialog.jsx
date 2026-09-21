import { useEffect, useRef, useState } from "react";
import { SHORTCUT_DEFAULTS, SHORTCUT_LABELS, validBindings } from "../state/shortcut-settings.js";

export function ShortcutDialog({ settings, onChange, onClose }) {
  const ref = useRef(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.querySelector("button").focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  function keyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const nodes = [...ref.current.querySelectorAll("button,input")];
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
  }
  return <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-dialog shortcut-dialog" role="dialog" aria-modal="true" aria-label="快捷键" ref={ref} onKeyDown={keyDown}>
      <header><h2>快捷键</h2><button type="button" onClick={onClose}>关闭</button></header>
      <label><input type="checkbox" checked={settings.enabled} onChange={event => onChange({ ...settings, enabled: event.target.checked })} />启用计算器快捷键</label>
      <p>输入时保留原生操作；弹窗内不触发主页面命令。</p>
      <dl><div><dt>Tab</dt><dd>点按切换精简／具体；按住临时切换，松开返回，修改保留</dd></div><div><dt>Ctrl+Z</dt><dd>撤回一步；按住连续撤回</dd></div><div><dt>Ctrl+Shift+Z</dt><dd>重做一步</dd></div><div><dt>1～6</dt><dd>队伍内选择对应成员</dd></div><div><dt>Esc</dt><dd>逐层关闭，不清空配置</dd></div></dl>
      {Object.entries(SHORTCUT_LABELS).map(([key, label]) => <label className="shortcut-binding" key={key}><span>{label}</span><input aria-label={`${label}快捷键`} value={settings.bindings[key]} maxLength={1} onChange={event => {
        const bindings = { ...settings.bindings, [key]: event.target.value.toLowerCase() };
        if (!validBindings(bindings)) { setError("使用不重复的单个英文字母或 ?；固定组合键和数字不参与改键。"); return; }
        setError(""); onChange({ ...settings, bindings });
      }} /></label>)}
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={() => { setError(""); onChange({ enabled: true, bindings: { ...SHORTCUT_DEFAULTS } }); }}>恢复默认</button></div>
    </section>
  </div>;
}
