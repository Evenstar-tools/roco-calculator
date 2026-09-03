import { useMemo, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import {
  createMoonMemoryTraitSearchIndex,
  getMoonMemorySelectedTraits,
  getMoonMemoryTraitControls,
  hasNativeMoonMemoryTrait,
  searchMoonMemoryTraitOptions,
} from "../shared/domain/moon-memory-trait-options.js";
import { MOON_MEMORY_TRAIT_LIMIT } from "../shared/domain/moon-memory.js";
import { ConditionField } from "./ConditionField.jsx";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};
function supportLabel(support) {
  return support?.id === "supported" ? "可计算" : "仅展示";
}

function visibleTraitControls(controls, values) {
  return controls.filter((control) => {
    if (!control.visibleWhen) return true;
    const dependency = controls.find(
      (candidate) =>
        candidate.id === control.visibleWhen.id ||
        candidate.contextKey === control.visibleWhen.contextKey,
    );
    if (!dependency) return false;
    const value = Object.hasOwn(values, dependency.canonicalKey)
      ? values[dependency.canonicalKey]
      : dependency.defaultValue;
    return Object.is(value, control.visibleWhen.equals);
  });
}

export default function MoonMemoryTraitEditor({
  configuration,
  onAdd,
  onRemove,
  onValueChange,
  side,
  snapshot,
  spirit,
}) {
  const [query, setQuery] = useState("");
  const searchIndex = useMemo(
    () => createMoonMemoryTraitSearchIndex(snapshot),
    [snapshot],
  );
  if (!hasNativeMoonMemoryTrait(snapshot, spirit)) return null;
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const acquiredTraitIds = new Set(configuration?.acquiredTraitIds ?? []);
  const acquiredTraitCount = acquiredTraitIds.size;
  const isAtTraitLimit = acquiredTraitCount >= MOON_MEMORY_TRAIT_LIMIT;
  const options = searchMoonMemoryTraitOptions(searchIndex, query, 30);
  const acquiredTraits = getMoonMemorySelectedTraits(snapshot, configuration);

  return (
    <View aria-label={`${sideLabel}吞噬特性`} className="moon-memory-editor">
      <View className="moon-memory-editor__heading">
        <Text className="moon-memory-editor__title">铭记于月亮</Text>
        <Text
          className={isAtTraitLimit
            ? "moon-memory-editor__count moon-memory-editor__count--limit"
            : "moon-memory-editor__count"}
        >
          已吞噬 {acquiredTraitCount}/{MOON_MEMORY_TRAIT_LIMIT}
          {isAtTraitLimit ? " · 已达上限" : ""}
        </Text>
      </View>
      <Input
        aria-label={`${sideLabel}搜索可吞噬特性`}
        className="moon-memory-editor__search"
        onInput={(event) => setQuery(
          event?.detail?.value ?? event?.target?.value ?? "",
        )}
        placeholder="输入精灵名、编号、拼音、首字母或特性名"
        value={query}
      />
      {options.length ? (
        <View aria-label="可吞噬特性候选" className="moon-memory-editor__results">
          {options.map((option) => {
            const acquired = acquiredTraitIds.has(option.traitId);
            const additionDisabled = acquired || isAtTraitLimit;
            return (
              <Button
                aria-label={`${acquired ? "已吞噬" : "吞噬"} ${option.label}`}
                className="moon-memory-editor__result"
                disabled={additionDisabled}
                key={option.key}
                onClick={() => {
                  if (additionDisabled) return;
                  onAdd?.(option.traitId);
                  setQuery("");
                }}
              >
                <Text>{option.label}</Text>
                <Text className={option.support.id === "supported"
                  ? "moon-memory-editor__support moon-memory-editor__support--supported"
                  : "moon-memory-editor__support moon-memory-editor__support--display-only"}
                >
                  {supportLabel(option.support)}
                </Text>
              </Button>
            );
          })}
        </View>
      ) : null}
      {acquiredTraits.length ? (
        <View aria-label="已吞噬特性" className="moon-memory-editor__acquired">
          {acquiredTraits.map(({ support, trait }) => {
            const traitId = trait.id;
            const traitName = trait.displayName ?? trait.name ?? traitId;
            const displaySupport = supportLabel(support);
            const controls = getMoonMemoryTraitControls(trait);
            const values = configuration?.acquiredTraitValues?.[traitId] ?? {};
            return (
              <View className="moon-memory-editor__trait" key={traitId}>
                <View className="moon-memory-editor__trait-heading">
                  <Text>{traitName}</Text>
                  <Text className={support.id === "supported"
                    ? "moon-memory-editor__support moon-memory-editor__support--supported"
                    : "moon-memory-editor__support moon-memory-editor__support--display-only"}
                  >
                    {displaySupport}
                  </Text>
                  <Button
                    aria-label={`移除 ${traitName}`}
                    className="moon-memory-editor__remove"
                    onClick={() => onRemove?.(traitId)}
                  >
                    移除
                  </Button>
                </View>
                {trait.description ? (
                  <Text className="moon-memory-editor__description">
                    {trait.description}
                  </Text>
                ) : null}
                {displaySupport === "仅展示" ? (
                  <Text className="moon-memory-editor__unsupported">
                    当前仅展示，尚未接入计算
                  </Text>
                ) : null}
                {controls.length ? (
                  <View className="moon-memory-editor__controls">
                    {visibleTraitControls(controls, values).map((control) => (
                      <ConditionField
                        className="moon-memory-editor__control"
                        input={control}
                        key={`${traitId}:${control.canonicalKey}`}
                        onChange={(value) => onValueChange?.(
                          traitId,
                          control.canonicalKey,
                          value,
                        )}
                        value={Object.hasOwn(values, control.canonicalKey)
                          ? values[control.canonicalKey]
                          : control.defaultValue}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
