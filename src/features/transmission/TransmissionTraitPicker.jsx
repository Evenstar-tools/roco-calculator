import { CaretDown, Check } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { usePickerMenuLayout } from "../../components/picker-menu-layout.js";

export default function TransmissionTraitPicker({ options, value, placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const menuId = useId();
  const selected = options.find((option) => option.name === value);
  usePickerMenuLayout({ open, anchorRef: root, menuRef: menu, maxHeight: 352, minWidth: 248 });

  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function show(last = false) {
    const index = options.findIndex((option) => option.name === value && !option.disabled);
    setActive(index >= 0 ? index : last ? options.findLastIndex((option) => !option.disabled) : options.findIndex((option) => !option.disabled));
    setOpen(true);
  }
  function choose(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.name);
    setOpen(false);
    trigger.current?.focus();
  }
  function navigate(event) {
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); return;
    }
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!open) { show(event.key === "ArrowUp" || event.key === "End"); return; }
      const available = options.flatMap((option, index) => option.disabled ? [] : [index]);
      const current = available.indexOf(active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
        : Math.max(0, Math.min(available.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
      setActive(available[next] ?? -1);
    } else if (open && ["Enter", " "].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); choose(active);
    }
  }

  return <div className="transmission-trait-picker" ref={root}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" role="combobox" aria-label="传动特性" value={value}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-activedescendant={open && active >= 0 ? `${menuId}-${active}` : undefined}
      className="transmission-trait-trigger" ref={trigger} title={selected?.owner?.fullName}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={navigate}>
      {selected?.owner?.assetUrl && <img src={selected.owner.assetUrl} alt="" width="24" height="24" />}
      <span>{selected?.label ?? placeholder}</span><CaretDown size={14} aria-hidden="true" />
    </button>
    {open && <ul id={menuId} ref={menu} className="transmission-trait-options" role="listbox" aria-label="传动特性选项">
      {options.map((option, index) => <li key={option.id} id={`${menuId}-${index}`} role="option"
        aria-label={option.label} aria-selected={option.name === value} aria-disabled={option.disabled}
        data-active={active === index} title={option.owner?.fullName}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
        {option.owner?.assetUrl ? <img src={option.owner.assetUrl} alt={option.owner.fullName} width="28" height="28" /> : <span className="transmission-trait-portrait-placeholder" aria-hidden="true" />}
        <span>{option.label}</span>{option.name === value && <Check size={16} aria-hidden="true" />}
      </li>)}
    </ul>}
  </div>;
}
