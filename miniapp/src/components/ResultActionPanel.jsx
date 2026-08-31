import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { ConditionField } from "./ConditionField.jsx";

const CATEGORIES = Object.freeze([
  { key: "parameters", label: "技能参数" },
  { key: "defense", label: "防御" },
  { key: "modifiers", label: "增减" },
]);

const EMPTY_CATEGORY_COPY = Object.freeze({
  defense: "暂无防御类效果。可触发：防御技能、防守特性、应对成功后的附加增益。",
  modifiers: "暂无增减类效果。可触发：状态技能、攻击特性，以及能力或威力变化效果。",
});

function inputKey(input) {
  return input.contextKey ?? input.key ?? input.id;
}

function inputValue(action, input) {
  if (action.kind === "trait") {
    return action.values?.[input.canonicalKey] ?? action.value;
  }
  return action.context?.[inputKey(input)] ?? input.defaultValue;
}

function actionIsActive(action, activeActionKeys) {
  if (activeActionKeys.includes(action.key)) return true;
  return action.kind === "trait" &&
    action.control?.type === "boolean" &&
    action.value === true;
}

export default function ResultActionPanel({
  actions,
  activeActionKeys = [],
  feedback,
  hiddenActionKeys = [],
  onApplyAction,
  onControlChange,
  parameterContent,
  parameterSummary,
}) {
  const [category, setCategory] = useState("parameters");
  const hiddenActions = new Set(hiddenActionKeys);
  const actionsForCategory = (key) => (actions?.[key] ?? []).filter(
    (action) => !hiddenActions.has(action.key),
  );
  const visibleActions = actionsForCategory(category);

  return (
    <View aria-label="结果调整工作台" className="result-actions">
      <View className="result-actions__heading">
        <Text className="result-sheet__section-title">结果调整</Text>
        <Text className="result-actions__hint">修改后原位更新结果</Text>
      </View>
      <View aria-label="调整分类" className="result-actions__categories">
        {CATEGORIES.map((item) => (
          <Button
            aria-label={item.label}
            aria-pressed={category === item.key}
            className={[
              "result-actions__category",
              category === item.key ? "result-actions__category--active" : "",
            ].filter(Boolean).join(" ")}
            key={item.key}
            onClick={() => setCategory(item.key)}
          >
            {item.label}
            {item.key === "parameters" ? null : (
              <Text className="result-actions__count">
                {actionsForCategory(item.key).length}
              </Text>
            )}
          </Button>
        ))}
      </View>
      {category === "parameters" ? (
        <View aria-label="当前技能参数" className="result-actions__parameters">
          <View className="result-actions__parameter-heading">
            <Text className="result-actions__parameter-label">当前技能</Text>
            <Text className="result-actions__parameter-name">
              {parameterSummary ?? "未选择技能"}
            </Text>
          </View>
          {parameterContent ?? (
            <Text className="result-actions__empty">
              调整当前技能的威力、连击和应对条件。
            </Text>
          )}
        </View>
      ) : (
        <View className="result-actions__list">
        {visibleActions.length ? visibleActions.map((action) => {
          const active = actionIsActive(action, activeActionKeys);
          const editableControls = action.kind === "trait" &&
              action.control?.type === "boolean"
            ? []
            : action.controls ?? [];
          const showsActionButton = action.kind === "skill" ||
            action.control?.type === "boolean";
          return (
            <View
              aria-label={`${action.name}触发项`}
              className={[
                "result-actions__item",
                active ? "result-actions__item--active" : "",
              ].filter(Boolean).join(" ")}
              key={action.key}
            >
              <View className="result-actions__item-heading">
                <View className="result-actions__copy">
                  <View className="result-actions__title-row">
                    <Text className="result-actions__source">
                      {action.source}
                    </Text>
                    <Text className="result-actions__name">
                      {action.name}
                    </Text>
                  </View>
                  <Text className="result-actions__description">
                    {action.description}
                  </Text>
                  {action.triggerHint ? (
                    <Text className="result-actions__trigger">
                      触发说明 · {action.triggerHint}
                    </Text>
                  ) : null}
                  {action.effectHint ? (
                    <Text className="result-actions__effect">
                      {action.effectHint}
                    </Text>
                  ) : null}
                </View>
                {showsActionButton ? (
                  <Button
                    aria-label={`${active ? "撤销" : "触发"}${action.name}`}
                    aria-pressed={active}
                    className={[
                      "result-actions__apply",
                      active ? "result-actions__apply--active" : "",
                    ].filter(Boolean).join(" ")}
                    hoverClass="button-hover"
                    onClick={() => onApplyAction(action)}
                  >
                    {active ? "取消" : "触发"}
                  </Button>
                ) : null}
              </View>
              {editableControls.length ? (
                <View className="result-actions__controls">
                  {editableControls.map((input) => (
                    <View
                      className={[
                        "result-actions__control-slot",
                        input.type === "boolean"
                          ? "result-actions__control-slot--boolean"
                          : "",
                      ].filter(Boolean).join(" ")}
                      key={inputKey(input)}
                    >
                      <ConditionField
                        className="result-actions__control"
                        input={input}
                        onChange={(value) =>
                          onControlChange(action, input, value)
                        }
                        value={inputValue(action, input)}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
              {feedback?.actionKey === action.key ? (
                <Text
                  aria-live="polite"
                  className="result-actions__feedback"
                >
                  {feedback.message}
                </Text>
              ) : null}
            </View>
          );
        }) : (
          <Text className="result-actions__empty">
            {EMPTY_CATEGORY_COPY[category] ?? "当前分类没有可触发项目"}
          </Text>
        )}
        </View>
      )}
    </View>
  );
}
