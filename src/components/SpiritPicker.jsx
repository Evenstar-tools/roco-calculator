import { CaretDown, MagnifyingGlass, Star } from "@phosphor-icons/react";
import { useId, useMemo, useRef, useState } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";

function normalizeSearch(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN");
}

export function SpiritPicker({
  favorite = false,
  favoriteState,
  label,
  onFavoriteToggle,
  onSelect,
  selected,
  showFavorite = true,
  side,
  spirits,
}) {
  const listboxId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedName = selected?.fullName ?? "";
  const [query, setQuery] = useState(selectedName);
  const [activeIndex, setActiveIndex] = useState(0);
  const resolvedFavoriteState =
    favoriteState ?? (favorite ? "manual" : null);

  const matches = useMemo(() => {
    const needle = normalizeSearch(query);
    const direct = needle
      ? spirits.filter((spirit) =>
          [
            spirit.fullName,
            spirit.variantName,
            spirit.pinyin,
            spirit.initials,
            spirit.dexNo,
          ].some((field) => normalizeSearch(field).includes(needle)),
        )
      : spirits;
    const markedFirst = (items) =>
      [...items].sort(
        (left, right) =>
          Number(Boolean(right.favoriteState)) -
          Number(Boolean(left.favoriteState)),
      );
    if (!needle) {
      return markedFirst(direct).slice(0, 12).map((spirit) => ({
        related: false,
        spirit,
      }));
    }

    const byId = new Map(spirits.map((spirit) => [spirit.id, spirit]));
    const directIds = new Set(direct.map((spirit) => spirit.id));
    const shown = new Set();
    const expanded = [];
    for (const match of direct) {
      for (const spiritId of match.evolutionChainIds ?? [match.id]) {
        const spirit = byId.get(spiritId);
        if (!spirit || shown.has(spirit.id)) continue;
        shown.add(spirit.id);
        expanded.push({
          related: !directIds.has(spirit.id),
          spirit,
        });
      }
      if (!shown.has(match.id)) {
        shown.add(match.id);
        expanded.push({ related: false, spirit: match });
      }
    }
    return markedFirst(expanded.map(({ spirit }) => spirit))
      .slice(0, 20)
      .map((spirit) => ({
        related: !directIds.has(spirit.id),
        spirit,
      }));
  }, [query, spirits]);

  function commit(spirit) {
    setQuery(spirit.fullName);
    setOpen(false);
    onSelect(spirit.id);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      commit(matches[activeIndex].spirit);
    } else if (event.key === "Escape") {
      setQuery(selectedName);
      setOpen(false);
    }
  }

  return (
    <article
      className={`spirit-picker spirit-picker--${side}`}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          (open || query !== selectedName)
        ) {
          setQuery(selectedName);
          setOpen(false);
        }
      }}
    >
      <div className="spirit-picker__eyebrow">
        <span>{label}</span>
      </div>

      <div className="spirit-picker__search">
        <MagnifyingGlass aria-hidden="true" size={18} />
        <input
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={`${label}精灵`}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => {
            if (!open) setQuery(selectedName);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="选精灵"
          ref={inputRef}
          role="combobox"
          value={open ? query : selectedName}
        />
        <button
          aria-label={`展开${label}精灵列表`}
          className="spirit-picker__caret"
          onClick={() => {
            setOpen((value) => !value);
            inputRef.current?.focus();
          }}
          title={`展开${label}精灵列表`}
          type="button"
        >
          <CaretDown aria-hidden="true" size={14} weight="bold" />
        </button>
        {open ? (
          <ul className="spirit-picker__options" id={listboxId} role="listbox">
            {matches.length ? (
              matches.map(({ related, spirit }, index) => (
                <li
                  aria-selected={spirit.id === selected?.id}
                  className={index === activeIndex ? "is-active" : ""}
                  key={spirit.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(spirit)}
                  role="option"
                >
                  {spirit.assetUrl ? (
                    <img alt="" height="36" src={spirit.assetUrl} width="36" />
                  ) : null}
                  <span>
                    <strong>{spirit.fullName}</strong>
                    <small>
                      {[spirit.dexNo, spirit.stage, related ? "进化链" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </li>
              ))
            ) : (
              <li className="spirit-picker__empty">没有匹配精灵</li>
            )}
          </ul>
        ) : null}
      </div>

      {selected?.id ? (
        <div className="spirit-card">
          {selected.assetUrl ? (
            <img
              alt={selected.fullName}
              className="spirit-card__image"
              height="76"
              src={selected.assetUrl}
              width="76"
            />
          ) : null}
          <div className="spirit-card__identity">
            <strong>{selected.fullName}</strong>
            <div className="spirit-card__tags">
              {selected.types.map((type) => (
                <span
                  className={`type-tag type-tag--${type}`}
                  key={type}
                  style={getElementToneStyle(type)}
                >
                  {type}
                </span>
              ))}
              <span>{selected.stage}</span>
            </div>
            <p>
              特性：<strong>{selected.traitName}</strong>
            </p>
          </div>
          {showFavorite ? (
            <button
              aria-label={`${
                resolvedFavoriteState === "manual"
                  ? "取消收藏"
                  : resolvedFavoriteState === "complete"
                    ? "手动收藏"
                    : "收藏"
              }${selected.fullName}`}
              className={`favorite-action${
                resolvedFavoriteState
                  ? ` is-favorite is-favorite--${resolvedFavoriteState}`
                  : ""
              }`}
              onClick={onFavoriteToggle}
              title={
                resolvedFavoriteState === "manual"
                  ? "取消手动收藏"
                  : resolvedFavoriteState === "complete"
                    ? "配置完整，点击设为手动收藏"
                    : `收藏${selected.fullName}`
              }
              type="button"
            >
              <Star
                aria-hidden="true"
                size={20}
                weight={resolvedFavoriteState ? "fill" : "regular"}
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
