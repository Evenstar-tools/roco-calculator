import { CaretDown, MagnifyingGlass, Star } from "@phosphor-icons/react";
import { useId, useMemo, useRef, useState } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";
import { TraitHint } from "./TraitHint.jsx";

function normalizeSearch(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN");
}

const INITIAL_PREVIEW_COUNT = 12;
const PREVIEW_PAGE_SIZE = 20;

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
  const [previewLimit, setPreviewLimit] = useState(INITIAL_PREVIEW_COUNT);
  const resolvedFavoriteState =
    favoriteState ?? (favorite ? "manual" : null);

  const preview = useMemo(() => {
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
      const sorted = markedFirst(direct);
      const favoriteCount = sorted.filter((spirit) =>
        Boolean(spirit.favoriteState),
      ).length;
      const visibleCount = favoriteCount
        ? Math.min(
            sorted.length,
            Math.max(
              INITIAL_PREVIEW_COUNT,
              Math.min(previewLimit, favoriteCount),
            ),
          )
        : Math.min(sorted.length, INITIAL_PREVIEW_COUNT);
      return {
        allFavoritesVisible:
          favoriteCount > 0 && visibleCount >= favoriteCount,
        favoriteCount,
        isUnfiltered: true,
        items: sorted.slice(0, visibleCount).map((spirit) => ({
          related: false,
          spirit,
        })),
      };
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
    return {
      allFavoritesVisible: false,
      favoriteCount: 0,
      isUnfiltered: false,
      items: markedFirst(expanded.map(({ spirit }) => spirit))
        .slice(0, 20)
        .map((spirit) => ({
          related: !directIds.has(spirit.id),
          spirit,
        })),
    };
  }, [previewLimit, query, spirits]);
  const matches = preview.items;

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

  function handleOptionsScroll(event) {
    if (!preview.isUnfiltered || preview.allFavoritesVisible) return;
    const options = event.currentTarget;
    const isNearBottom =
      options.scrollTop + options.clientHeight >= options.scrollHeight - 12;
    if (!isNearBottom) return;
    setPreviewLimit((current) =>
      Math.min(preview.favoriteCount, current + PREVIEW_PAGE_SIZE),
    );
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
            setPreviewLimit(INITIAL_PREVIEW_COUNT);
            setOpen(true);
          }}
          onFocus={() => {
            if (!open) {
              setQuery(selectedName);
              setPreviewLimit(INITIAL_PREVIEW_COUNT);
            }
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
          <ul
            className="spirit-picker__options"
            id={listboxId}
            onScroll={handleOptionsScroll}
            role="listbox"
          >
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
            {preview.isUnfiltered && preview.allFavoritesVisible ? (
              <li
                className="spirit-picker__preview-complete"
                role="presentation"
              >
                已预览所有已收藏精灵
              </li>
            ) : null}
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
              特性：
              <TraitHint
                description={selected.traitDescription}
                name={selected.traitName}
              />
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
