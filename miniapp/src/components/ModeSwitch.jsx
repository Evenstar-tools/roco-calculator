import { Button, View } from "@tarojs/components";

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
        onClick={() => onChange("single")}
      >
        单技能
      </Button>
      <Button
        aria-label="四技能模式"
        aria-pressed={value === "four"}
        className={
          value === "four"
            ? "mode-switch__button mode-switch__button--active"
            : "mode-switch__button"
        }
        onClick={() => onChange("four")}
      >
        四技能
      </Button>
    </View>
  );
}
