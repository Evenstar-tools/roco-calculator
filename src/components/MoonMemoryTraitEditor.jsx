import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useId, useMemo, useRef, useState } from "react";
import { usePickerMenuLayout } from "./picker-menu-layout.js";
import {
  createMoonMemoryTraitSearchIndex,
  getMoonMemorySelectedTraits,
  getMoonMemoryTraitControls,
  hasNativeMoonMemoryTrait,
  searchMoonMemoryTraitOptions,
} from "../domain/moon-memory-trait-options.js";
import { MOON_MEMORY_TRAIT_LIMIT } from "../domain/moon-memory.js";

function controlDomId(prefix, sideKey, traitId, canonicalKey) {
  return [prefix, sideKey, traitId, canonicalKey]
    .join("-")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

function controlValue(values, control) {
  return Object.hasOwn(values, control.canonicalKey)
    ? values[control.canonicalKey]
    : control.defaultValue;
}

function isControlVisible(control, controls, values) {
  const condition = control.visibleWhen ?? control.when;
  if (!condition) return true;
  const conditionKey = condition.contextKey ?? condition.key ?? condition.id;
  const owner = controls.find(
    (candidate) =>
      candidate.contextKey === conditionKey ||
      candidate.key === conditionKey ||
      candidate.id === conditionKey,
  );
  const value = owner
    ? controlValue(values, owner)
    : condition.defaultValue;
  return value === condition.equals;
}

function clampNumber(control, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return control.defaultValue ?? 0;
  return Math.min(
    control.max ?? Number.POSITIVE_INFINITY,
    Math.max(control.min ?? Number.NEGATIVE_INFINITY, numeric),
  );
}

function TraitControls({
  idPrefix,
  onValueChange,
  sideKey,
  trait,
  values,
}) {
  const { tc } = useCalculatorLocale();
  const controls = getMoonMemoryTraitControls(trait);
  const visibleControls = controls.filter((control) =>
    !control.hidden && isControlVisible(control, controls, values),
  );
  if (visibleControls.length === 0) return null;

  return (
    <div className="moon-memory-trait-editor__controls">
      {visibleControls.map((control) => {
        const inputId = controlDomId(
          idPrefix,
          sideKey,
          trait.id,
          control.canonicalKey,
        );
        const label = `${trait.displayName ?? trait.name} · ${control.label}`;
        const value = controlValue(values, control);
        if (control.action === "s5-stat-turn-end") return (
          <button className="trait-turn-end" key={`${trait.id}:${control.canonicalKey}`} type="button"
            onClick={() => onValueChange?.(trait.id, control.canonicalKey, true)}>{tc(control.label)}</button>
        );
        if (control.type === "choice") {
          return (
            <label key={`${trait.id}:${control.canonicalKey}`} htmlFor={inputId}>
              <span>{tc(control.label)}</span>
              <select
                aria-label={tc(label)}
                id={inputId}
                onChange={(event) =>
                  onValueChange?.(
                    trait.id,
                    control.canonicalKey,
                    event.target.value,
                  )
                }
                value={value ?? ""}
              >
                {(control.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {tc(option.label)}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (control.type === "boolean") {
          return (
            <label
              className="moon-memory-trait-editor__toggle"
              htmlFor={inputId}
              key={`${trait.id}:${control.canonicalKey}`}
            >
              <input
                aria-label={tc(label)}
                checked={Boolean(value)}
                id={inputId}
                onChange={(event) =>
                  onValueChange?.(
                    trait.id,
                    control.canonicalKey,
                    event.target.checked,
                  )
                }
                type="checkbox"
              />
              <span>{tc(control.label)}</span>
            </label>
          );
        }
        return (
          <label key={`${trait.id}:${control.canonicalKey}`} htmlFor={inputId}>
            <span>{tc(control.label)}</span>
            <span className="moon-memory-trait-editor__number">
              <input
                aria-label={tc(label)}
                id={inputId}
                inputMode="numeric"
                max={control.max}
                min={control.min}
                onChange={(event) => {
                  if (event.target.value === "") return;
                  onValueChange?.(
                    trait.id,
                    control.canonicalKey,
                    clampNumber(control, event.target.value),
                  );
                }}
                step={control.step ?? 1}
                type="number"
                value={value ?? ""}
              />
              {control.suffix ? <small>{tc(control.suffix)}</small> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function MoonMemoryTraitEditor({
  onAdd,
  onRemove,
  onValueChange,
  side = {},
  sideKey = "attacker",
  snapshot,
  spirit,
}) {
  const { tc, entityName, entityDescription } = useCalculatorLocale();
  const listboxId = useId();
  const controlIdPrefix = useId();
  const detailId = useId();
  const [expandedTraitId, setExpandedTraitId] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const pickerRef = useRef(null);
  const optionsRef = useRef(null);
  const searchIndex = useMemo(
    () => createMoonMemoryTraitSearchIndex(snapshot).map((option) => {
      const localizedLabel = `${tc(option.spiritName)} · ${entityName("trait", option.trait)}`;
      return { ...option, label: localizedLabel,
        searchFields: [...option.searchFields, localizedLabel.normalize("NFKC").toLowerCase().replace(/\s+/g, "")] };
    }),
    [snapshot, tc, entityName],
  );
  const options = useMemo(
    () => searchMoonMemoryTraitOptions(searchIndex, query),
    [query, searchIndex],
  );
  const selectedTraits = useMemo(
    () => getMoonMemorySelectedTraits(snapshot, side),
    [side, snapshot],
  );
  const acquiredTraitIds = useMemo(
    () => new Set(side.acquiredTraitIds ?? []),
    [side.acquiredTraitIds],
  );
  const nativeTraitIds = useMemo(
    () => new Set(spirit?.traitIds ?? []),
    [spirit?.traitIds],
  );
  usePickerMenuLayout({ open: open && options.length > 0, anchorRef: pickerRef, menuRef: optionsRef, maxHeight: 224, contentKey: `${query}-${options.length}` });
  if (!hasNativeMoonMemoryTrait(snapshot, spirit)) return null;

  const isAtTraitLimit = selectedTraits.length >= MOON_MEMORY_TRAIT_LIMIT;
  const expanded = selectedTraits.find(({ trait }) => trait.id === expandedTraitId);
  const containsOption = (ids, option) => (option.equivalentTraitIds ?? [option.traitId]).some(id => ids.has(id));
  const isOptionDisabled = (option) =>
    isAtTraitLimit ||
    containsOption(acquiredTraitIds, option) ||
    containsOption(nativeTraitIds, option);
  const addOption = (option) => {
    if (!option || isOptionDisabled(option)) return;
    onAdd?.(option.traitId);
    setActiveIndex(-1);
    setOpen(false);
    setQuery("");
  };

  return (
    <section className="moon-memory-trait-editor">
      <header>
        <strong>{tc("铭记于月亮")}</strong>
        <span>{tc("已吞噬 ")}{tc(selectedTraits.length)}/{tc(MOON_MEMORY_TRAIT_LIMIT)}
        </span>
      </header>
      {!isAtTraitLimit ? <div className="moon-memory-trait-editor__picker" ref={pickerRef}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <label>
          <span className="sr-only">{tc("搜索精灵或特性")}</span>
          <span className="moon-memory-trait-editor__search">
            <MagnifyingGlass aria-hidden="true" size={17} />
            <input
              aria-autocomplete="list"
              aria-activedescendant={
                open && activeIndex >= 0
                  ? `${listboxId}-option-${activeIndex}`
                  : undefined
              }
              aria-controls={listboxId}
              aria-expanded={open && options.length > 0}
              aria-label={tc("搜索已吞噬特性")}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(-1);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(true);
                  setActiveIndex((current) =>
                    options.length === 0
                      ? -1
                      : Math.min(current + 1, options.length - 1),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setOpen(true);
                  setActiveIndex((current) =>
                    options.length === 0
                      ? -1
                      : current <= 0
                        ? options.length - 1
                        : current - 1,
                  );
                } else if (event.key === "Enter" && activeIndex >= 0) {
                  event.preventDefault();
                  addOption(options[activeIndex]);
                } else if (event.key === "Escape") {
                  setActiveIndex(-1);
                  setOpen(false);
                }
              }}
              placeholder={tc("搜索精灵或特性")}
              role="combobox"
              type="search"
              value={query}
            />
          </span>
        </label>
        {open && options.length > 0 ? (
          <ul id={listboxId} role="listbox" ref={optionsRef} tabIndex={-1}
            onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); pickerRef.current?.querySelector("input")?.focus(); setOpen(false); } }}>
            {options.map((option, index) => {
              const alreadyAdded = containsOption(acquiredTraitIds, option);
              const alreadyOwned = containsOption(nativeTraitIds, option);
              const disabled = alreadyAdded || alreadyOwned || isAtTraitLimit;
              return (
                <li
                  aria-disabled={disabled}
                  aria-selected={index === activeIndex}
                  id={`${listboxId}-option-${index}`}
                  key={option.key}
                  onClick={() => addOption(option)}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                >
                  <strong>{tc(option.label)}</strong>
                  <small>
                    {alreadyAdded ? tc("已添加") : alreadyOwned ? tc("已拥有") : isAtTraitLimit ? tc("已达上限") : tc(option.support.label)}
                  </small>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div> : null}
      {selectedTraits.length > 0 ? (
        <ul aria-label={tc("已吞噬特性")} className="moon-memory-trait-editor__selected">
          {selectedTraits.map(({ support, trait }) => {
            const name = trait.displayName ?? trait.name;
            return (
              <li aria-label={tc(`${name}，${support.label}`)} data-expanded={expanded?.trait.id === trait.id} key={trait.id}>
                <button
                  aria-controls={detailId}
                  aria-expanded={expanded?.trait.id === trait.id}
                  aria-label={tc("查看{v0}条件与效果", { v0: name })}
                  className="moon-memory-trait-editor__chip"
                  onClick={() => setExpandedTraitId(expanded?.trait.id === trait.id ? null : trait.id)}
                  title={tc(`${name} · ${support.label}`)}
                  type="button"
                >
                  <strong>{tc(name)}</strong>
                  {support.id !== "supported" ? (
                    <small className="moon-memory-trait-editor__support" data-status={support.id}>{tc(support.label)}</small>
                  ) : null}
                </button>
                <button
                  aria-label={tc("删除已吞噬特性{v0}", { v0: name })}
                  className="moon-memory-trait-editor__remove"
                  onClick={() => {
                    if (expandedTraitId === trait.id) setExpandedTraitId(null);
                    onRemove?.(trait.id);
                  }}
                  title={tc("删除{v0}", { v0: name })}
                  type="button"
                >
                  <X aria-hidden="true" size={15} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {expanded ? (
        <div aria-label={tc("特性条件与效果")} className="moon-memory-trait-editor__detail" id={detailId} role="region">
          <div className="moon-memory-trait-editor__detail-heading">
            <strong>{entityName("trait", expanded.trait)}</strong>
            <small className="moon-memory-trait-editor__support" data-status={expanded.support.id}>{tc(expanded.support.label)}</small>
          </div>
          <p>{entityDescription("trait", expanded.trait)}</p>
          <TraitControls
            idPrefix={controlIdPrefix}
            onValueChange={onValueChange}
            sideKey={sideKey}
            trait={expanded.trait}
            values={side.acquiredTraitValues?.[expanded.trait.id] ?? {}}
          />
        </div>
      ) : null}
      {selectedTraits.length > 0 ? (
        <button
          aria-controls={detailId}
          aria-expanded={Boolean(expanded)}
          className="moon-memory-trait-editor__details-toggle"
          onClick={() => setExpandedTraitId(expanded ? null : selectedTraits[0].trait.id)}
          type="button"
        >{tc("条件与效果 ")}<CaretDown aria-hidden="true" size={12} />
          <small>{tc("收起不影响计算")}</small>
        </button>
      ) : null}
    </section>
  );
}
