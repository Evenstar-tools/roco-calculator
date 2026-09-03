import { Button, Image, Text, View } from "@tarojs/components";
import { getNature, STAT_LABELS } from "../shared/domain/natures.js";
import { createShareSummary } from "../view-models/share-summary.js";

const STAT_KEYS = [
  "hp",
  "physicalAttack",
  "magicalAttack",
  "speed",
  "physicalDefense",
  "magicalDefense",
];

function spiritFor(snapshot, spiritId) {
  return (snapshot?.spirits ?? []).find((spirit) => spirit.id === spiritId);
}

function imageFor(petImages, spirit) {
  return petImages?.[spirit?.id] ?? spirit?.imageUrl ?? "";
}

function natureSummary(side) {
  const nature = getNature(side?.nature);
  if (!nature.upStat || !nature.downStat) return nature.name;
  return `${nature.name} · ${STAT_LABELS[nature.upStat]}↑ / ${STAT_LABELS[nature.downStat]}↓`;
}

function ivSummary(side) {
  const values = side?.displayIvs ?? {};
  const changed = STAT_KEYS.filter((key) => Number(values[key]) !== 60);
  if (changed.length === 0) return "个体全60";
  return changed.map((key) => `${STAT_LABELS[key]}${values[key]}`).join(" · ");
}

function damagePercent(result) {
  return Number.isFinite(result?.hpPercent)
    ? `${Number(result.hpPercent).toFixed(1)}% HP`
    : "暂不可计算";
}

function completenessLabel(completeness) {
  if (completeness === "full") return "完整配置";
  if (completeness === "reduced") return "核心配置";
  return "基础配置";
}

function CombatantSummary({ imageUrl, label, name, side }) {
  return (
    <View className="shared-result__combatant">
      {imageUrl ? (
        <Image
          alt={`${name}图标`}
          className="shared-result__spirit-image"
          mode="aspectFit"
          src={imageUrl}
        />
      ) : null}
      <View className="shared-result__combatant-copy">
        <Text className="shared-result__side-label">{label}</Text>
        <Text className="shared-result__spirit-name">{name}</Text>
        <Text className="shared-result__detail-line">{natureSummary(side)}</Text>
        <Text className="shared-result__detail-line">{ivSummary(side)}</Text>
      </View>
    </View>
  );
}

