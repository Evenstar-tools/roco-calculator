import { CaretDown, MagnifyingGlass, Star } from "@phosphor-icons/react";
import { useId, useMemo, useRef, useState } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";
import { TraitHint } from "./TraitHint.jsx";
import { EntityChangeHint } from "./EntityChangeHint.jsx";

function normalizeSearch(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN");
}

const INITIAL_PREVIEW_COUNT = 12;
const PREVIEW_PAGE_SIZE = 20;

function dexNo(spirit) {
  return String(spirit?.dexNo ?? "").trim();
}

function isS4PreviewFinalSpirit(spirit) {
  return Boolean(spirit?.changeInfo?.isNew && spirit.previewDefaults);
}

function shouldShowNewBadge(spirit) {
  return Boolean(
    spirit?.changeInfo?.isNew &&
      (spirit.previewDefaults || spirit.stage === "首领"),
  );
}

function isPendingS4PreviewFinalSpirit(spirit) {
  return isS4PreviewFinalSpirit(spirit) && dexNo(spirit) === "";
}

function compareDexOrder(left, right) {
  const leftDexNo = dexNo(left);
  const rightDexNo = dexNo(right);
  if (leftDexNo && rightDexNo) {
    const dexOrder = leftDexNo.localeCompare(rightDexNo, "zh-CN", {
      numeric: true,
    });
    if (dexOrder !== 0) return dexOrder;
  } else if (leftDexNo || rightDexNo) {
    return leftDexNo ? -1 : 1;
  }
  return String(left.fullName ?? "").localeCompare(
    String(right.fullName ?? ""),
    "zh-CN",
  );
}

function compareSavedPreviewOrder(left, right) {
  const leftPending = isPendingS4PreviewFinalSpirit(left);
  const rightPending = isPendingS4PreviewFinalSpirit(right);
  if (leftPending !== rightPending) return leftPending ? -1 : 1;
  if (leftPending) {
    if (left.fullName === "银月狼王") return -1;
    if (right.fullName === "银月狼王") return 1;
    return 0;
  }
  return compareDexOrder(left, right);
}

function compareDefaultPreviewOrder(left, right) {
  const leftDefault = left.fullName === "迪莫";
  const rightDefault = right.fullName === "迪莫";
  if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
  return compareSavedPreviewOrder(left, right);
}

function uniqueSpirits(spirits) {
  return spirits.filter(
    (spirit, index) =>
      spirits.findIndex((candidate) => candidate.id === spirit.id) === index,
  );
}

export function SpiritPicker({
  favorite = false,
  favoriteState,
  guideTarget,
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
        (left, right) => {
          const markedOrder =
            Number(Boolean(right.favoriteState)) -
            Number(Boolean(left.favoriteState));
          if (markedOrder !== 0) return markedOrder;
          if (!left.favoriteState || !right.favoriteState) return 0;
          return compareDexOrder(left, right);
        },
      );
    if (!needle) {
      const favorites = markedFirst(
        direct.filter((spirit) => Boolean(spirit.favoriteState)),
      );
      const favoriteCount = favorites.length;
      const previewFinals = direct.filter(isS4PreviewFinalSpirit);
      const orderedRoster = [...direct].sort(compareDefaultPreviewOrder);
      const previewItems = favoriteCount
        ? uniqueSpirits([...previewFinals, ...favorites])
            .sort(compareSavedPreviewOrder)
        : orderedRoster;
      const visibleCount = Math.min(previewItems.length, previewLimit);
      return {
        allFavoritesVisible:
          favoriteCount > 0 && visibleCount >= previewItems.length,
        allPreviewItemsVisible: visibleCount >= previewItems.length,
        favoriteCount,
        isUnfiltered: true,
        items: previewItems.slice(0, visibleCount).map((spirit) => ({
          related: false,
          spirit,
        })),
        totalCount: previewItems.length,
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
      allPreviewItemsVisible: true,
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
    if (!preview.isUnfiltered || preview.allPreviewItemsVisible) return;
    const options = event.currentTarget;
    const isNearBottom =
      options.scrollTop + options.clientHeight >= options.scrollHeight - 12;
    if (!isNearBottom) return;
    setPreviewLimit((current) =>
      Math.min(preview.totalCount, current + PREVIEW_PAGE_SIZE),
    );
  }

  return (
    <article
      className={`spirit-picker spirit-picker--${side}`}
      data-guide-root={guideTarget}
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

      <div className="spirit-picker__search" data-guide-target={guideTarget}>
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
            data-guide-part="options"
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
                    <span className="spirit-picker__option-title">
                      <strong data-new={shouldShowNewBadge(spirit) || undefined}>
                        {spirit.fullName}
                      </strong>
                      <EntityChangeHint changeInfo={spirit.changeInfo} />
                    </span>
                    <small>
                      {[
                        spirit.dexNo,
                        spirit.stage,
                        spirit.calculationStatus === "pending-race-stats"
                          ? "种族值待确认"
                          : null,
                        related ? "进化链" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </li>
              ))
            ) : (
              <li className="spirit-picker__empty">
                {preview.isUnfiltered
                  ? "暂无收藏精灵，请输入搜索"
                  : "没有匹配精灵"}
              </li>
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
        <div className="spirit-card" data-guide-part="selection">
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
            <span className="spirit-card__title">
              <strong data-new={shouldShowNewBadge(selected) || undefined}>
                {selected.fullName}
              </strong>
              <EntityChangeHint changeInfo={selected.changeInfo} />
            </span>
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
            {selected.calculationStatus === "pending-race-stats" ? (
              <p className="spirit-card__pending">
                种族值待确认
              </p>
            ) : (
              <p>
                特性：
                <TraitHint
                  description={selected.traitDescription}
                  name={selected.traitName}
                />
              </p>
            )}
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
