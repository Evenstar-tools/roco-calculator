import { Text, View } from "@tarojs/components";
import { ConditionField } from "./ConditionField.jsx";

const ROLE_LABELS = {
  attacker: "攻击特性",
  defender: "防御特性",
};

function storedValue(values, ownerSide, key) {
  const sideValues = values?.[ownerSide];
  if (sideValues && Object.hasOwn(sideValues, key)) {
    return sideValues[key];
  }
  return values?.[key];
}

function controlValue(battleContext, values, view, control) {
  if (control.scope === "battle") {
    if (Object.hasOwn(battleContext ?? {}, control.id)) {
      return battleContext[control.id];
    }
    return control.defaultValue;
  }
  return storedValue(values, view.ownerSide, control.canonicalKey) ??
    control.defaultValue;
}

function visibleControls(view, values, battleContext) {
  return view.controls.filter((control) => {
    const condition = control.visibleWhen ?? control.when;
    if (!condition) return true;
    const conditionKey =
      condition.contextKey ?? condition.key ?? condition.id;
    const source = view.controls.find(
      (candidate) =>
        (candidate.contextKey ?? candidate.key ?? candidate.id) ===
        conditionKey,
    );
    if (!source) return false;
    const value = controlValue(battleContext, values, view, source);
    return value === condition.equals;
  });
}

export default function TraitConditionEditor({
  battleContext = {},
  onChange,
  values = {},
  views,
}) {
  return (
    <View aria-label="特性条件" className="condition-editor">
      {Object.entries(views ?? {}).map(([role, view]) =>
        view ? (
          <View
            className={`condition-editor__group condition-editor__group--${role}`}
            key={role}
          >
            <View className="trait-editor__heading">
              <Text className="condition-editor__label">
                {ROLE_LABELS[role]}
              </Text>
              <Text className="trait-editor__name">{view.name}</Text>
            </View>
            <Text className="trait-editor__description">
              {view.description}
            </Text>
            {view.automaticStack ? (
              <Text className="trait-editor__automatic">
                {view.automaticStack.label}：{view.automaticStack.value}
              </Text>
            ) : null}
            <View className="trait-editor__controls">
              {visibleControls(view, values, battleContext).map((control) => (
                <ConditionField
                  className="trait-editor__control"
                  input={control}
                  key={control.id}
                  onChange={(value) => {
                    if (control.scope === "battle") {
                      onChange(
                        view.ownerSide,
                        control.canonicalKey,
                        value,
                        control,
                      );
                    } else {
                      onChange(view.ownerSide, control.canonicalKey, value);
                    }
                  }}
                  value={controlValue(battleContext, values, view, control)}
                />
              ))}
            </View>
          </View>
        ) : null,
      )}
    </View>
  );
}
