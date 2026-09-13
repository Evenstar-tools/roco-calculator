import { useEffect, useMemo, useState } from "react";
import { createSkillDamageRanking, DAMAGE_COMPARISON_SCOPE, describeDamageComparisonTemplate, filterSkillDamageRanking, getDamageComparisonSelection, getDamageComparisonTargetStatuses, getDamageComparisonTemplate, getDamageComparisonTemplates } from "../../domain/skill-damage-ranking.js";
import { damageComparisonSourceKey } from "../../state/damage-comparison.js";

function initialChoices(snapshot, source, saved) {
  const selection = getDamageComparisonSelection(snapshot, source.state, source.direction);
  const previous = saved?.sourceKey === damageComparisonSourceKey(source) ? saved : {};
  const statuses = getDamageComparisonTargetStatuses(source.state, source.direction);
  const inheritTargetStatusesExplicit = previous.inheritTargetStatusesExplicit ?? previous.inheritTargetStatuses === true;
  const templates = getDamageComparisonTemplates(source.presetsBySpirit);
  const preserveTemplate = previous.templateExplicit === true && templates.some((template) => template.id === previous.templateId);
  const selected = selection.options.find((option) => option.index === previous.selectedSkillIndex && option.skill.id === previous.selectedSkillId)
    ?? selection.options.find((option) => option.skill.id === previous.selectedSkillId)
    ?? selection.selected ?? selection.options[0];
  return {
    selectedSkillIndex: selected?.index ?? 0,
    templateId: preserveTemplate ? previous.templateId : Object.keys(source.presetsBySpirit ?? {}).length > 200 ? "user-presets" : "standard-hp-v1",
    templateExplicit: preserveTemplate,
    scope: previous.scope ?? "final", query: previous.query ?? "", filter: previous.filter ?? "all",
    descending: previous.descending ?? false, inheritTargetStatusesExplicit,
    inheritTargetStatuses: inheritTargetStatusesExplicit ? previous.inheritTargetStatuses : statuses.starfall > 0 || statuses.freeze > 0,
    filtersOpen: previous.filtersOpen ?? false,
  };
}

export function useDamageComparison(snapshot, source, preferences, onPreferencesChange) {
  const [choices, setChoices] = useState(() => initialChoices(snapshot, source, preferences));
  const { selectedSkillIndex, templateId, scope, query, filter, descending, inheritTargetStatuses, filtersOpen } = choices;
  const change = (key) => (value) => setChoices((current) => ({ ...current, [key]: value }));
  const [expanded, setExpanded] = useState(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [limit, setLimit] = useState(60);
  const selection = getDamageComparisonSelection(snapshot, source.state, source.direction, selectedSkillIndex);
  const selectedSkillId = selection.selected?.skill.id;
  const sourceKey = damageComparisonSourceKey(source);
  useEffect(() => {
    onPreferencesChange?.({ ...choices, sourceKey, selectedSkillId });
  }, [choices, sourceKey, selectedSkillId, onPreferencesChange]);
  const template = getDamageComparisonTemplate(source.state, source.direction, templateId);
  const statuses = getDamageComparisonTargetStatuses(source.state, source.direction);
  const request = useMemo(() => ({ snapshot, ...source, selectedSkillIndex, templateId, scope, inheritTargetStatuses }), [snapshot, source, selectedSkillIndex, templateId, scope, inheritTargetStatuses]);
  useEffect(() => {
    const signal = { aborted: false };
    createSkillDamageRanking({ ...request, signal, onProgress: (value) => {
      if (!signal.aborted) setProgress({ request, value });
    } })
      .then((value) => { if (!signal.aborted) setResult({ request, value }); })
      .catch((cause) => { if (!signal.aborted) setFailure({ request, message: cause.message || "计算失败，请重新打开" }); });
    return () => { signal.aborted = true; };
  }, [request]);
  const ranking = result?.request === request ? result.value : null;
  const error = failure?.request === request ? failure.message : "";
  const rows = useMemo(() => filterSkillDamageRanking(ranking?.rows ?? [], { query, filter, descending }), [ranking, query, filter, descending]);
  return {
    selectedSkillIndex, setSelectedSkillIndex: change("selectedSkillIndex"), templateId,
    setTemplateId: (value) => setChoices((current) => ({ ...current, templateId: value, templateExplicit: true })), scope, setScope: change("scope"),
    query, setQuery: change("query"), filter, setFilter: change("filter"), descending, setDescending: change("descending"), expanded, setExpanded,
    filtersOpen, setFiltersOpen: change("filtersOpen"), inheritTargetStatuses,
    setInheritTargetStatuses: (value) => setChoices((current) => ({ ...current, inheritTargetStatuses: value, inheritTargetStatusesExplicit: true })),
    template, templates: getDamageComparisonTemplates(source.presetsBySpirit), templateDescription: (row) => describeDamageComparisonTemplate(row.template),
    scopeDescription: `${templateId === "user-presets" ? DAMAGE_COMPARISON_SCOPE.replace("统一模板", "各自预设，未配按生命性格") : DAMAGE_COMPARISON_SCOPE}${inheritTargetStatuses ? ` · 星陨 ${statuses.starfall} 层 · 冻结 ${statuses.freeze} 层` : ""}`,
    showExcluded, setShowExcluded, progress: progress?.request === request ? progress.value : null, ranking, error, rows, selection,
    limit, showMore: () => setLimit((value) => value + 60),
    loading: !ranking && !error,
  };
}
