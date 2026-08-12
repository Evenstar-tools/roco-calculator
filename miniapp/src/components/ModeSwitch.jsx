import { Button, Text, View } from "@tarojs/components";

export default function ModeSwitch({ onChange, value }) {
  return (
    <View aria-label="技能计算模式" className="mode-switch">
      <Button
        aria-label="单技能模式"
        aria-pressed={value === "single"}
        className={
          value === "single"
            ? "mode-switch__button mode-switch__button--active"
            : "mode-switch__button"
        }
        hoverClass="mode-switch__button--pressed"
        onClick={() => onChange("single")}
      >
        <Text className="mode-switch__short-label">单</Text>
        <Text className="mode-switch__long-label">单技能</Text>
      </Button>
      <Button
        aria-label="四技能模式"
        aria-pressed={value === "four"}
        className={
          value === "four"
            ? "mode-switch__button mode-switch__button--active"
            : "mode-switch__button"
        }
        hoverClass="mode-switch__button--pressed"
        onClick={() => onChange("four")}
      >
        <Text className="mode-switch__short-label">四</Text>
        <Text className="mode-switch__long-label">四技能</Text>
      </Button>
    </View>
  );
}
