import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { ConditionField } from "./ConditionField.jsx";

const CATEGORIES = Object.freeze([
  { key: "status", label: "状态" },
  { key: "defense", label: "防御" },
  { key: "modifiers", label: "增减" },
]);

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
  onApplyAction,
  onControlChange,
}) {
  const [category, setCategory] = useState(
    () => CATEGORIES.find((item) => actions?.[item.key]?.length)?.key ?? "status",
  );
  const visibleActions = actions?.[category] ?? [];

  return (
    <View aria-label="触发工作台" className="result-actions">
      <View className="result-actions__heading">
        <Text className="result-sheet__section-title">战斗触发</Text>
        <Text className="result-actions__hint">点击后原位更新结果</Text>
      </View>
      <View aria-label="触发分类" className="result-actions__categories">
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
            <Text className="result-actions__count">
              {actions?.[item.key]?.length ?? 0}
            </Text>
          </Button>
        ))}
      </View>
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
            当前分类没有可触发项目
          </Text>
        )}
      </View>
    </View>
  );
}
