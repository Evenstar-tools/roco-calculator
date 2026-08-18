import { Text, View } from "@tarojs/components";
import { ConditionField } from "./ConditionField.jsx";
import ConditionSection from "./ConditionSection.jsx";

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
  const visibleViews = Object.entries(views ?? {}).filter(([, view]) =>
    view && (
      (view.controls ?? []).length > 0 ||
      view.automaticStack ||
      view.lifesteal?.percent > 0 ||
      (view.skillPowerBonuses ?? []).length > 0
    )
  );
  if (visibleViews.length === 0) return null;

  const activeNames = visibleViews.map(([, view]) => view.name).filter(Boolean);
  const hasActiveControl = visibleViews.some(([, view]) =>
    (view.controls ?? []).some((control) =>
      !Object.is(
        controlValue(battleContext, values, view, control),
        control.defaultValue,
      )
    )
  );

  return (
    <ConditionSection
      className="condition-section--traits"
      defaultOpen={hasActiveControl}
      summary={activeNames.join(" · ")}
      title="特性与状态"
    >
      <View aria-label="特性与状态" className="condition-editor">
        {visibleViews.map(([role, view]) => (
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
              {view.sourceDescription ?? view.description}
            </Text>
            {(view.skillPowerBonuses ?? []).length ? (
              <View className="trait-editor__bonuses">
                {view.skillPowerBonuses.map((bonus, index) => (
                  <Text className="trait-editor__bonus" key={`${bonus.skillName}-${index}`}>
                    {bonus.skillName} {bonus.perHit ? "\u6bcf\u6bb5 " : ""}+{bonus.fixedPowerAdd}
                  </Text>
                ))}
              </View>
            ) : null}
            {view.automaticStack ? (
              <Text className="trait-editor__automatic">
                {view.automaticStack.label}：{view.automaticStack.value}
              </Text>
            ) : null}
            {view.lifesteal && (
              view.lifesteal.percent > 0 ||
              ["戏耍", "贪得无厌"].includes(view.name)
            ) ? (
              <Text className="trait-editor__automatic">
                吸血 {view.lifesteal.levels}层 · {view.lifesteal.percent}%
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
        ))}
      </View>
    </ConditionSection>
  );
}
