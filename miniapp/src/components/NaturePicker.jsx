import { useMemo, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import {
  NATURES,
  QUICK_STATS,
  STAT_LABELS,
  getNature,
} from "../shared/domain/natures.js";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

function readInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function NatureEffect({ nature }) {
  if (!nature.upStat || !nature.downStat) {
    return <Text className="nature-picker__neutral">无修正</Text>;
  }

  return (
    <View
      aria-label={`${STAT_LABELS[nature.upStat]}提升百分之二十，${STAT_LABELS[nature.downStat]}降低百分之十`}
      className="nature-picker__effect"
    >
      <Text className="nature-picker__effect-up">
        +20% {STAT_LABELS[nature.upStat]}
      </Text>
      <Text className="nature-picker__effect-down">
        -10% {STAT_LABELS[nature.downStat]}
      </Text>
    </View>
  );
}

export default function NaturePicker({ onChange, side, value }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getNature(value);
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const groups = useMemo(
    () =>
      QUICK_STATS.map((stat) => ({
        label: STAT_LABELS[stat],
        natures: NATURES.filter((nature) => nature.upStat === stat),
        stat,
      })),
    [],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredGroups = useMemo(() => groups
    .map((group) => ({
      ...group,
      natures: group.natures.filter((nature) => [
        nature.name,
        STAT_LABELS[nature.upStat],
        STAT_LABELS[nature.downStat],
      ].join(" ").toLocaleLowerCase().includes(normalizedQuery)),
    }))
    .filter((group) => group.natures.length > 0)
    .sort((left, right) => {
      if (!normalizedQuery) return 0;
      return Number(!left.label.toLocaleLowerCase().includes(normalizedQuery))
        - Number(!right.label.toLocaleLowerCase().includes(normalizedQuery));
    }), [groups, normalizedQuery]);
  const showNeutral = !normalizedQuery || "普通 无修正"
    .includes(normalizedQuery);

  function chooseNature(natureId) {
    onChange(natureId);
    setQuery("");
    setExpanded(false);
  }

  function toggleExpanded() {
    setExpanded((current) => {
      if (current) setQuery("");
      return !current;
    });
  }

  return (
    <View className="nature-picker">
      <Button
        aria-expanded={expanded}
        aria-label={`${sideLabel}性格`}
        className={expanded
          ? "nature-picker__trigger nature-picker__trigger--expanded"
          : "nature-picker__trigger"}
        onClick={toggleExpanded}
      >
        <View className="nature-picker__trigger-copy">
          <Text className="nature-picker__caption">性格</Text>
          <Text className="nature-picker__value">{selected.name}</Text>
        </View>
        <NatureEffect nature={selected} />
      </Button>

      {expanded ? (
        <View aria-label={`${sideLabel}性格选项`} className="nature-picker__menu">
          <Input
            aria-label={`搜索${sideLabel}性格`}
            className="nature-picker__search"
            placeholder="搜索性格或属性"
            type="search"
            value={query}
            onInput={(event) => setQuery(readInputValue(event))}
          />
          {showNeutral ? (
            <Button
              aria-label="普通 无修正"
              aria-pressed={selected.id === "neutral"}
              className={selected.id === "neutral"
                ? "nature-picker__option nature-picker__option--selected"
                : "nature-picker__option"}
              onClick={() => chooseNature("neutral")}
            >
              <Text>普通</Text>
              <Text className="nature-picker__option-effect">
                {selected.id === "neutral" ? "✓ 已选" : "无修正"}
              </Text>
            </Button>
          ) : null}
          {filteredGroups.map((group) => (
            <View className="nature-picker__group" key={group.stat}>
              <Text className="nature-picker__group-title">
                提升{group.label}
              </Text>
              {group.natures.map((nature) => (
                <Button
                  aria-label={`${nature.name} 提升${STAT_LABELS[nature.upStat]} 降低${STAT_LABELS[nature.downStat]}`}
                  aria-pressed={selected.id === nature.id}
                  className={selected.id === nature.id
                    ? "nature-picker__option nature-picker__option--selected"
                    : "nature-picker__option"}
                  key={nature.id}
                  onClick={() => chooseNature(nature.id)}
                >
                  <Text>{nature.name}</Text>
                  <Text className="nature-picker__option-effect">
                    {selected.id === nature.id
                      ? "✓ 已选"
                      : `+${STAT_LABELS[nature.upStat]} · -${STAT_LABELS[nature.downStat]}`}
                  </Text>
                </Button>
              ))}
            </View>
          ))}
          {!showNeutral && filteredGroups.length === 0 ? (
            <Text className="nature-picker__empty">未找到匹配性格</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
