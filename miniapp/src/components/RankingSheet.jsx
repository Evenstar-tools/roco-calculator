import { useMemo, useState } from "react";
import { Button as NativeButton, Image, Input, Picker, ScrollView, Text, View } from "@tarojs/components";
import { ELEMENT_TYPES } from "../shared/domain/type-chart.js";
import { createDurabilityRanking, getDurabilityMultipliers, STANDARD_DURABILITY_TEMPLATES } from "../shared/features/team-ability/domain/durability-ranking.js";
import { SPEED_TARGET_PROFILES } from "../shared/features/team-ability/domain/speed-targets.js";
import { createSpeedRanking, DEFAULT_RANKING_PROFILES, RANKING_METRIC_LABELS, multiplierSummary, multiplierTone } from "../shared/features/team-ability/domain/ranking-tools.js";

function Button({ className = "", ...props }) {
  return <NativeButton className={`ranking-action ${className}`} {...props} />;
}

function Choice({ label, options, value, onChange }) {
  const index = Math.max(0, options.findIndex(([id]) => id === value));
  return <Picker aria-label={label} mode="selector" range={options.map(([, text]) => text)} value={index} onChange={(event) => onChange(options[Number(event.detail.value)][0])}>
    <View className="ranking-choice">{options[index][1]}</View>
  </Picker>;
}

function Check({ children, checked, onClick, tone = "normal", mixed = false }) {
  return <Button aria-checked={mixed ? "mixed" : checked} role="checkbox" className={`ranking-check ranking-check--${tone}${checked ? " is-checked" : ""}`} onClick={onClick}>
    <Text className="ranking-check__state">{mixed ? "−" : checked ? "✓" : ""}</Text>{children}
  </Button>;
}

