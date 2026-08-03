import { useMemo, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
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

  function chooseNature(natureId) {
    onChange(natureId);
    setExpanded(false);
  }

  return (
    <View className="nature-picker">
      <Button
        aria-expanded={expanded}
        aria-label={`${sideLabel}性格`}
        className="nature-picker__trigger"
        onClick={() => setExpanded((current) => !current)}
      >
        <View className="nature-picker__trigger-copy">
          <Text className="nature-picker__caption">性格</Text>
          <Text className="nature-picker__value">{selected.name}</Text>
        </View>
        <NatureEffect nature={selected} />
      </Button>

      {expanded ? (
        <View aria-label={`${sideLabel}性格选项`} className="nature-picker__menu">
          <Button
            aria-pressed={selected.id === "neutral"}
            className="nature-picker__option"
            onClick={() => chooseNature("neutral")}
          >
            <Text>普通</Text>
            <Text className="nature-picker__option-effect">无修正</Text>
          </Button>
          {groups.map((group) => (
            <View className="nature-picker__group" key={group.stat}>
              <Text className="nature-picker__group-title">
                提升{group.label}
              </Text>
              {group.natures.map((nature) => (
                <Button
                  aria-label={`${nature.name} 提升${STAT_LABELS[nature.upStat]} 降低${STAT_LABELS[nature.downStat]}`}
                  aria-pressed={selected.id === nature.id}
                  className="nature-picker__option"
                  key={nature.id}
                  onClick={() => chooseNature(nature.id)}
                >
                  <Text>{nature.name}</Text>
                  <Text className="nature-picker__option-effect">
                    +{STAT_LABELS[nature.upStat]} · -
                    {STAT_LABELS[nature.downStat]}
                  </Text>
                </Button>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
