import { Toolbox as ToolboxIcon, Shapes, MagnifyingGlass, Lightning, Gear, Speedometer, Shield } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const groups = [
  ["查询", [["types", "属性查询", Shapes], ["skills", "技能检索", MagnifyingGlass]]],
  ["计算", [["deer", "电鹿斩杀线", Lightning], ["transmission", "传动计算器", Gear]]],
  ["排行", [["speed", "速度线排行", Speedometer], ["durability", "耐久排行", Shield]]],
];

export function Toolbox({ actions, onOpen, activeTool }) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(60);
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 760);
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth <= 760);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const trigger = useRef(null);
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("button")?.focus();
    const close = (event) => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.key === "Tab") {
        const buttons = [...panel.current.querySelectorAll("button:not(:disabled)")];
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
      }
    };
    const resize = () => setTop(trigger.current?.getBoundingClientRect().bottom + 6);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); window.removeEventListener("resize", resize); };
  }, [open]);
  return <>
    <button type="button" disabled={!actions} className="team-action toolbox-trigger" aria-label="工具箱" title="工具箱" aria-expanded={open} aria-controls="toolbox-panel" ref={trigger}
      onClick={() => { if (!open) { onOpen?.(); setTop(trigger.current.getBoundingClientRect().bottom + 6); } setOpen(!open); }}>
      <ToolboxIcon size={19} aria-hidden="true" /><span style={{ display: narrow ? "none" : undefined }}>工具箱</span>
    </button>
    {open && createPortal(<nav id="toolbox-panel" aria-label="工具箱" className="app-menu" ref={panel}
      style={{ top, right: 8, width: 320, maxWidth: "calc(100vw - 16px)", maxHeight: `calc(100dvh - ${top + 8}px)` }}>
      {groups.map(([label, entries]) => <section key={label} aria-label={label}>
        <div className="app-menu__group-label">{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
          {entries.map(([id, title, Icon]) => <button key={id} type="button" aria-current={activeTool === id ? "true" : undefined} disabled={!actions?.[id]}
            className={activeTool === id ? "app-menu__primary" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}
            onClick={() => { setOpen(false); trigger.current?.focus(); actions[id](); }}><Icon size={18} aria-hidden="true" />{title}</button>)}
        </div>
      </section>)}
    </nav>, document.body)}
  </>;
}
