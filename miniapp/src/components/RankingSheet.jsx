import { useEffect, useMemo, useState } from "react";
import { Button as NativeButton, Image, Input, Picker, ScrollView, Text, View } from "@tarojs/components";
import { ELEMENT_TYPES } from "../shared/domain/type-chart.js";
import { createDurabilityRanking, getDurabilityMultipliers, STANDARD_DURABILITY_TEMPLATES } from "../shared/features/team-ability/domain/durability-ranking.js";
import { SPEED_TARGET_PROFILES } from "../shared/features/team-ability/domain/speed-targets.js";
import { createSpeedRanking, speedQuery, speedReference, speedBadge, DEFAULT_RANKING_PROFILES, RANKING_METRIC_LABELS, multiplierSummary, multiplierTone } from "../shared/features/team-ability/domain/ranking-tools.js";
import eye from "../assets/icons/eye.png";
import eyeSlash from "../assets/icons/eye-slash.png";

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
  const [queryMode, setQueryMode] = useState("auto");
  const [iconOnly, setIconOnly] = useState(false);
  const [anchor, setAnchor] = useState("");
  const [jump, setJump] = useState(0);
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
  const groups = useMemo(() => speed ? createSpeedRanking({ snapshot, profiles, query, queryMode }) : [], [speed, snapshot, profiles, query, queryMode]);
  const search = speedQuery(query, queryMode);
  const reference = speedReference(groups, speed && search.kind === "actual" ? search.value : null);
  const displayedGroups = reference?.groups ?? groups;
  useEffect(() => {
    setAnchor("");
    if (!speed || search.kind !== "actual" || search.value === null) return;
    const timer = setTimeout(() => {
      const id = `speed-tier-${search.value}`;
      if (process.env.TARO_ENV === "h5") {
        const target = document.getElementById(id);
        const scroll = target?.closest(".ranking-sheet__scroll");
        if (target && scroll) scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      } else setAnchor(id);
    }, 60);
    return () => clearTimeout(timer);
  }, [speed, search.kind, search.value, profiles, jump, more, detail]);
  const rows = ranking ? [...ranking.immuneRows, ...ranking.rows] : [];
  const toggle = (value, selected, setter) => setter(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  const portrait = (spirit) => petImages[spirit.id] ?? spirit.imageUrl ?? spirit.asset?.localUrl;
  const total = speed ? groups.length : ranking.counts.visible;
  const reset = () => { setQuery(""); setQueryMode("auto"); setAttackType(""); setMultipliers(bins); setRole("all"); setTemplateId("standard-hp-v1"); setProfiles([...DEFAULT_RANKING_PROFILES]); };

  return <View className="ranking-sheet" role="dialog" aria-modal="true" aria-label={speed ? "速度线排行" : "耐久排行"}>
    <View className="ranking-sheet__heading"><Text>{detail ? "榜单配置详情" : speed ? "速度线排行" : "耐久排行"}</Text><View className="ranking-inline">{speed && !detail && !more ? <Button className="ranking-eye" aria-label={iconOnly ? "显示精灵文字" : "隐藏精灵文字"} aria-pressed={iconOnly} onClick={() => setIconOnly(!iconOnly)}><Image mode="aspectFit" src={iconOnly ? eye : eyeSlash} /></Button> : null}<Button onClick={() => detail ? setDetail(null) : more ? setMore(false) : onClose()}>{detail || more ? "返回" : "关闭"}</Button></View></View>
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
      <View className="ranking-toolbar"><Input aria-label="搜索榜单精灵" placeholder={speed ? "精灵名称或速度值，如 267" : "名称、图鉴号或别名"} value={query} onInput={(event) => { setQuery(event.detail?.value ?? event.target.value); setLimit(60); }} />
        {!speed ? <Choice label="承受属性" options={[["", "不限属性"], ...(snapshot.typeChart?.types ?? ELEMENT_TYPES).map((type) => [type, type])]} value={attackType} onChange={setAttackType} /> : null}<Button onClick={() => setMore(true)}>筛选</Button></View>
      {speed ? <View className="ranking-speed-guide">
        <View className="ranking-query-modes">{[["auto", "实际速度"], ["base", "种族速度"], ["text", "名称 / 图鉴"]].map(([id, label]) => <Button key={id} aria-pressed={queryMode === id} className={queryMode === id ? "is-active" : ""} onClick={() => setQueryMode(id)}>{label}</Button>)}</View>
        {search.invalid ? <Text role="status">请输入非负整数速度值</Text> : reference ? <View className="ranking-reference" role="status"><Text>比 {reference.value} 快 {reference.faster} · 同速 {reference.equal} · 慢 {reference.slower} 个配置</Text><Button onClick={() => setJump(jump + 1)}>定位 {reference.value}</Button></View> : <View className="ranking-reference"><Text>{search.kind === "base" && search.value !== null ? `种族速度 ${search.value} · 按实际速度排列` : "输入名称找精灵，输入速度看快慢"}</Text>{!query ? <Button onClick={() => { setQueryMode("auto"); setQuery("267"); }}>试查 267</Button> : null}</View>}
      </View> : null}
      {!speed && attackType ? <View className="ranking-multipliers"><Check mixed={multipliers.length > 0 && multipliers.length < bins.length} checked={multipliers.length === bins.length} onClick={() => setMultipliers(multipliers.length === bins.length ? [] : bins)}>全选</Check>{bins.map((value) => <Check key={value} tone={multiplierTone(value)} checked={multipliers.includes(value)} onClick={() => toggle(value, multipliers, setMultipliers)}>×{value}</Check>)}</View> : null}
      {!speed ? <View className="ranking-metrics">{Object.entries(RANKING_METRIC_LABELS).map(([id, label]) => <Button key={id} aria-pressed={metric === id} className={metric === id ? "is-active" : ""} onClick={() => setMetric(id)}>{label}</Button>)}</View> : null}
      <View className="ranking-summary"><Text>{speed ? `${profiles.map((id) => SPEED_TARGET_PROFILES[id]?.label ?? "特殊条件").join(" / ") || "未选口径"} · ${total}档` : `${multiplierSummary(attackType, multipliers, bins)} · ${total}只`}</Text><Button onClick={reset}>重置</Button></View>
      <View className="ranking-columns"><Text>{speed ? "速度档位 / 精灵" : "名次 / 精灵"}</Text><Text>{speed ? "配置口径" : `${attackType ? "有效" : ""}${RANKING_METRIC_LABELS[metric]} ↓`}</Text></View>
      <ScrollView scrollY scrollIntoView={anchor} className="ranking-sheet__scroll">
        {speed ? displayedGroups.slice(0, reference ? undefined : limit).map((group) => <View id={`speed-tier-${group.speed}`} key={group.speed} className={`ranking-speed-group${reference?.value === group.speed ? " is-reference" : ""}`}><View className="ranking-speed-number"><Text>{group.speed}</Text>{reference ? <Text className="ranking-note">{group.speed === reference.value ? "基准" : `${group.speed > reference.value ? "+" : ""}${group.speed - reference.value}`}</Text> : null}</View><View className={`ranking-speed-targets${iconOnly ? " is-icon-only" : ""}`}>{!group.targets.length ? <Text className="ranking-note">基准位置 · 没有同速配置</Text> : null}{group.targets.map((target) => <Button aria-label={`${target.name}，速度 ${target.speed}，${target.qualifier}`} key={`${target.id}:${target.profileId}`} className="ranking-speed-target" onClick={() => setDetail(target)}>{portrait(target.spirit) ? <Image mode="aspectFit" src={portrait(target.spirit)} /> : null}{iconOnly ? <Text className="ranking-speed-badge">{speedBadge(target)}</Text> : <View><Text>{target.name}</Text><Text className="ranking-note">{target.qualifier}</Text></View>}</Button>)}</View></View>) : rows.slice(0, limit).map((row) => <Button key={row.spiritId} className="ranking-row" onClick={() => setDetail(row)}><Text className="ranking-row__rank">{row.multiplier === 0 ? "免疫" : row.filteredRank[metric]}</Text>{portrait(row.spirit) ? <Image src={portrait(row.spirit)} /> : null}<View className="ranking-row__name"><Text>{row.spirit.fullName}</Text><Text className="ranking-note">{row.spirit.types?.join(" · ")}</Text></View><View className="ranking-row__score"><Text>{row.multiplier === 0 ? "—" : row.durability.display[metric].toLocaleString()}</Text>{attackType ? <Text className={`ranking-tone--${multiplierTone(row.multiplier)}`}>{attackType} ×{row.multiplier}</Text> : null}</View></Button>)}
        {total === 0 ? <View className="ranking-empty"><Text>{attackType && multipliers.length === 0 ? "尚未勾选倍率" : "没有符合当前条件的结果"}</Text><Button onClick={reset}>重置筛选</Button></View> : null}
        {(!speed || !reference) && (speed ? groups.length : rows.length) > limit ? <Button className="ranking-load" onClick={() => setLimit(limit + 60)}>继续显示</Button> : null}
      </ScrollView>
      <View className="ranking-footer">{speed ? "极 / 满 / 性 / 无 / 减：速度口径 · 特：条件触发 · 点头像看详情" : "搜索不改名次 · 不含特性、天气或技能效果"}</View>
    </>}
  </View>;
}