export default function RankingSheet({ kind, onClose, snapshot, petImages = {} }) {
  const [query, setQuery] = useState("");
  const [attackType, setAttackType] = useState("");
  const bins = useMemo(() => getDurabilityMultipliers(snapshot.typeChart), [snapshot.typeChart]);
  const [multipliers, setMultipliers] = useState(bins);
  const [metric, setMetric] = useState("combined");
  const [templateId, setTemplateId] = useState("standard-hp-v1");
  const [role, setRole] = useState("all");
  const [profiles, setProfiles] = useState([...DEFAULT_RANKING_PROFILES]);
  const [more, setMore] = useState(false);
  const [detail, setDetail] = useState(null);
  const [limit, setLimit] = useState(60);
  const speed = kind === "speed";
  const ranking = useMemo(() => speed ? null : createDurabilityRanking({
    spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter,
    attackType, multipliers, typeChart: snapshot.typeChart, query, sortBy: metric, templateId,
    filter: role === "all" ? undefined : (row) => row.formRole === role,
  }), [speed, snapshot, attackType, multipliers, query, metric, templateId, role]);
  const groups = useMemo(() => speed ? createSpeedRanking({ snapshot, profiles, query }) : [], [speed, snapshot, profiles, query]);
  const rows = ranking ? [...ranking.immuneRows, ...ranking.rows] : [];
  const toggle = (value, selected, setter) => setter(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  const portrait = (spirit) => petImages[spirit.id] ?? spirit.imageUrl ?? spirit.asset?.localUrl;
  const total = speed ? groups.length : ranking.counts.visible;
  const reset = () => { setQuery(""); setAttackType(""); setMultipliers(bins); setRole("all"); setTemplateId("standard-hp-v1"); setProfiles([...DEFAULT_RANKING_PROFILES]); };

  return <View className="ranking-sheet" role="dialog" aria-modal="true" aria-label={speed ? "速度线排行" : "耐久排行"}>
    <View className="ranking-sheet__heading"><Text>{detail ? "榜单配置详情" : speed ? "速度线排行" : "耐久排行"}</Text><Button onClick={() => detail ? setDetail(null) : more ? setMore(false) : onClose()}>{detail || more ? "返回" : "关闭"}</Button></View>
    {detail ? <ScrollView scrollY className="ranking-sheet__scroll"><View className="ranking-detail">
      {portrait(detail.spirit) ? <Image className="ranking-detail__image" src={portrait(detail.spirit)} /> : null}
      <Text className="ranking-detail__name">{detail.spirit.fullName}</Text><Text>{detail.spirit.types?.join(" · ")}</Text>
      {speed ? <Text>速度 {detail.speed} · {detail.qualifier}</Text> : <>
        <Text>{STANDARD_DURABILITY_TEMPLATES[templateId].label} · HP／双防个体 60</Text>
        <Text>HP {detail.panelStats.hp} · 物防 {detail.panelStats.physicalDefense} · 魔防 {detail.panelStats.magicalDefense}</Text>
        {Object.entries(RANKING_METRIC_LABELS).map(([key, label]) => <Text key={key}>{label}：{(detail.baseDurability ?? detail.durability).display[key].toLocaleString()} {attackType ? `→ ${detail.multiplier === 0 ? "属性免疫" : detail.durability.display[key].toLocaleString()}` : ""}</Text>)}
        {attackType ? <Text>{attackType}系 ×{detail.multiplier} · 基础耐久 ÷ 倍率</Text> : null}
      </>}
      <Text className="ranking-note">只读查看，不会覆盖计算参数或队伍配置。</Text>
    </View></ScrollView> : more ? <ScrollView scrollY className="ranking-sheet__scroll"><View className="ranking-more">
      <Text className="ranking-detail__name">{speed ? "速度口径" : "更多筛选"}</Text>
      {speed ? Object.entries({ ...SPEED_TARGET_PROFILES, special: { label: "特殊条件（逐项标注）" } }).map(([id, profile]) => <Check key={id} checked={profiles.includes(id)} onClick={() => toggle(id, profiles, setProfiles)}>{profile.label}</Check>) : <>
        <Text>统一耐久模板</Text><Choice label="耐久榜模板" value={templateId} onChange={setTemplateId} options={Object.values(STANDARD_DURABILITY_TEMPLATES).map((template) => [template.id, template.label])} />
        <Text>形态范围</Text><Choice label="形态筛选" value={role} onChange={setRole} options={[["all", "最终形态 + 首领"], ["final", "仅最终形态"], ["boss", "仅首领"]]} />
        {attackType ? <View className="ranking-inline"><Button onClick={() => setMultipliers(bins.filter((value) => value < 1))}>选抵抗</Button><Button onClick={() => setMultipliers(bins.filter((value) => value > 1))}>选弱点</Button></View> : null}
      </>}
      <Text className="ranking-note">{speed ? "同一精灵的不同速度配置分别保留；特殊条件不是常驻速度。" : "统一 60 级模板，属性有效耐久不含特性、天气与技能效果。"}</Text>
      <Button onClick={() => setMore(false)}>完成筛选 · {total}{speed ? "档" : "只"}</Button>
    </View></ScrollView> : <>
      <View className="ranking-toolbar"><Input aria-label="搜索榜单精灵" placeholder="名称、图鉴号或别名" value={query} onInput={(event) => { setQuery(event.detail?.value ?? event.target.value); setLimit(60); }} />
        {!speed ? <Choice label="承受属性" options={[["", "不限属性"], ...(snapshot.typeChart?.types ?? ELEMENT_TYPES).map((type) => [type, type])]} value={attackType} onChange={setAttackType} /> : null}<Button onClick={() => setMore(true)}>筛选</Button></View>
      {!speed && attackType ? <View className="ranking-multipliers"><Check mixed={multipliers.length > 0 && multipliers.length < bins.length} checked={multipliers.length === bins.length} onClick={() => setMultipliers(multipliers.length === bins.length ? [] : bins)}>全选</Check>{bins.map((value) => <Check key={value} tone={multiplierTone(value)} checked={multipliers.includes(value)} onClick={() => toggle(value, multipliers, setMultipliers)}>×{value}</Check>)}</View> : null}
      {!speed ? <View className="ranking-metrics">{Object.entries(RANKING_METRIC_LABELS).map(([id, label]) => <Button key={id} aria-pressed={metric === id} className={metric === id ? "is-active" : ""} onClick={() => setMetric(id)}>{label}</Button>)}</View> : null}
      <View className="ranking-summary"><Text>{speed ? `${profiles.map((id) => SPEED_TARGET_PROFILES[id]?.label ?? "特殊条件").join(" / ") || "未选口径"} · ${total}档` : `${multiplierSummary(attackType, multipliers, bins)} · ${total}只`}</Text><Button onClick={reset}>重置</Button></View>
      <View className="ranking-columns"><Text>{speed ? "速度档位 / 精灵" : "名次 / 精灵"}</Text><Text>{speed ? "配置口径" : `${attackType ? "有效" : ""}${RANKING_METRIC_LABELS[metric]} ↓`}</Text></View>
      <ScrollView scrollY className="ranking-sheet__scroll">
        {speed ? groups.slice(0, limit).map((group) => <View key={group.speed} className="ranking-speed-group"><Text className="ranking-speed-number">{group.speed}</Text><View>{group.targets.map((target) => <Button key={`${target.id}:${target.profileId}`} className="ranking-speed-target" onClick={() => setDetail(target)}>{portrait(target.spirit) ? <Image src={portrait(target.spirit)} /> : null}<View><Text>{target.name}</Text><Text className="ranking-note">{target.qualifier}</Text></View></Button>)}</View></View>) : rows.slice(0, limit).map((row) => <Button key={row.spiritId} className="ranking-row" onClick={() => setDetail(row)}><Text className="ranking-row__rank">{row.multiplier === 0 ? "免疫" : row.filteredRank[metric]}</Text>{portrait(row.spirit) ? <Image src={portrait(row.spirit)} /> : null}<View className="ranking-row__name"><Text>{row.spirit.fullName}</Text><Text className="ranking-note">{row.spirit.types?.join(" · ")}</Text></View><View className="ranking-row__score"><Text>{row.multiplier === 0 ? "—" : row.durability.display[metric].toLocaleString()}</Text>{attackType ? <Text className={`ranking-tone--${multiplierTone(row.multiplier)}`}>{attackType} ×{row.multiplier}</Text> : null}</View></Button>)}
        {total === 0 ? <View className="ranking-empty"><Text>{attackType && multipliers.length === 0 ? "尚未勾选倍率" : "没有符合当前条件的结果"}</Text><Button onClick={reset}>重置筛选</Button></View> : null}
        {(speed ? groups.length : rows.length) > limit ? <Button className="ranking-load" onClick={() => setLimit(limit + 60)}>继续显示</Button> : null}
      </ScrollView>
      <View className="ranking-footer">{speed ? "同速聚合 · 点击查看该档配置" : "搜索不改名次 · 不含特性、天气或技能效果"}</View>
    </>}
  </View>;
}
