import { Button, Image, Input, Picker, ScrollView, Text, View } from "@tarojs/components";
import { useDamageComparison } from "../shared/features/damage-comparison/useDamageComparison.js";
import { DAMAGE_COMPARISON_FILTERS } from "../shared/domain/skill-damage-ranking.js";

function Choice({ label, value, options, onChange }) {
  const index = Math.max(0, options.findIndex(([id]) => id === value));
  return <Picker aria-label={label} mode="selector" range={options.map(([, text]) => text)} value={index} onChange={(event) => onChange(options[Number(event.detail.value)][0])}>
    <View className="dc-choice">{label}：{options[index]?.[1]}</View>
  </Picker>;
}

export default function DamageComparisonSheet({ snapshot, source, petImages = {}, preferences, onPreferencesChange, onClose, onImport }) {
  const model = useDamageComparison(snapshot, source, preferences, onPreferencesChange);
  const sourcePortrait = petImages[model.selection.spirit?.id] ?? model.selection.spirit?.imageUrl;
  return <View className="dc-sheet" role="dialog" aria-modal="true" aria-label="承伤对比">
    <View className="dc-heading"><Text>承伤对比</Text><Button className="dc-button" onClick={onClose}>关闭</Button></View>
    <View className="dc-source">
      {sourcePortrait ? <Image src={sourcePortrait} className="dc-source-avatar" mode="aspectFit" aria-hidden="true" /> : null}
      <Text className="dc-source-name">{model.selection.spirit?.fullName}</Text>
      <Choice label="技能" value={model.selection.index} options={model.selection.options.map(({ index, skill }) => [index, skill.name])} onChange={model.setSelectedSkillIndex} />
      <Text className="dc-note">{model.scopeDescription}</Text>
    </View>
    <View className="dc-search"><Input className="dc-search-input" aria-label="搜索承伤精灵" placeholder="搜索名称、别名或图鉴号" value={model.query} onInput={(event) => model.setQuery(event.detail?.value ?? event.target?.value ?? "")} /><Button className="dc-button" aria-expanded={model.filtersOpen} onClick={() => model.setFiltersOpen(!model.filtersOpen)}>筛选</Button></View>
    {model.filtersOpen ? <View className="dc-options">
      <Choice label="耐久模板" value={model.templateId} options={model.templates.map((item) => [item.id, item.label])} onChange={model.setTemplateId} />
      <Choice label="形态范围" value={model.scope} options={[["final", "最终形态＋首领"], ["all", "全部完整种族值形态"]]} onChange={model.setScope} />
      <Choice label="排序" value={model.descending} options={[[false, "承伤从低到高"], [true, "承伤从高到低"]]} onChange={model.setDescending} />
      <Button className="dc-inherit" role="checkbox" aria-checked={model.inheritTargetStatuses} onClick={() => model.setInheritTargetStatuses(!model.inheritTargetStatuses)}><View className={`settings-sheet__switch${model.inheritTargetStatuses ? " settings-sheet__switch--on" : ""}`} aria-hidden="true"><View className="settings-sheet__switch-thumb" /></View><Text>沿用星陨／冻结</Text></Button>
    </View> : null}
    <View className="dc-filters">{DAMAGE_COMPARISON_FILTERS.map(([key, text]) => <Button key={key} className={`dc-button${model.filter === key ? " is-selected" : ""}`} aria-pressed={model.filter === key} onClick={() => model.setFilter(key)}>{text}</Button>)}</View>
    <View className="dc-summary"><Text>{model.loading ? `正在计算 ${model.progress?.completed ?? 0}/${snapshot.spirits.length}` : `${model.rows.length} 只 · ${model.template.label}`}</Text><Button className="dc-button dc-link" aria-expanded={model.showExcluded} onClick={() => model.setShowExcluded(!model.showExcluded)}>未纳入 {model.ranking?.excluded.length ?? 0}</Button></View>
    <ScrollView className="dc-scroll" scrollY>
      {model.error || model.ranking?.issue ? <View className="dc-empty" role="status">{model.error || model.ranking.issue}</View> : null}
      {model.showExcluded ? <View className="dc-excluded">{model.ranking?.excluded.map(({ spirit, reason }) => <View key={spirit.id}><Text>{spirit.fullName}</Text><Text className="dc-note">{reason}</Text></View>)}</View> : null}
      {!model.loading && !model.error && !model.ranking?.issue && !model.rows.length ? <View className="dc-empty">没有符合当前筛选的结果<Button className="dc-button" onClick={() => { model.setQuery(""); model.setFilter("all"); }}>清除搜索与筛选</Button></View> : null}
      {model.rows.slice(0, model.limit).map((row) => {
        const expanded = model.expanded === row.spirit.id;
        const imageUrl = petImages[row.spirit.id] ?? row.spirit.imageUrl;
        return <View key={row.spirit.id} className={`dc-item${expanded ? " is-expanded" : ""}`}>
          <Button className="dc-row" aria-label={`查看${row.spirit.fullName}承伤详情`} aria-expanded={expanded} onClick={() => model.setExpanded(expanded ? null : row.spirit.id)}>
            <Text className="dc-rank">{row.rank}</Text>
            {imageUrl ? <Image src={imageUrl} className="dc-avatar" mode="aspectFit" aria-hidden="true" /> : null}
            <View className="dc-identity"><Text className="dc-name">{row.spirit.fullName}</Text><Text className="dc-note">{row.spirit.types?.join(" · ")} · 伤害 {row.damage} HP</Text></View>
            <View className={`dc-score ${row.lethal ? "is-ko" : row.percent < 50 ? "is-low" : "is-mid"}`}><Text>{row.percent.toFixed(1)}%</Text><Text className="dc-note">{row.lethal ? "本次可击倒" : `剩余 ${row.remainingHp} HP`}</Text></View>
          </Button>
          {expanded ? <View className="dc-detail">
            <Text>生命 {row.panelStats.hp} · 物防 {row.panelStats.physicalDefense} · 魔防 {row.panelStats.magicalDefense}</Text>
            <Text className="dc-note">{model.templateDescription(row)}</Text>
            <Text className="dc-note">本榜不计防守方特性，代入后恢复特性。</Text>
            <Button className="dc-button dc-primary" onClick={() => onImport(row.spirit, model.templateId, model.selectedSkillIndex, model.inheritTargetStatuses)}>代入防守方复算</Button>
          </View> : null}
        </View>;
      })}
      {model.rows.length > model.limit ? <Button className="dc-button dc-more" onClick={model.showMore}>继续显示（剩余 {model.rows.length - model.limit} 只）</Button> : null}
    </ScrollView>
    <View className="dc-footer">点行只看详情 · 搜索不改名次 · 实际对局请代入复算</View>
  </View>;
}
