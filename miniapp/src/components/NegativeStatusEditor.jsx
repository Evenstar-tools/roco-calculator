import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import {
  NEGATIVE_STATUS_DEFINITIONS,
  NEGATIVE_STATUS_KEYS,
  normalizeNegativeStatusSide,
} from "../shared/domain/negative-status.js";

const SIDE_LABELS = Object.freeze({
  attacker: "攻击方",
  defender: "防守方",
});

export default function NegativeStatusEditor({ onChange, statuses }) {
  const [activeSide, setActiveSide] = useState("defender");
  const values = normalizeNegativeStatusSide(statuses?.[activeSide]);
  const sideLabel = SIDE_LABELS[activeSide];

  return (
    <View aria-label="负面状态层数" className="negative-status-editor">
      <View className="negative-status-editor__heading">
        <Text className="negative-status-editor__title">负面状态</Text>
        <Text className="negative-status-editor__hint">参与本次伤害结算</Text>
      </View>
      <View aria-label="负面状态对象" className="negative-status-editor__tabs">
        {Object.entries(SIDE_LABELS).map(([side, label]) => {
          const sideValues = normalizeNegativeStatusSide(statuses?.[side]);
          const total = NEGATIVE_STATUS_KEYS.reduce(
            (sum, key) => sum + sideValues[key],
            0,
          );
          return (
            <Button
              aria-label={`查看${label}负面状态`}
              aria-pressed={activeSide === side}
              className={activeSide === side
                ? "negative-status-editor__tab negative-status-editor__tab--active"
                : "negative-status-editor__tab"}
              key={side}
              onClick={() => setActiveSide(side)}
            >
              <Text>{label}</Text>
              {total > 0 ? <Text>{total}</Text> : null}
            </Button>
          );
        })}
      </View>
      <View className="negative-status-editor__side">
        <View className="negative-status-editor__grid">
          {NEGATIVE_STATUS_KEYS.map((key) => {
            const label = NEGATIVE_STATUS_DEFINITIONS[key].label;
            const maximum = key === "electrified" ? 2 : 99;
            return (
              <View className="negative-status-editor__item" key={key}>
                <Text className="negative-status-editor__label">{label}</Text>
                <View className="negative-status-editor__stepper">
                  <Button
                    aria-label={`${sideLabel}${label}层数减少`}
                    className="negative-status-editor__step"
                    disabled={values[key] <= 0}
                    onClick={() => onChange?.(
                      activeSide,
                      key,
                      values[key] - 1,
                    )}
                  >
                    −
                  </Button>
                  <Text className="negative-status-editor__value">
                    {values[key]}
                  </Text>
                  <Button
                    aria-label={`${sideLabel}${label}层数增加`}
                    className="negative-status-editor__step"
                    disabled={values[key] >= maximum}
                    onClick={() => onChange?.(
                      activeSide,
                      key,
                      values[key] + 1,
                    )}
                  >
                    +
                  </Button>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
