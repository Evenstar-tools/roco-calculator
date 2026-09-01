import { Button, Input, Text, View } from "@tarojs/components";

export default function BattleConditionStrip({
  currentHp,
  maxHp,
  onCurrentHpChange,
  onOpen,
  open,
  summary,
}) {
  const labels = summary?.labels ?? [];
  const count = Number(summary?.count) || 0;

  function updateCurrentHp(event) {
    const raw = event?.detail?.value ?? event?.target?.value ?? "";
    if (String(raw).trim() === "") return;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    onCurrentHpChange?.(
      Math.min(maxHp ?? numeric, Math.max(0, Math.floor(numeric))),
    );
  }

  return (
    <View className="conditions-ribbon">
      <Button
        aria-expanded={open}
        aria-label="编辑战斗条件"
        className="conditions-ribbon__main"
        hoverClass="button-hover"
        onClick={onOpen}
      >
        <View className="conditions-ribbon__heading">
          <Text className="conditions-ribbon__title">战斗条件</Text>
          <Text
            className={count > 0
              ? "conditions-ribbon__count"
              : "conditions-ribbon__count conditions-ribbon__count--empty"}
          >
            {count > 0 ? `${count} 项` : "未设置"}
          </Text>
        </View>
        <Text className="conditions-ribbon__summary">
          {labels.length
            ? labels.slice(0, 3).join(" · ")
            : "点击添加特性、印记或环境"}
        </Text>
      </Button>
      <View className="conditions-ribbon__health">
        <Text className="conditions-ribbon__health-label">目标 HP</Text>
        <Input
          aria-label="目标当前生命"
          className="conditions-ribbon__health-input"
          inputMode="numeric"
          max={maxHp ?? undefined}
          min="0"
          onInput={updateCurrentHp}
          type="number"
          value={Number.isFinite(currentHp) ? currentHp : ""}
        />
        <Text className="conditions-ribbon__health-max">
          {Number.isFinite(maxHp) ? `/ ${maxHp}` : "/ --"}
        </Text>
      </View>
    </View>
  );
}
