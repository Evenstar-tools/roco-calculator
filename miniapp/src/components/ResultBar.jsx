import { forwardRef } from "react";
import { Button, Image, Input, Text, View } from "@tarojs/components";
import caretRightIcon from "../assets/icons/caret-right.png";
import { RESULT_TRIGGER_ID } from "../platform/result-interaction.js";
import { damagePresentation, resultTone } from "../view-models/result-presentation.js";
import DamageSegments from "./DamageSegments.jsx";

const ResultBar = forwardRef(function ResultBar(
  {
    mode = "single",
    onCurrentHpChange,
    open,
    onOpen,
    onOpenComparison,
    selectedSkillIndex = 0,
    view,
  },
  ref,
) {
  const exact = view?.status === "exact";
  const result = view?.selectedResult;
  const presentation = damagePresentation(result);
  const damagePercent =
    exact && Number.isFinite(result?.hpPercent)
      ? `${presentation.percent.toFixed(1)}%${presentation.freezePercent > 0 ? "" : " HP"}`
      : "--";
  const damageTone = resultTone(exact ? presentation.percent : null);
  const remainingHp =
    exact && Number.isFinite(presentation.remainingHp)
      ? presentation.remainingHp
      : "--";
  const targetHp = Number.isFinite(view?.defenderHp)
    ? view.defenderHp
    : "";
  const targetMaxHp = Number.isFinite(view?.defenderMaxHp)
    ? view.defenderMaxHp
    : null;
  const skillCount = Math.max(1, view?.rows?.length ?? 0);
  const skillPosition = mode === "four"
    ? `${Math.min(skillCount - 1, Math.max(0, selectedSkillIndex)) + 1}/${skillCount}`
    : null;

  function updateTargetHp(event) {
    const raw = event?.detail?.value ?? event?.target?.value ?? "";
    if (String(raw).trim() === "") return;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    onCurrentHpChange?.(
      Math.min(targetMaxHp ?? numeric, Math.max(0, Math.floor(numeric))),
    );
  }

  return (
    <View aria-label="当前伤害结果" className="result-bar">
      <View className="result-bar__matchup">
        <View className="result-bar__names">
          <Text className="result-bar__attacker-name">
            {view?.attackerName ?? "攻击方"}
          </Text>
          <Text className="result-bar__arrow">→</Text>
          <Text className="result-bar__defender-name">
            {view?.defenderName ?? "防守方"}
          </Text>
        </View>
        <View className="result-bar__skill-row">
          <Text className="result-bar__skill">
            {exact ? result.skillName : view?.message ?? "请选择技能"}
          </Text>
          {skillPosition ? (
            <Text className="result-bar__skill-position">{skillPosition}</Text>
          ) : null}
        </View>
      </View>
      <View className="result-bar__metrics">
        <View className="result-bar__primary-value">
          <Text aria-label="确定性伤害" className="result-bar__damage">
            {exact ? presentation.damage ?? "—" : "--"}
          </Text>
          <View className="result-bar__metric-copy">
            <Text className="result-bar__metric-label">{presentation.statusDamage > 0 ? "合计伤害" : "伤害"}</Text>
            <Text
              className={`result-bar__percent result-bar__percent--${damageTone}`}
            >
              {damagePercent}
            </Text>
          </View>
        </View>
        <Text className="result-bar__remaining result-bar__mobile-remaining">
          {presentation.outcome ?? `剩余 ${remainingHp} HP`}
        </Text>
      </View>
      <View className="result-bar__health">
        <View aria-label="伤害占目标生命比例" className="result-bar__track">
          <View className="result-bar__track-line">
            <DamageSegments presentation={presentation} className={`result-bar__track-fill result-bar__track-fill--${damageTone}`} />
          </View>
          <Text className="result-bar__track-value">
            {exact && Number.isFinite(result?.hpPercent)
              ? `${presentation.percent.toFixed(1)}%`
              : "--"}
          </Text>
        </View>
        <View className="result-bar__target-hp">
          <Text>目标 HP</Text>
          <Input
            aria-label="结果栏目标当前生命"
            className="result-bar__target-input"
            inputMode="numeric"
            max={targetMaxHp ?? undefined}
            min="0"
            onInput={updateTargetHp}
            type="number"
            value={targetHp}
          />
          <Text className="result-bar__target-max">
            {targetMaxHp === null ? "/ --" : `/ ${targetMaxHp}`}
          </Text>
        </View>
      </View>
      {view?.rows?.length ? (
        <View aria-label="技能结果概览" className="result-bar__rows">
          {view.rows.slice(0, 4).map((row, index) => {
            const rowExact =
              row?.status === "exact" &&
              Number.isFinite(row?.hpPercent);
            const rowPresentation = damagePresentation(row);
            const rowTone = resultTone(rowExact ? rowPresentation.percent : null);
            return (
              <View
                className="result-bar__row"
                key={`${row?.skillId ?? "slot"}-${index}`}
              >
                <Text className="result-bar__row-index">{index + 1}</Text>
                <Text className="result-bar__row-name">
                  {row?.skillName ?? `技能 ${index + 1}`}
                </Text>
                <View className="result-bar__row-track">
                  <DamageSegments presentation={rowPresentation} className={`result-bar__row-track-fill--${rowTone}`} />
                </View>
                <Text className="result-bar__row-damage">
                  {rowExact ? rowPresentation.damage ?? "—" : "--"}
                </Text>
                <Text
                  className={`result-bar__row-percent result-bar__row-percent--${rowTone}`}
                >
                  {rowExact ? `${rowPresentation.percent.toFixed(1)}%` : "--"}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <View className="dc-result-actions">
      {result?.gainSummary ? (
        <View className="result-bar__gains result-sheet__conditions" aria-label="计算条件">
          <Text className="result-sheet__section-title">计算条件</Text>
          <Text className="result-sheet__gains"><Text className="result-sheet__gain-label">增益来源</Text>　{result.gainSummary}</Text>
        </View>
      ) : null}
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
        <Text className="result-bar__action-label">查看伤害详情</Text>
        <Image
          alt=""
          aria-hidden="true"
          className="result-bar__action-icon"
          mode="aspectFit"
          src={caretRightIcon}
        />
      </Button>
      {onOpenComparison ? <Button className="dc-entry" onClick={onOpenComparison}>承伤对比</Button> : null}
      </View>
    </View>
  );
});

export default ResultBar;
