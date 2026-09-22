import { CaretDown, MagnifyingGlass, Star } from "@phosphor-icons/react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";
import { TraitHint } from "./TraitHint.jsx";
import { EntityChangeHint } from "./EntityChangeHint.jsx";
import { usePresetBrowseMode } from "./PresetBrowseMode.jsx";
import { getBattleFormChoices } from "../domain/battle-form.js";
import { ElementIcon } from "./ElementIcon.jsx";
import { buildSpiritFamilyIndex } from "./spirit-family.js";

function normalizeSearch(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN");
}

function searchMatchRank(spirit, needle) {
  const aliases = (spirit.aliases ?? []).map(normalizeSearch);
  if (aliases.includes(needle)) return 0;
  if (normalizeSearch(spirit.fullName) === needle) return 1;
  const fields = [
    spirit.fullName,
    spirit.variantName,
    spirit.pinyin,
    spirit.initials,
    spirit.dexNo,
    ...(spirit.aliases ?? []),
  ].map(normalizeSearch);
  if (fields.some((field) => field.startsWith(needle))) return 2;
  return 3;
}

const INITIAL_PREVIEW_COUNT = 16;
const PREVIEW_PAGE_SIZE = 20;
const S4_PREVIEW_BOSS_ORDER = new Map([
  ["烈焰狂战士", 0],
  ["满月砣", 1],
]);

function dexNo(spirit) {
  return String(spirit?.dexNo ?? "").trim();
}

function isS4PreviewFinalSpirit(spirit) {
  return Boolean(spirit?.changeInfo?.isNew && (spirit.previewDefaults || spirit.changeInfo.isFinal));
}

function shouldShowNewBadge(spirit) {
  return Boolean(
    spirit?.changeInfo?.isNew &&
      (spirit.previewDefaults || spirit.changeInfo.isFinal || spirit.stage === "首领"),
  );
}

function getS4PreviewBossOrder(spirit) {
  if (!spirit?.changeInfo?.isNew || spirit.stage !== "首领") return null;
  return S4_PREVIEW_BOSS_ORDER.get(spirit?.baseName ?? spirit?.fullName) ?? null;
}

