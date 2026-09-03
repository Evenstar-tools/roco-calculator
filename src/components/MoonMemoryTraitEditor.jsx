import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
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
  const controls = getMoonMemoryTraitControls(trait);
  const visibleControls = controls.filter((control) =>
    isControlVisible(control, controls, values),
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
        if (control.type === "choice") {
          return (
            <label key={`${trait.id}:${control.canonicalKey}`} htmlFor={inputId}>
              <span>{control.label}</span>
              <select
                aria-label={label}
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
                    {option.label}
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
                aria-label={label}
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
              <span>{control.label}</span>
            </label>
          );
        }
        return (
          <label key={`${trait.id}:${control.canonicalKey}`} htmlFor={inputId}>
            <span>{control.label}</span>
            <span className="moon-memory-trait-editor__number">
              <input
                aria-label={label}
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
              {control.suffix ? <small>{control.suffix}</small> : null}
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
  const listboxId = useId();
  const controlIdPrefix = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchIndex = useMemo(
    () => createMoonMemoryTraitSearchIndex(snapshot),
    [snapshot],
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
  if (!hasNativeMoonMemoryTrait(snapshot, spirit)) return null;

  const isAtTraitLimit = selectedTraits.length >= MOON_MEMORY_TRAIT_LIMIT;
  const isOptionDisabled = (option) =>
    isAtTraitLimit ||
    acquiredTraitIds.has(option.traitId) ||
    nativeTraitIds.has(option.traitId);
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
        <strong>铭记于月亮</strong>
        <span>
          已吞噬 {selectedTraits.length}/{MOON_MEMORY_TRAIT_LIMIT}
        </span>
      </header>
      <div className="moon-memory-trait-editor__picker">
        <label>
          <span>搜索精灵或特性</span>
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
              aria-label="搜索已吞噬特性"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(-1);
                setOpen(true);
              }}
              onBlur={() => setOpen(false)}
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
              placeholder="输入精灵、图鉴号、拼音或特性"
              role="combobox"
              type="search"
              value={query}
            />
          </span>
        </label>
        {open && options.length > 0 ? (
          <ul id={listboxId} role="listbox">
            {options.map((option, index) => {
              const alreadyAdded = acquiredTraitIds.has(option.traitId);
              const alreadyOwned = nativeTraitIds.has(option.traitId);
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
                  <strong>{option.label}</strong>
                  <small>
                    {alreadyAdded
                      ? "已添加"
                      : alreadyOwned
                        ? "已拥有"
                        : isAtTraitLimit
                          ? "已达上限"
                          : option.support.label}
                  </small>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {selectedTraits.length > 0 ? (
        <ul aria-label="已吞噬特性" className="moon-memory-trait-editor__selected">
          {selectedTraits.map(({ support, trait }) => {
            const name = trait.displayName ?? trait.name;
            const values = side.acquiredTraitValues?.[trait.id] ?? {};
            return (
              <li aria-label={`${name}，${support.label}`} key={trait.id}>
                <div className="moon-memory-trait-editor__copy">
                  <strong>{name}</strong>
                  <small>{trait.description}</small>
                  <TraitControls
                    idPrefix={controlIdPrefix}
                    onValueChange={onValueChange}
                    sideKey={sideKey}
                    trait={trait}
                    values={values}
                  />
                </div>
                <span
                  className="moon-memory-trait-editor__support"
                  data-status={support.id}
                >
                  {support.label}
                </span>
                <button
                  aria-label={`删除已吞噬特性${name}`}
                  onClick={() => onRemove?.(trait.id)}
                  title={`删除${name}`}
                  type="button"
                >
                  <X aria-hidden="true" size={15} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
