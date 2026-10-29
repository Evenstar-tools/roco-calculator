import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "@phosphor-icons/react";
import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { fitPickerMenu, getPickerBounds } from "./picker-menu-layout.js";
import { BurstSourceControls, dynamicInputValue, isDynamicInputVisible, TraitInputs } from "./SingleSkillEditor.jsx";
import { HealthInput } from "./HealthInput.jsx";
import { UsageCountActions } from "./SkillUsageSummary.jsx";
import { skillUsageDisplay } from "../domain/skill-presentation.js";
import { describeResolution } from "./SingleSkillEditor.jsx";

export function conditionSummary(inputs = [], context = {}, t = (value) => value) {
  return inputs.filter((input) => isDynamicInputVisible(input, context) && !input.burstSource)
    .flatMap((input) => {
      const value = dynamicInputValue(input, context);
      if (input.type === "boolean") return value ? [t(input.label)] : [];
      if (input.type === "choice") return [input.options.find((option) => String(option.value) === String(value))?.label].filter(Boolean).map((label) => t(label));
      if (!Number.isFinite(Number(value)) || Number(value) === 0 || Number(value) === Number(input.defaultValue)) return [];
      return [`${t(input.label)} ${value}${t(input.suffix ?? "")}`];
    }).join(" · ");
}

export function CompactConditionTrigger({ model, onOpen, expanded = false }) {
  const { t } = useLocale();
  if (!model) return null;
  const summary = conditionSummary(model.inputs, model.context, t);
  return <button type="button" className="compact-condition-trigger" aria-label={t(model.triggerLabel)}
    aria-haspopup="dialog" aria-expanded={expanded} title={summary || t(model.triggerText ?? "条件")}
    onClick={(event) => { event.stopPropagation(); onOpen(model, event.currentTarget); }}>
    <SlidersHorizontal size={13} aria-hidden="true" /><span>{t(model.triggerText ?? "条件")}</span>
    {summary ? <small>{summary}</small> : null}
  </button>;
}

export function CompactSkillState({ result, nextHint, details = false }) {
  const { t } = useLocale();
  const display = skillUsageDisplay(result?.usageSummary, nextHint);
  const status = display.status.replace(/^累计状态：/, "").replace(/已使用×(\d+)/, "已用 $1 次")
    .replace(/已记录×(\d+)/, "已记录 $1 次").replace(/　增益：|　当前：/g, " · ");
  const localizedStatus = status.split(" · ").map((part) => t(part)).join(" · ");
  if (!status && !(details && (display.next || display.recorded.length))) return null;
  return <div className="compact-skill-state">
    {status ? <p title={localizedStatus}>{localizedStatus}</p> : null}
    {details && display.next ? <p>{t(display.next)}</p> : null}
    {details && display.recorded.length ? <p>{t("仅记录：{items}", { items: display.recorded.join(" · ") })}</p> : null}
  </div>;
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
      const footer = dialogRef.current.querySelector("footer");
      const naturalHeight = (header?.offsetHeight ?? 52) + (controls?.scrollHeight ?? 80) + (footer?.offsetHeight ?? 0) + 8;
      const layout = fitPickerMenu(box, bounds, Math.min(naturalHeight, 480), 300);
      const top = layout.placement === "up" ? box.top - layout.maxHeight - 5 : box.bottom + 5;
      const viewport = window.visualViewport;
      setPosition({ left: layout.left, top: Math.max(bounds.top + 8, top), width: layout.width, maxHeight: layout.maxHeight,
        "--condition-viewport-bottom": `${viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0}px`,
        "--condition-viewport-height": `${viewport?.height ?? window.innerHeight}px` });
    }
    positionDialog();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(positionDialog);
    const controls = dialogRef.current?.querySelector(".compact-condition-dialog__controls");
    if (controls) observer?.observe(controls);
    dialogRef.current?.addEventListener("toggle", positionDialog, true);
    const dialog = dialogRef.current;
    window.addEventListener("resize", positionDialog);
    window.visualViewport?.addEventListener("resize", positionDialog);
    window.visualViewport?.addEventListener("scroll", positionDialog);
    return () => {
      window.removeEventListener("resize", positionDialog);
      observer?.disconnect();
      dialog?.removeEventListener("toggle", positionDialog, true);
      window.visualViewport?.removeEventListener("resize", positionDialog);
      window.visualViewport?.removeEventListener("scroll", positionDialog);
    };
  }, [anchor, contentKey]);
  const normalInputs = model.inputs.filter((input) => !input.burstSource);
  const resolutionHint = model.resolutionHint ?? describeResolution(model.result);
  return createPortal(<div className="compact-condition-backdrop" onPointerDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }} onClick={(event) => event.stopPropagation()}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={t(model.title)}
      className="compact-condition-dialog" style={position}>
      <header><h2>{t(model.title)}</h2><button type="button" aria-label={t("关闭条件")} onClick={onClose}><X size={17} aria-hidden="true" /></button></header>
      <div className="compact-condition-dialog__controls">
        {model.healthFields?.map(({ key, label, health, onChange, onPercentChange }) => <div className="compact-condition-health" key={key}>
          <span>{t(label)}</span><HealthInput label={t(label.replace(/生命$/, ""))} currentHp={health.currentHp} maxHp={health.maxHp}
            defaultMode="percent" percentValue={health.percent} onCurrentHpChange={onChange} onPercentChange={onPercentChange} />
        </div>)}
        {normalInputs.map((input) => <div className="compact-condition-field" key={input.id ?? input.key}>
          <TraitInputs inputs={[input]} context={model.context} onChange={model.onChange} />
          {isDynamicInputVisible(input, model.context) ? <UsageCountActions input={input} value={dynamicInputValue(input, model.context)}
            onChange={(value) => model.onChange(input.id ?? input.key, value)} /> : null}
        </div>)}
        <BurstSourceControls ariaPrefix={t(model.triggerLabel)} inputs={model.inputs} context={model.context} onChange={model.onChange} />
        <CompactSkillState result={model.result} nextHint={model.nextHint} details />
        {resolutionHint ? <p className="compact-condition-formula">{t(resolutionHint)}</p> : null}
        {model.description ? <details className="compact-condition-description" open={model.triggerText === "详情"}>
          <summary>{t("技能说明")}</summary><p>{t(model.description)}</p>
        </details> : null}
        {model.notice ? <p className="compact-condition-notice">{t(model.notice)}</p> : null}
      </div>
      {model.action ? <footer>
        {model.action.hint ? <small>{t(model.action.hint)}</small> : null}
        <button type="button" disabled={model.action.disabled} onClick={model.action.onApply}>{t(model.action.label)}</button>
      </footer> : null}
    </section>
  </div>, document.body);
}
