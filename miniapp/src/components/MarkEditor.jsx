import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import {
  MARK_DEFINITIONS,
  normalizeMarksState,
} from "../shared/domain/marks.js";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

const POLARITY_LABELS = {
  negative: "负面",
  positive: "正面",
};

function eventValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function normalizeSideMarks(marks, side) {
  return normalizeMarksState({ [side]: marks })[side];
}

function MarkSlot({ onChange, polarity, sideLabel, value }) {
  const label = POLARITY_LABELS[polarity];
  const selected = MARK_DEFINITIONS[polarity].find(
    (mark) => mark.id === value.id,
  );

  function select(id) {
    onChange({
      id,
      stacks: id ? Math.max(1, value.stacks) : 0,
    });
  }

  return (
    <View className="mark-editor__slot">
      <Text className="condition-editor__label">{label}印记</Text>
      <View className="condition-editor__choices mark-editor__choices">
        <Button
          aria-label={`${sideLabel}${label}印记无`}
          aria-pressed={!selected}
          className={
            !selected
              ? "mark-editor__control condition-editor__choice condition-editor__choice--active"
              : "mark-editor__control condition-editor__choice"
          }
          onClick={() => select(null)}
        >
          无
        </Button>
        {MARK_DEFINITIONS[polarity].map((mark) => (
          <Button
            aria-label={`${sideLabel}${label}印记${mark.name}`}
            aria-pressed={value.id === mark.id}
            className={
              value.id === mark.id
                ? "mark-editor__control condition-editor__choice condition-editor__choice--active"
                : "mark-editor__control condition-editor__choice"
            }
            key={mark.id}
            onClick={() => select(mark.id)}
          >
            {mark.name}
          </Button>
        ))}
      </View>
      <View
        aria-hidden={!selected}
        className={
          selected
            ? "mark-editor__stacks condition-editor__field condition-editor__field--number"
            : "mark-editor__stacks mark-editor__stacks--hidden condition-editor__field condition-editor__field--number"
        }
      >
        <Text className="condition-editor__label">层数</Text>
        <Input
          aria-label={selected ? `${sideLabel}${selected.name}层数` : undefined}
          className="mark-editor__control condition-editor__input"
          disabled={!selected}
          inputMode="numeric"
          max={99}
          min={0}
          onInput={(event) => {
            if (!selected) return;
            onChange({
              id: selected.id,
              stacks: Math.min(
                99,
                Math.max(0, Math.floor(Number(eventValue(event)) || 0)),
              ),
            });
          }}
          type="number"
          value={selected ? value.stacks : 0}
        />
      </View>
    </View>
  );
}

export default function MarkEditor({ marks, onChange, side }) {
  const sideLabel = SIDE_LABELS[side] ?? side;
  const [draft, setDraft] = useState(() =>
    normalizeSideMarks(marks, side),
  );

  useEffect(() => {
    setDraft(normalizeSideMarks(marks, side));
  }, [marks, side]);

  function update(polarity, value) {
    const next = normalizeMarksState({
      [side]: {
        ...draft,
        [polarity]: value,
      },
    })[side];
    setDraft(next);
    onChange(polarity, next[polarity]);
  }

  return (
    <View aria-label={`${sideLabel}印记`} className="mark-editor">
      <Text className="condition-editor__label">{sideLabel}印记</Text>
      {(["positive", "negative"]).map((polarity) => (
        <MarkSlot
          key={polarity}
          onChange={(value) => update(polarity, value)}
          polarity={polarity}
          sideLabel={sideLabel}
          value={draft[polarity]}
        />
      ))}
    </View>
  );
}
