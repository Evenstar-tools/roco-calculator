import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "@phosphor-icons/react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { fitPickerMenu, getPickerBounds } from "./picker-menu-layout.js";
import { BurstSourceControls, dynamicInputValue, isDynamicInputVisible, TraitInputs } from "./SingleSkillEditor.jsx";
import { HealthInput } from "./HealthInput.jsx";

export function conditionSummary(inputs = [], context = {}) {
  return inputs.filter((input) => isDynamicInputVisible(input, context) && !input.burstSource)
    .flatMap((input) => {
      const value = dynamicInputValue(input, context);
      if (input.type === "boolean") return value ? [input.label] : [];
      if (input.type === "choice") return value !== input.defaultValue
        ? [input.options.find((option) => String(option.value) === String(value))?.label].filter(Boolean) : [];
      if (!Number.isFinite(Number(value)) || Number(value) === 0 || Number(value) === Number(input.defaultValue)) return [];
      return [`${input.label} ${value}${input.suffix ?? ""}`];
    }).join(" · ");
}

export function CompactConditionTrigger({ model, onOpen, expanded = false }) {
  const { t } = useLocale();
  if (!model) return null;
  const summary = conditionSummary(model.inputs, model.context);
  return <button type="button" className="compact-condition-trigger" aria-label={model.triggerLabel}
    aria-haspopup="dialog" aria-expanded={expanded} title={summary || t("条件")}
    onClick={(event) => { event.stopPropagation(); onOpen(model, event.currentTarget); }}>
    <SlidersHorizontal size={13} aria-hidden="true" /><span>{t("条件")}</span>
    {summary ? <small>{summary}</small> : null}
  </button>;
}

export function CompactConditionDialog({ model, anchor, onClose }) {
  const { t } = useLocale();
  const dialogRef = useRef(null);
  const [position, setPosition] = useState({ left: 8, top: 64, maxHeight: 400 });
  useModalFocus(true, dialogRef, onClose);
  const contentKey = model.inputs.filter((input) => isDynamicInputVisible(input, model.context)).map((input) => input.id ?? input.key).join("|");
  useLayoutEffect(() => {
    function positionDialog() {
      if (!anchor?.isConnected || !dialogRef.current) return;
      const bounds = getPickerBounds(anchor);
      const box = anchor.getBoundingClientRect();
      const header = dialogRef.current.querySelector("header");
      const controls = dialogRef.current.querySelector(".compact-condition-dialog__controls");
      const naturalHeight = (header?.offsetHeight ?? 52) + (controls?.scrollHeight ?? 80) + 8;
      const layout = fitPickerMenu(box, bounds, Math.min(naturalHeight, 480), 300);
      const top = layout.placement === "up" ? box.top - layout.maxHeight - 5 : box.bottom + 5;
      const viewport = window.visualViewport;
      setPosition({ left: layout.left, top: Math.max(bounds.top + 8, top), width: layout.width, maxHeight: layout.maxHeight,
        "--condition-viewport-bottom": `${viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0}px`,
        "--condition-viewport-height": `${viewport?.height ?? window.innerHeight}px` });
    }
    positionDialog();
    window.addEventListener("resize", positionDialog);
    window.visualViewport?.addEventListener("resize", positionDialog);
    window.visualViewport?.addEventListener("scroll", positionDialog);
    return () => {
      window.removeEventListener("resize", positionDialog);
      window.visualViewport?.removeEventListener("resize", positionDialog);
      window.visualViewport?.removeEventListener("scroll", positionDialog);
    };
  }, [anchor, contentKey]);
  const normalInputs = model.inputs.filter((input) => !input.burstSource);
  return createPortal(<div className="compact-condition-backdrop" onPointerDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }} onClick={(event) => event.stopPropagation()}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={model.title}
      className="compact-condition-dialog" style={position}>
      <header><h2>{model.title}</h2><button type="button" aria-label={t("关闭条件")} onClick={onClose}><X size={17} aria-hidden="true" /></button></header>
      <div className="compact-condition-dialog__controls">
        {model.healthFields?.map(({ key, label, health, onChange, onPercentChange }) => <div className="compact-condition-health" key={key}>
          <span>{label}</span><HealthInput label={label} currentHp={health.currentHp} maxHp={health.maxHp}
            defaultMode="percent" percentValue={health.percent} onCurrentHpChange={onChange} onPercentChange={onPercentChange} />
        </div>)}
        <TraitInputs inputs={normalInputs} context={model.context} onChange={model.onChange} />
        <BurstSourceControls ariaPrefix={model.triggerLabel} inputs={model.inputs} context={model.context} onChange={model.onChange} />
      </div>
    </section>
  </div>, document.body);
}