export default function SharedResultPage({
  completeness = "full",
  direction = "forward",
  onContinue,
  onOpenLocal,
  onReturnLocal,
  petImages,
  snapshot,
  state,
  status = "preview",
  view,
}) {
  if (status === "invalid") {
    return (
      <View className="shared-result-page shared-result-page--invalid">
        <View className="shared-result__invalid-card">
          <Text className="shared-result__eyebrow">好友分享</Text>
          <Text className="shared-result__invalid-title">分享内容无法读取</Text>
          <Text className="shared-result__invalid-copy">
            链接可能已失效或内容不完整，你的本机配置没有被修改。
          </Text>
          <Button
            className="shared-result__primary"
            hoverClass="button-hover"
            onClick={onOpenLocal}
          >
            打开我的计算器
          </Button>
        </View>
      </View>
    );
  }

  const attackerSide = direction === "reverse"
    ? state?.sides?.defender
    : state?.sides?.attacker;
  const defenderSide = direction === "reverse"
    ? state?.sides?.attacker
    : state?.sides?.defender;
  const attacker = spiritFor(snapshot, attackerSide?.spiritId);
  const defender = spiritFor(snapshot, defenderSide?.spiritId);
  const selected = view?.selectedResult;
  const summary = createShareSummary({
    direction,
    snapshot,
    state,
  });
  const healthPercent = Number.isFinite(selected?.hpPercent)
    ? Math.max(0, Math.min(100, selected.hpPercent))
    : 0;

  return (
    <View className="shared-result-page">
      <View className="shared-result__topline">
        <View>
          <Text className="shared-result__badge">好友分享快照 · 已载入</Text>
          <Text className="shared-result__safety">本次预览不会覆盖你的本机配置</Text>
        </View>
        <Text className="shared-result__completeness">
          {completenessLabel(completeness)}
        </Text>
      </View>
      {completeness !== "full" ? (
        <Text className="shared-result__incomplete-warning">
          吞噬特性/参数可能未完整携带
        </Text>
      ) : null}

      <View className="shared-result__hero">
        <Text className="shared-result__matchup">
          {view?.attackerName ?? "攻击方"} → {view?.defenderName ?? "防守方"}
        </Text>
        <Text className="shared-result__skill">
          {selected?.skillName ?? view?.message ?? "计算结果"}
        </Text>
        <View className="shared-result__damage-row">
          <Text className="shared-result__damage">
            {Number.isFinite(selected?.totalDamage) ? selected.totalDamage : "—"}
          </Text>
          <Text className="shared-result__percent">{damagePercent(selected)}</Text>
        </View>
        <View className="shared-result__health-row">
          <View className="shared-result__health-track">
            <View
              className="shared-result__health-fill"
              style={{ width: `${healthPercent}%` }}
            />
          </View>
          <Text className="shared-result__remaining">
            {Number.isFinite(selected?.remainingHp)
              ? `剩余 ${selected.remainingHp} HP`
              : "等待补充条件"}
          </Text>
        </View>
      </View>

      <View className="shared-result__combatants">
        <CombatantSummary
          imageUrl={imageFor(petImages, attacker)}
          label="攻击方"
          name={attacker?.fullName ?? view?.attackerName ?? "未选择"}
          side={attackerSide}
        />
        <CombatantSummary
          imageUrl={imageFor(petImages, defender)}
          label="防守方"
          name={defender?.fullName ?? view?.defenderName ?? "未选择"}
          side={defenderSide}
        />
      </View>

      <View className="shared-result__configuration">
        <View className="shared-result__configuration-row">
          <Text className="shared-result__configuration-label">计算模式</Text>
          <Text className="shared-result__configuration-value">
            {summary.modeLabel}
          </Text>
        </View>
        <View className="shared-result__configuration-row">
          <Text className="shared-result__configuration-label">能力等级</Text>
          <Text className="shared-result__configuration-value">
            攻击 {summary.attackStageLabel} · 防御 {summary.defenseStageLabel}
          </Text>
        </View>
        <View className="shared-result__configuration-row">
          <Text className="shared-result__configuration-label">战斗条件</Text>
          <Text className="shared-result__configuration-value">
            {summary.conditions.length
              ? summary.conditions.join(" · ")
              : "无额外条件"}
          </Text>
        </View>
      </View>

      <View className="shared-result__skills">
        <Text className="shared-result__section-title">技能结果</Text>
        {(view?.rows ?? []).slice(0, state?.mode === "four" ? 4 : 1).map((row, index) => (
          <View
            className={`shared-result__skill-row${row === selected ? " shared-result__skill-row--active" : ""}`}
            key={`${row?.skillId ?? "skill"}-${index}`}
          >
            <Text className="shared-result__skill-index">{index + 1}</Text>
            <Text className="shared-result__skill-name">{row?.skillName ?? row?.message ?? "未配置"}</Text>
            <Text className="shared-result__skill-damage">
              {Number.isFinite(row?.totalDamage) ? row.totalDamage : "—"}
            </Text>
            <Text className="shared-result__skill-percent">{damagePercent(row)}</Text>
          </View>
        ))}
      </View>

      <View className="shared-result__actions">
        <Button
          className="shared-result__primary"
          hoverClass="button-hover"
          onClick={onContinue}
        >
          用此配置继续计算
        </Button>
        <Button
          className="shared-result__secondary"
          hoverClass="button-hover"
          onClick={onReturnLocal}
        >
          返回我的配置
        </Button>
      </View>
    </View>
  );
}
