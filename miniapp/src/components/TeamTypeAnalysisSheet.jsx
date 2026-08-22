import { useMemo, useState } from "react";
import { Button, Image, Input, ScrollView, Text, View } from "@tarojs/components";
import { analyzeTeamDefensiveTypes } from "../shared/domain/team-type-analysis.js";
import {
  createSpiritSearchIndex,
  searchSpiritsWithFavorites,
} from "../view-models/spirit-search.js";
import ElementIcon from "./ElementIcon.jsx";

const EMPTY_MEMBERS = Object.freeze([null, null, null, null, null, null]);

function readInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function normalizeMembers(members) {
  return Array.from({ length: 6 }, (_, index) => members?.[index] ?? null);
}

function memberImageUrl(spirit, petImages) {
  return petImages?.[spirit?.id]
    ?? spirit?.imageUrl
    ?? spirit?.asset?.localUrl
    ?? null;
}

function matchupTone(multiplier) {
  if (multiplier > 1) return "weak";
  if (multiplier === 0) return "immune";
  return "resist";
}

export default function TeamTypeAnalysisSheet({
  members = EMPTY_MEMBERS,
  onClose,
  onMembersChange,
  open = false,
  petImages = {},
  snapshot,
}) {
  const [expandedType, setExpandedType] = useState(null);
  const [mode, setMode] = useState("risk");
  const [query, setQuery] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const normalizedMembers = normalizeMembers(members);
  const spirits = snapshot?.spirits ?? [];
  const spiritById = useMemo(
    () => new Map(spirits.map((spirit) => [spirit.id, spirit])),
    [spirits],
  );
  const searchIndex = useMemo(
    () => createSpiritSearchIndex({ spirits }),
    [spirits],
  );
  const analysis = useMemo(
    () => analyzeTeamDefensiveTypes({
      members: normalizedMembers.map((spiritId) =>
        spiritId ? { spiritId } : null),
      spirits,
      typeChart: snapshot?.typeChart,
    }),
    [members, snapshot?.typeChart, spirits],
  );
  const results = query.trim()
    ? searchSpiritsWithFavorites(searchIndex, query, [])
    : [];
  const rows = mode === "risk" ? analysis.riskRows : analysis.rows;

  if (!open) return null;

  function chooseMember(spiritId) {
    if (selectedSlot === null) return;
    const nextMembers = [...normalizedMembers];
    nextMembers[selectedSlot] = spiritId;
    onMembersChange?.(nextMembers);
    setQuery("");
    setSelectedSlot(null);
  }

  function openSlot(index) {
    setSelectedSlot(index);
    setQuery("");
  }

  function closePicker() {
    setSelectedSlot(null);
    setQuery("");
  }

  return (
    <View
      aria-label="关闭队伍防守面分析遮罩"
      className="team-analysis__overlay"
      onClick={onClose}
    >
      <View
        aria-label="队伍防守面分析"
        aria-modal="true"
        className="team-analysis"
        onClick={(event) => event.stopPropagation?.()}
        role="dialog"
      >
        <View className="team-analysis__header">
          <View className="team-analysis__heading">
            <Text className="team-analysis__title">队伍防守面</Text>
            <Text className="team-analysis__subtitle">
              已配置 {analysis.configuredCount}/6
            </Text>
          </View>
          <Button
            aria-label="关闭队伍防守面分析"
            className="team-analysis__close"
            hoverClass="button-hover"
            onClick={onClose}
          >
            完成
          </Button>
        </View>

        <ScrollView className="team-analysis__scroll" scrollY>
          <View className="team-analysis__content">
            <View aria-label="队伍成员" className="team-analysis__slots">
              {normalizedMembers.map((spiritId, index) => {
                const spirit = spiritById.get(spiritId);
                const imageUrl = memberImageUrl(spirit, petImages);
                return (
                  <Button
                    aria-label={spirit
                      ? `更换队伍成员 ${index + 1} ${spirit.fullName ?? spirit.name}`
                      : `选择队伍成员 ${index + 1}`}
                    className={spirit
                      ? "team-analysis__slot team-analysis__slot--filled"
                      : "team-analysis__slot"}
                    hoverClass="team-analysis__slot--pressed"
                    key={index}
                    onClick={() => openSlot(index)}
                  >
                    {imageUrl ? (
                      <Image
                        alt={`${spirit.fullName ?? spirit.name}头像`}
                        className="team-analysis__slot-image"
                        mode="aspectFit"
                        src={imageUrl}
                      />
                    ) : (
                      <Text className="team-analysis__slot-add">＋</Text>
                    )}
                    <Text className="team-analysis__slot-name">
                      {spirit?.fullName ?? spirit?.name ?? `成员 ${index + 1}`}
                    </Text>
                  </Button>
                );
              })}
            </View>

            {selectedSlot !== null ? (
              <View aria-label={`选择成员 ${selectedSlot + 1}`} className="team-analysis__picker">
                <View className="team-analysis__picker-heading">
                  <Text className="team-analysis__section-title">
                    选择成员 {selectedSlot + 1}
                  </Text>
                  <View className="team-analysis__picker-actions">
                    {normalizedMembers[selectedSlot] ? (
                      <Button
                        aria-label={`清空队伍成员 ${selectedSlot + 1}`}
                        className="team-analysis__text-action"
                        onClick={() => chooseMember(null)}
                      >
                        清空
                      </Button>
                    ) : null}
                    <Button
                      aria-label="收起队伍精灵搜索"
                      className="team-analysis__text-action"
                      onClick={closePicker}
                    >
                      收起
                    </Button>
                  </View>
                </View>
                <Input
                  aria-label="搜索队伍精灵"
                  className="team-analysis__search"
                  key={selectedSlot}
                  placeholder="搜索精灵名称"
                  type="text"
                  onInput={(event) => setQuery(readInputValue(event))}
                />
                {query.trim() ? (
                  <View className="team-analysis__search-results">
                    {results.length ? results.map((spirit) => {
                      const imageUrl = memberImageUrl(spirit, petImages);
                      return (
                        <Button
                          aria-label={`选择${spirit.fullName ?? spirit.name}`}
                          className="team-analysis__search-result"
                          hoverClass="button-hover"
                          key={spirit.id}
                          onClick={() => chooseMember(spirit.id)}
                        >
                          {imageUrl ? (
                            <Image
                              alt={`${spirit.fullName ?? spirit.name}头像`}
                              className="team-analysis__search-image"
                              mode="aspectFit"
                              src={imageUrl}
                            />
                          ) : null}
                          <View className="team-analysis__search-copy">
                            <Text className="team-analysis__search-name">
                              {spirit.fullName ?? spirit.name}
                            </Text>
                            <View className="team-analysis__search-types">
                              {(spirit.types ?? []).map((type) => (
                                <ElementIcon key={type} type={type} />
                              ))}
                              <Text>{(spirit.types ?? []).join(" · ")}</Text>
                            </View>
                          </View>
                        </Button>
                      );
                    }) : (
                      <Text className="team-analysis__empty">未找到匹配精灵</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View className="team-analysis__analysis-heading">
              <Text className="team-analysis__section-title">属性汇总</Text>
              <View aria-label="分析范围" className="team-analysis__tabs">
                <Button
                  aria-pressed={mode === "risk"}
                  className={mode === "risk"
                    ? "team-analysis__tab team-analysis__tab--active"
                    : "team-analysis__tab"}
                  onClick={() => setMode("risk")}
                >
                  重点
                </Button>
                <Button
                  aria-pressed={mode === "all"}
                  className={mode === "all"
                    ? "team-analysis__tab team-analysis__tab--active"
                    : "team-analysis__tab"}
                  onClick={() => setMode("all")}
                >
                  全部
                </Button>
              </View>
            </View>

            {analysis.configuredCount === 0 ? (
              <View className="team-analysis__empty-state">
                <Text className="team-analysis__empty-title">先选择队伍成员</Text>
                <Text className="team-analysis__empty-copy">
                  配置后按弱点数量排序，快速发现队伍防守缺口。
                </Text>
              </View>
            ) : rows.length ? (
              <View className="team-analysis__rows">
                {rows.map((row) => {
                  const expanded = expandedType === row.type;
                  const details = [
                    ...row.weakMembers,
                    ...row.resistantMembers,
                    ...row.immuneMembers,
                  ].sort((left, right) => left.slotIndex - right.slotIndex);
                  return (
                    <View className="team-analysis__row-wrap" key={row.type}>
                      <Button
                        aria-expanded={expanded}
                        aria-label={`查看${row.type}防守明细`}
                        className="team-analysis__row"
                        hoverClass="team-analysis__row--pressed"
                        onClick={() => setExpandedType(expanded ? null : row.type)}
                      >
                        <View className="team-analysis__row-type">
                          <ElementIcon type={row.type} />
                          <Text>{row.type}</Text>
                        </View>
                        <View className="team-analysis__counts">
                          <Text className="team-analysis__count team-analysis__count--weak">
                            弱 {row.weakCount}
                          </Text>
                          <Text className="team-analysis__count team-analysis__count--resist">
                            抗 {row.resistanceCount}
                          </Text>
                          <Text className="team-analysis__count team-analysis__count--immune">
                            免 {row.immunityCount}
                          </Text>
                        </View>
                        <Text className="team-analysis__chevron">›</Text>
                      </Button>
                      {expanded ? (
                        <View className="team-analysis__details">
                          {details.length ? details.map((member) => (
                            <View className="team-analysis__detail" key={`${row.type}-${member.slotIndex}`}>
                              <Text className="team-analysis__detail-name">
                                {member.name}
                              </Text>
                              <Text className={`team-analysis__detail-value team-analysis__detail-value--${matchupTone(member.multiplier)}`}>
                                ×{member.multiplier} 倍
                              </Text>
                            </View>
                          )) : (
                            <Text className="team-analysis__empty">全员等倍</Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="team-analysis__empty">当前没有集中弱点</Text>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
