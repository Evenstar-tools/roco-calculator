import { forwardRef } from "react";
import { Button, Text, View } from "@tarojs/components";
import { RESULT_TRIGGER_ID } from "../platform/result-interaction.js";

const ResultBar = forwardRef(function ResultBar(
  { open, onOpen, view },
  ref,
) {
  const exact = view?.status === "exact";
  const result = view?.selectedResult;
  const remainingPercent =
    exact && Number.isFinite(result?.remainingHpPercent)
      ? `${Math.round(result.remainingHpPercent)}%`
      : "--";

  return (
    <View aria-label="当前伤害结果" className="result-bar">
      <View className="result-bar__matchup">
        <Text className="result-bar__names">
          {view?.attackerName ?? "攻击方"} →{" "}
          {view?.defenderName ?? "防守方"}
        </Text>
        <Text className="result-bar__skill">
          {exact ? result.skillName : view?.message ?? "请选择技能"}
        </Text>
      </View>
      <View className="result-bar__metrics">
        <Text aria-label="确定性伤害" className="result-bar__damage">
          {exact ? result.totalDamage : "--"}
        </Text>
        <Text className="result-bar__percent">{remainingPercent}</Text>
      </View>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="展开伤害结果"
        className="result-bar__action"
        id={RESULT_TRIGGER_ID}
        onClick={onOpen}
        ref={ref}
        tabIndex={0}
      >
        详情
      </Button>
      <Button
        aria-label="分享当前计算"
        className="result-bar__action result-bar__share"
        openType="share"
      >
        分享
      </Button>
    </View>
  );
});

export default ResultBar;