function isS4PreviewBossSpirit(spirit) {
  return getS4PreviewBossOrder(spirit) !== null;
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
  const leftFinal = isS4PreviewFinalSpirit(left);
  const rightFinal = isS4PreviewFinalSpirit(right);
  if (leftFinal !== rightFinal) return leftFinal ? -1 : 1;
  if (leftFinal) {
    if (left.id === right.id) return 0;
    if (left.fullName === "银月狼王") return -1;
    if (right.fullName === "银月狼王") return 1;
    return 0;
  }
  const leftBossOrder = getS4PreviewBossOrder(left);
  const rightBossOrder = getS4PreviewBossOrder(right);
  if ((leftBossOrder !== null) !== (rightBossOrder !== null)) {
    return leftBossOrder !== null ? -1 : 1;
  }
  if (leftBossOrder !== null) return leftBossOrder - rightBossOrder;
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
  clearOnOpen = false,
  favorite = false,
  favoriteState,
  guideTarget,
  label,
  onFavoriteToggle,
  onSelect,
  onFormSelect,
  formSide,
  onOpenDeer,
  selected,
  showFavorite = true,
  side,
  spirits,
}) {
  const listboxId = useId();
  const inputRef = useRef(null);
  const optionsRef = useRef(null);
  const presetBrowse = usePresetBrowseMode();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [formConfigPreferences, setFormConfigPreferences] = useState({});
  const selectedName = selected?.fullName ?? "";
  const [query, setQuery] = useState(selectedName);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewLimit, setPreviewLimit] = useState(INITIAL_PREVIEW_COUNT);
  const resolvedFavoriteState =
    favoriteState ?? (favorite ? "manual" : null);
  const family = useMemo(() => formSide ? getBattleFormChoices(spirits, formSide) : [], [spirits, formSide]);
  const familyIndex = useMemo(() => buildSpiritFamilyIndex(spirits), [spirits]);
  const relatedFamily = useMemo(() => {
    const ownPath = new Set(family.length ? family.map(spirit => spirit.id) : selected?.evolutionChainIds ?? [selected?.id]);
    const stages = ["一阶", "二阶", "三阶", "首领"];
    return [...(familyIndex.get(selected?.id) ?? [])].sort((left, right) => {
      const ownOrder = Number(ownPath.has(right.id)) - Number(ownPath.has(left.id));
      if (ownOrder) return ownOrder;
      if (!ownPath.has(left.id)) {
        const stageOrder = stages.indexOf(right.stage) - stages.indexOf(left.stage);
        if (stageOrder) return stageOrder;
      }
      return compareDexOrder(left, right);
    });
  }, [familyIndex, family, selected]);
  const familyKey = family.map((spirit) => spirit.id).sort().join(",");
  const preserveFormConfig = formConfigPreferences[familyKey] ?? family.some((spirit) => spirit.fullName === "梦想三三");
  const formStages = ["一阶", "二阶", "三阶", "首领"].filter((stage) => family.some((spirit) => spirit.stage === stage));
  const sourceStage = family.find((spirit) => spirit.id === formSide?.spiritId)?.stage;
  const moeLayers = Math.max(0, formStages.indexOf(sourceStage) - formStages.indexOf(selected?.stage));
  const browsingFamily = !searching && relatedFamily.length > 1 && (Boolean(onFormSelect) || !presetBrowse.enabled);
  const choosingForm = Boolean(onFormSelect && browsingFamily && family.length > 1);
  const browsingPresets = presetBrowse.enabled && (!searching || !query.trim()) && !browsingFamily;
  const presetSpirits = useMemo(() => spirits
    .filter((spirit) => presetBrowse.spiritIds.has(spirit.id) || spirit.favoriteState === "manual")
    .sort(compareDexOrder), [spirits, presetBrowse.spiritIds]);

  useLayoutEffect(() => {
    if (!open || !browsingPresets) return;
    const options = optionsRef.current;
    const selectedOption = [...(options?.children ?? [])].find((option) => option.dataset.spiritId === selected?.id);
    if (options) options.scrollTop = selectedOption
      ? Math.max(0, selectedOption.offsetTop - options.offsetTop - (options.clientHeight - selectedOption.offsetHeight) / 2)
      : 0;
  }, [open, browsingPresets, selected?.id, presetSpirits]);

  const preview = useMemo(() => {
    if (browsingFamily) return {
      allFavoritesVisible: false,
      allPreviewItemsVisible: true,
      isUnfiltered: false,
      items: relatedFamily.map((spirit) => ({ related: false, spirit })),
    };
    if (browsingPresets) return {
      allFavoritesVisible: false,
      allPreviewItemsVisible: true,
      isUnfiltered: true,
      items: presetSpirits.map((spirit) => ({ related: false, spirit })),
      totalCount: presetSpirits.length,
    };
    const needle = normalizeSearch(query);
    const direct = needle
      ? spirits
          .filter((spirit) =>
            [
              spirit.fullName,
              spirit.variantName,
              spirit.pinyin,
              spirit.initials,
              spirit.dexNo,
              ...(spirit.aliases ?? []),
            ].some((field) => normalizeSearch(field).includes(needle)),
          )
          .sort((left, right) =>
            searchMatchRank(left, needle) - searchMatchRank(right, needle)
            || compareDexOrder(left, right),
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
      const previewBosses = direct.filter(isS4PreviewBossSpirit);
      const orderedRoster = [...direct].sort(compareDefaultPreviewOrder);
      const previewItems = favoriteCount
        ? uniqueSpirits([...previewFinals, ...previewBosses, ...favorites])
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

    const directIds = new Set(direct.map((spirit) => spirit.id));
    const shown = new Set();
    const expanded = [];
    for (const match of direct) {
      for (const spirit of familyIndex.get(match.id) ?? [match]) {
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
        .sort((left, right) => Number(directIds.has(right.id)) - Number(directIds.has(left.id)))
        .slice(0, 20)
        .map((spirit) => ({
          related: !directIds.has(spirit.id),
          spirit,
        })),
    };
  }, [browsingFamily, relatedFamily, familyIndex, browsingPresets, presetSpirits, previewLimit, query, spirits]);
  const matches = preview.items;

  function openOptions() {
    setQuery(clearOnOpen ? "" : selectedName);
    setSearching(clearOnOpen);
    setPreviewLimit(INITIAL_PREVIEW_COUNT);
    setActiveIndex(!clearOnOpen && relatedFamily.length > 1 && (onFormSelect || !presetBrowse.enabled)
      ? Math.max(0, relatedFamily.findIndex((spirit) => spirit.id === selected?.id))
      : presetBrowse.enabled && !clearOnOpen
      ? Math.max(0, presetSpirits.findIndex((spirit) => spirit.id === selected?.id))
      : 0);
    setOpen(true);
  }

  function commit(spirit) {
    setQuery(spirit.fullName);
    setOpen(false);
    if (choosingForm && preserveFormConfig && family.some(entry => entry.id === spirit.id)) onFormSelect(spirit.id);
    else onSelect(spirit.id);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) { openOptions(); return; }
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      commit(matches[activeIndex].spirit);
    } else if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); }
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
            setSearching(true);
            setActiveIndex(0);
            setPreviewLimit(INITIAL_PREVIEW_COUNT);
            setOpen(true);
          }}
          onFocus={(event) => {
            if (!open) openOptions();
            if (selectedName && !clearOnOpen) event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!open) openOptions();
            if (selectedName && event.currentTarget.value === selectedName) event.currentTarget.select();
          }}
          onKeyDown={handleKeyDown}
          placeholder="选精灵"
          ref={inputRef}
          role="combobox"
          value={open ? query : selectedName}
        />
        {!open && selectedName ? (
          <span aria-hidden="true" className="spirit-picker__selected-name">{selectedName}</span>
        ) : null}
        <button
          aria-label={`展开${label}精灵列表`}
          className="spirit-picker__caret"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) setOpen(false);
            else {
              inputRef.current?.focus();
              openOptions();
            }
          }}
          title={`展开${label}精灵列表`}
          type="button"
        >
          <CaretDown aria-hidden="true" size={14} weight="bold" />
        </button>
        {open ? (
          <ul
            className={`spirit-picker__options${browsingFamily ? " spirit-picker__options--forms" : ""}`}
            data-guide-part="options"
            id={listboxId}
            onScroll={handleOptionsScroll}
            ref={optionsRef}
            role="listbox"
          >
            {browsingFamily ? (
              <li className="spirit-picker__form-heading" role="presentation">
                <span>同族形态</span>
                {choosingForm ? <label className="spirit-picker__form-toggle" title="仅直系萌化可保留本场配置；其他关联分支始终载入目标预设。关闭时所有选择均载入目标预设，重置临时战斗条件。">
                  <span>萌化 · 配置保留</span>
                  <input type="checkbox" role="switch" aria-label={`${label}同族切换保留本场配置`}
                    checked={preserveFormConfig} onChange={event => {
                      const enabled = event.target.checked;
                      setFormConfigPreferences(current => ({ ...current, [familyKey]: enabled }));
                    }}
                    onKeyDown={event => { if (event.key === "Escape") { inputRef.current?.focus(); handleKeyDown(event); } }} />
                </label> : null}
              </li>
            ) : null}
            {matches.length ? (
              matches.map(({ related, spirit }, index) => (
                <li
                  aria-selected={spirit.id === selected?.id}
                  className={index === activeIndex ? "is-active" : ""}
                  data-spirit-id={spirit.id}
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
                        browsingFamily && spirit.id === selected?.id ? "当前形态"
                          : browsingFamily && choosingForm && !family.some(entry => entry.id === spirit.id) ? "关联形态 · 载入预设"
                          : related || browsingFamily && !choosingForm ? (selected?.evolutionChainIds?.includes(spirit.id) ? "进化链" : "关联形态") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </li>
              ))
            ) : (
              <li className="spirit-picker__empty">
                {browsingPresets
                  ? presetBrowse.error || (presetBrowse.loading ? "正在读取预设…" : "暂无预设精灵，请输入搜索")
                  : preview.isUnfiltered
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
            {choosingForm ? (
              <li className="spirit-picker__form-footer" role="presentation">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                  setOpen(false);
                  onSelect(selected.id);
                }}>重新载入当前形态预设</button>
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
                {selected.battleFormTraitRetained ? "特性沿用：" : "特性："}
                <TraitHint
                  description={selected.traitDescription}
                  name={selected.traitName}
                />
                {onOpenDeer && <button className="spirit-card__deer-entry" type="button" onClick={onOpenDeer}>电鹿斩杀线 →</button>}
              </p>
            )}
            {formSide?.battleForm ? <small className="spirit-card__form-note">
              <span className="spirit-card__moe-count" role="img" aria-label={`萌化 ${moeLayers} 层`} title={`萌化 ${moeLayers} 层：相对初始形态的降阶数`}>
                <ElementIcon type="萌" size={16} /><span>{moeLayers}</span>
              </span>
              <span> · 配置已保留</span>
            </small> : null}
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
