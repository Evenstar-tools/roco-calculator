import { useMemo, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { MARK_DEFINITIONS } from "../shared/domain/marks.js";
import ConditionSection from "./ConditionSection.jsx";
import MarkEditor from "./MarkEditor.jsx";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

function markName(slot, polarity) {
  return MARK_DEFINITIONS[polarity].find((mark) => mark.id === slot?.id)?.name;
}

function sideSummary(marks) {
  const names = [
    markName(marks?.positive, "positive"),
    markName(marks?.negative, "negative"),
  ].filter(Boolean);
  return names.length ? names.join("+") : "无";
}

function activeMarkCount(marks) {
  return [marks?.positive, marks?.negative].filter(
    (slot) => slot?.id && Number(slot.stacks) > 0,
  ).length;
}

export default function BattleMarksEditor({ marks, onChange }) {
  const activeCount = activeMarkCount(marks?.attacker) +
    activeMarkCount(marks?.defender);
  const initialSide = activeMarkCount(marks?.defender) > 0 ? "defender" : "attacker";
  const [activeSide, setActiveSide] = useState(initialSide);
  const summary = useMemo(
    () => `攻击方 ${sideSummary(marks?.attacker)} · 防守方 ${sideSummary(marks?.defender)}`,
    [marks],
  );

  return (
    <ConditionSection
      className="condition-section--marks"
      defaultOpen={activeCount > 0}
      summary={summary}
      title="印记"
    >
      <View className="battle-marks">
        <View aria-label="印记阵营" className="battle-marks__tabs">
          {Object.entries(SIDE_LABELS).map(([side, label]) => (
            <Button
              aria-label={`编辑${label}印记`}
              aria-pressed={activeSide === side}
              className={activeSide === side
                ? "battle-marks__tab battle-marks__tab--active"
                : "battle-marks__tab"}
              key={side}
              onClick={() => setActiveSide(side)}
            >
              {label}
            </Button>
          ))}
        </View>
        <View className="battle-marks__editors">
          {Object.keys(SIDE_LABELS).map((side) => (
            <View
              className={activeSide === side
                ? "battle-marks__editor battle-marks__editor--active"
                : "battle-marks__editor"}
              key={side}
            >
              <MarkEditor
                marks={marks?.[side]}
                onChange={(polarity, value) => onChange(side, polarity, value)}
                side={side}
              />
            </View>
          ))}
        </View>
      </View>
    </ConditionSection>
  );
}
