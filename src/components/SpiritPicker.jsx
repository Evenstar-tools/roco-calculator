import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { CaretDown, MagnifyingGlass, Star } from "@phosphor-icons/react";
import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";
import { TraitHint } from "./TraitHint.jsx";
import { EntityChangeHint, hasEntityChanges } from "./EntityChangeHint.jsx";
import { usePresetBrowseMode } from "./PresetBrowseMode.jsx";
import { getBattleFormChoices } from "../domain/battle-form.js";
import { ElementIcon } from "./ElementIcon.jsx";
import { usePickerMenuLayout } from "./picker-menu-layout.js";
import { buildSpiritFamilyIndex } from "./spirit-family.js";
import { canPreserveBattleFormConfig, getFormConfigPreferences } from "../state/form-config-preferences.js";
import { hasCompleteRaceStats } from "../domain/stat.js";

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

function isS5PreviewSpirit(spirit) {
  const identity = spirit?.previewIdentity;
  return identity?.formalIdPending === true &&
    typeof identity.key === "string" && identity.key.length > 0 &&
    typeof identity.catalogId === "string" && identity.catalogId.startsWith("s5-");
}

function shouldShowNewBadge(spirit) {
  if (isS5PreviewSpirit(spirit)) return true;
  return Boolean(
    spirit?.changeInfo?.isNew &&
      !hasEntityChanges(spirit.changeInfo) &&
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
  const s5Order = Number(isS5PreviewSpirit(right)) - Number(isS5PreviewSpirit(left));
  if (s5Order) return s5Order;
  if (isS5PreviewSpirit(left)) return 0;
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
  const s5Order = Number(isS5PreviewSpirit(right)) - Number(isS5PreviewSpirit(left));
  if (s5Order) return s5Order;
  if (isS5PreviewSpirit(left)) return 0;
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
  conditionControl,
  favorite = false,
  favoriteState,
  guideTarget,
  label,
  onFavoriteToggle,
  onSelect,
  onFormSelect,
  formSide,
  onOpenDeer,
  comparisonControls,
  comparisonSummary,
  comparisonActive = false,
  renderComparisonAction,
  selected: sourceSelected,
  showFavorite = true,
  side,
  spirits: sourceSpirits,
}) {
  const { t } = useLocale();
  const { serverId } = useRuntime();
  const spirits = sourceSpirits;
  const selected = sourceSelected;
  const formPreferences = getFormConfigPreferences(serverId);
  const listboxId = useId();
  const inputRef = useRef(null);
  const optionsRef = useRef(null);
  const searchRef = useRef(null);
  const presetBrowse = usePresetBrowseMode();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const formConfigPreference = useSyncExternalStore(
    formPreferences.subscribe,
    () => formPreferences.readPreferences(side),
    () => undefined,
  );
  const selectedName = selected?.fullName ?? "";
  const pendingRaceStats = selected?.calculationStatus === "pending-race-stats";
  const placeholderRaceStats = selected?.previewIdentity?.raceStatsPlaceholder === true;
  const comparisonReady = !pendingRaceStats && hasCompleteRaceStats(selected?.raceStats);
  const selectedTraitName = selected?.reference?.traitName ?? selected?.traitName;
  const selectedTraitDescription = selected?.reference?.traitDescription ?? selected?.traitDescription ?? selected?.traitSummary;
  const [query, setQuery] = useState(selectedName);
  const [activeSpiritId, setActiveSpiritId] = useState(null);
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
  const preserveFormConfig = formConfigPreference ?? sourceSpirits.some((spirit) => family.some(entry => entry.id === spirit.id) && (spirit.fullName === "梦想三三" || spirit.aliases?.includes("梦想三三")));
  const sourceForm = family.find((spirit) => spirit.id === formSide?.spiritId);
  const formStages = ["一阶", "二阶", "三阶", "首领"].filter((stage) => family.some((spirit) => spirit.stage === stage));
  const sourceStage = family.find((spirit) => spirit.id === formSide?.spiritId)?.stage;
  const moeLayers = Math.max(0, formStages.indexOf(sourceStage) - formStages.indexOf(selected?.stage));
  const browsingFamily = !searching && relatedFamily.length > 1 && (Boolean(onFormSelect) || !presetBrowse.enabled);
  const choosingForm = Boolean(onFormSelect && browsingFamily && family.length > 1);
  const browsingPresets = presetBrowse.enabled && (!searching || !query.trim()) && !browsingFamily;
  // Blank input requests recommendations, even after clearing a selected spirit.
  const pinNewSpirits = !query.trim();
  const s5PreviewSpirits = useMemo(() => spirits.filter(isS5PreviewSpirit), [spirits]);
  const presetSpirits = useMemo(() => spirits
    .filter((spirit) => isS5PreviewSpirit(spirit) || presetBrowse.spiritIds.has(spirit.id) || spirit.favoriteState === "manual")
    .sort((left, right) => pinNewSpirits
      ? Number(isS5PreviewSpirit(right)) - Number(isS5PreviewSpirit(left)) ||
        (isS5PreviewSpirit(left) ? 0 : compareDexOrder(left, right))
      : compareDexOrder(left, right)), [spirits, presetBrowse.spiritIds, pinNewSpirits]);

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
              spirit.sourceCategory,
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
      const orderedRoster = [...direct].sort(pinNewSpirits ? compareDefaultPreviewOrder : compareDexOrder);
      const previewItems = favoriteCount
        ? uniqueSpirits([...s5PreviewSpirits, ...previewFinals, ...previewBosses, ...favorites])
            .sort(pinNewSpirits ? compareSavedPreviewOrder : compareDexOrder)
        : orderedRoster;
      const visibleCount = Math.min(previewItems.length, s5PreviewSpirits.length + previewLimit);
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
        .sort((left, right) => Number(directIds.has(right.id)) - Number(directIds.has(left.id)) ||
          searchMatchRank(left, needle) - searchMatchRank(right, needle))
        .slice(0, 20)
        .map((spirit) => ({
          related: !directIds.has(spirit.id),
          spirit,
        })),
    };
  }, [browsingFamily, relatedFamily, familyIndex, browsingPresets, presetSpirits, previewLimit, query, spirits, s5PreviewSpirits, pinNewSpirits]);
  const matches = preview.items;
  // Keep identity rather than a stale index when presets load or pages expand.
  const activeIndex = Math.max(0, matches.findIndex(({ spirit }) => spirit.id === activeSpiritId));
  const activeOptionId = matches[activeIndex]?.spirit.id;

  useLayoutEffect(() => {
    if (!open) return;
    const options = optionsRef.current;
    const active = options?.querySelector('[role="option"].is-active');
    if (!active || !options.clientHeight) return;
    const top = active.getBoundingClientRect().top - options.getBoundingClientRect().top + options.scrollTop - options.clientTop;
    const bottom = top + active.offsetHeight;
    if (top < options.scrollTop) options.scrollTop = top;
    else if (bottom > options.scrollTop + options.clientHeight) options.scrollTop = bottom - options.clientHeight;
  }, [open, activeIndex, activeOptionId, query]);

  function openOptions() {
    setQuery(clearOnOpen ? "" : selectedName);
    setSearching(clearOnOpen);
    setPreviewLimit(INITIAL_PREVIEW_COUNT);
    setActiveSpiritId(clearOnOpen ? null : selected?.id ?? null);
    setOpen(true);
  }

  function commit(spirit) {
    setQuery(spirit.fullName);
    setOpen(false);
    if (choosingForm && preserveFormConfig && family.some(entry => entry.id === spirit.id)
      && canPreserveBattleFormConfig(sourceForm, spirit)) onFormSelect(spirit.id);
    else onSelect(spirit.id);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) { openOptions(); return; }
      setOpen(true);
      setActiveSpiritId(matches[Math.min(activeIndex + 1, matches.length - 1)]?.spirit.id ?? null);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { openOptions(); return; }
      setActiveSpiritId(matches[Math.max(0, activeIndex - 1)]?.spirit.id ?? null);
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

  usePickerMenuLayout({ open, anchorRef: searchRef, menuRef: optionsRef, maxHeight: 282, minWidth: 240, contentKey: `${query}-${matches.length}-${browsingFamily}` });

  const familyHeading = <li className="spirit-picker__form-heading" role="presentation">
    <span>{t("同族形态")}</span>
    {choosingForm ? <label className="spirit-picker__form-toggle" title={t("攻防方开关分别记忆；跨页面保留可在显示设置中开启。先选高阶再萌化可保留配置；直接选低阶后升阶、同阶换形态或选关联分支时载入目标预设。")}>
      <span>{t("萌化 · 配置保留")}</span>
      <input type="checkbox" role="switch" aria-label={t("{side}同族切换保留本场配置", { side: label })}
        checked={preserveFormConfig} onChange={event => {
          formPreferences.writePreference(side, event.target.checked);
        }}
        onKeyDown={event => { if (event.key === "Escape") { inputRef.current?.focus(); handleKeyDown(event); } }} />
    </label> : null}
  </li>;

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

      <div className="spirit-picker__search" data-guide-target={guideTarget} ref={searchRef}>
        <MagnifyingGlass aria-hidden="true" size={18} />
        <input
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={t("{side}精灵", { side: label })}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearching(true);
            setActiveSpiritId(null);
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
          placeholder={t("选精灵")}
          ref={inputRef}
          role="combobox"
          value={open ? query : selectedName}
        />
        {!open && selectedName ? (
          <span aria-hidden="true" className="spirit-picker__selected-name">{selectedName}</span>
        ) : null}
        <button
          aria-label={t("展开{side}精灵列表", { side: label })}
          className="spirit-picker__caret"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) setOpen(false);
            else {
              inputRef.current?.focus();
              openOptions();
            }
          }}
          title={t("展开{side}精灵列表", { side: label })}
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
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            {browsingFamily ? familyHeading : null}
            {matches.length ? (
              matches.map(({ related, spirit }, index) => {
                const familyOption = browsingFamily && relatedFamily.some(entry => entry.id === spirit.id);
                return <Fragment key={spirit.id}>
                <li
                  aria-selected={spirit.id === selected?.id}
                  className={index === activeIndex ? "is-active" : ""}
                  data-spirit-id={spirit.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSpiritId(spirit.id)}
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
                        t(spirit.stage),
                        spirit.previewIdentity?.raceStatsPlaceholder === true
                          ? t("六维100测试占位")
                          : spirit.calculationStatus === "pending-race-stats"
                          ? t("种族值待确认")
                          : null,
                        familyOption && spirit.id === selected?.id ? t("当前形态")
                          : familyOption && choosingForm && !family.some(entry => entry.id === spirit.id) ? t("关联形态 · 载入预设")
                          : familyOption && choosingForm && !canPreserveBattleFormConfig(sourceForm, spirit) ? t("独立形态 · 载入预设")
                          : related || familyOption && !choosingForm ? t(selected?.evolutionChainIds?.includes(spirit.id) ? "进化链" : "关联形态") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </li>
                </Fragment>;
              })
            ) : (
              <li className="spirit-picker__empty">
                {browsingPresets
                  ? presetBrowse.error || t(presetBrowse.loading ? "正在读取预设…" : "暂无预设精灵，请输入搜索")
                  : preview.isUnfiltered
                  ? t("暂无收藏精灵，请输入搜索")
                  : t("没有匹配精灵")}
              </li>
            )}
            {preview.isUnfiltered && preview.allFavoritesVisible ? (
              <li
                className="spirit-picker__preview-complete"
                role="presentation"
              >{t("已预览所有已收藏精灵")}</li>
            ) : null}
            {choosingForm ? (
              <li className="spirit-picker__form-footer" role="presentation">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                  setOpen(false);
                  onSelect(selected.id);
                }}>{t("重新载入当前形态预设")}</button>
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
              data-preview-silhouette={selected.previewIdentity?.asset?.kind?.endsWith("silhouette") || undefined}
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
              <EntityChangeHint changeInfo={selected.changeInfo} entityName={selected.fullName} active={comparisonReady && comparisonActive}
                renderPatchAction={comparisonReady ? renderComparisonAction : undefined}>
                {comparisonReady ? comparisonControls : null}
              </EntityChangeHint>
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
              <span>{t(selected.stage)}</span>
            </div>
            {comparisonReady ? comparisonSummary : null}
            {(placeholderRaceStats && !comparisonActive) || pendingRaceStats ? (
              <p className="spirit-card__pending">{t(placeholderRaceStats ? "暂定六维100" : "种族值待确认")}</p>
            ) : null}
            {!pendingRaceStats || selectedTraitName ? (
              <p>
                {t(selected.battleFormTraitRetained ? "特性沿用：" : "特性：")}
                <TraitHint
                  description={selectedTraitDescription}
                  name={selectedTraitName}
                />
                {conditionControl}
                {onOpenDeer && <button className="spirit-card__deer-entry" type="button" onClick={onOpenDeer}>{t("电鹿斩杀线 →")}</button>}
              </p>
            ) : null}
            {formSide?.battleForm ? <small className="spirit-card__form-note">
              <span className="spirit-card__moe-count" role="img" aria-label={t("萌化 {count} 层", { count: moeLayers })} title={t("萌化 {count} 层：相对初始形态的降阶数", { count: moeLayers })}>
                <ElementIcon type="萌" size={16} /><span>{moeLayers}</span>
              </span>
              <span>{t(" · 配置已保留")}</span>
            </small> : null}
          </div>
          {showFavorite ? (
            <button
              aria-label={t(
                resolvedFavoriteState === "manual"
                  ? "取消收藏{name}"
                  : resolvedFavoriteState === "complete"
                    ? "手动收藏{name}"
                    : "收藏{name}", { name: selected.fullName })}
              className={`favorite-action${
                resolvedFavoriteState
                  ? ` is-favorite is-favorite--${resolvedFavoriteState}`
                  : ""
              }`}
              onClick={onFavoriteToggle}
              title={
                resolvedFavoriteState === "manual"
                  ? t("取消手动收藏")
                  : resolvedFavoriteState === "complete"
                    ? t("配置完整，点击设为手动收藏")
                    : t("收藏{name}", { name: selected.fullName })
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
