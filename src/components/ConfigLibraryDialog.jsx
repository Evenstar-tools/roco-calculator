import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { getNature } from "../domain/natures.js";
import { usePresetBrowseMode } from "./PresetBrowseMode.jsx";

import { POPULAR_CONFIG_COUNT } from "../data/preset-metadata.js";
const PRIMARY_PREVIEW_ROWS = [
  ["same", "相同"],
  ["different", "不同"],
  ["added", "新增"],
];
const ISSUE_PREVIEW_ROWS = [
  ["repairedEntries", "兼容修复"],
  ["missingSpirits", "缺失精灵"],
  ["missingSkills", "失效技能槽"],
  ["unknownTraitFields", "未知特性字段"],
  ["invalidEntries", "无效配置"],
  ["duplicateEntries", "文件内重复"],
];
const ISSUE_LABELS = Object.fromEntries(ISSUE_PREVIEW_ROWS);

function ConfigEntryList({ entries, emptyMessage, skillById, spiritById, stableHeight = false }) {
  const { t } = useLocale();
  const { serverId } = useRuntime();
  return (
    <ul
      className={`config-library-entry-list${stableHeight ? " config-library-entry-list--searchable" : ""}${entries.length === 0 ? " is-empty" : ""}`}
      id="config-library-entries"
    >
      {entries.length === 0 && emptyMessage ? (
        <li className="config-library-entry-empty">{emptyMessage}</li>
      ) : null}
      {entries.map((entry) => {
        const spirit = spiritById.get(entry.spiritId);
        const spiritName = spirit?.fullName ?? entry.spiritId;
        const natureName = serverId === "cn" ? t(getNature(entry.natureId)?.name ?? entry.natureId) : entry.natureId ?? t("待核验");
        return (
          <li className="config-library-entry" key={entry.spiritId}>
            {spirit?.asset?.localUrl ? (
              <img
                alt={spiritName}
                loading="lazy"
                src={spirit.asset.localUrl}
              />
            ) : null}
            <div className="config-library-entry-main">
              <div className="config-library-entry-heading">
                <strong>{spiritName}</strong>
                <span>{t("性格 {nature}", { nature: natureName })}</span>
              </div>
              <ol className="config-library-entry-skills">
                {entry.skills.map((skillId, index) => (
                  <li key={`${entry.spiritId}:skill:${index}`}>
                    <span>{index + 1}</span>
                    <strong>{skillById.get(skillId)?.name ?? skillId ?? t("空")}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ConfigLibraryDialog({
  error,
  exportSummary,
  mode,
  onClose,
  onConfirmImport,
  onExport,
  onFile,
  onStartImport,
  parsed,
  snapshot,
}) {
  const { t, locale } = useLocale();
  const { serverId } = useRuntime();
  const dialogRef = useRef(null);
  const presetBrowse = usePresetBrowseMode();
  const entrySearchRef = useRef(null);
  const [entriesExpanded, setEntriesExpanded] = useState(false);
  const [entryQuery, setEntryQuery] = useState("");
  const [importIssuesExpanded, setImportIssuesExpanded] = useState(false);

  useModalFocus(Boolean(mode), dialogRef, onClose);

  useEffect(() => {
    // 切换导出摘要或对话框模式时收回折叠，避免沿用上一份列表的展开态。
    /* eslint-disable react-hooks/set-state-in-effect -- 重置局部 UI，改渲染期 setState 会打断当前预览 */
    setEntriesExpanded(false);
    setEntryQuery("");
    setImportIssuesExpanded(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [exportSummary, mode]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 新解析结果应重置对应的局部预览状态 */
    setEntryQuery("");
    setImportIssuesExpanded(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [parsed]);

  useEffect(() => {
    if (mode === "popular" && entriesExpanded) entrySearchRef.current?.focus();
  }, [entriesExpanded, mode]);

  if (!mode) return null;
  const isExport = mode === "export";
  const isPopular = mode === "popular";
  const dialogTitle = isExport
    ? t("配置库导入导出")
    : isPopular
      ? t("常用精灵配置")
      : t("配置库导入");
  const sourceEntries = isExport
    ? exportSummary?.library?.entries ?? []
    : isPopular
      ? parsed?.entries ?? []
      : [];
  const spiritById = new Map(
    (snapshot?.spirits ?? []).map((spirit) => [spirit.id, spirit]),
  );
  const skillById = new Map(
    (snapshot?.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const entryDexNo = (entry) => {
    const value = Number(spiritById.get(entry.spiritId)?.dexNo);
    return Number.isFinite(value) && value > 0 ? value : Infinity;
  };
  const listedEntries = isPopular
    ? [...sourceEntries].sort((left, right) => entryDexNo(left) - entryDexNo(right))
    : sourceEntries;
  const normalizedEntryQuery = entryQuery.trim().toLocaleLowerCase(locale);
  const visibleEntries = isPopular && normalizedEntryQuery
    ? listedEntries.filter((entry) => {
      const spirit = spiritById.get(entry.spiritId);
      return [spirit?.fullName ?? entry.spiritId, ...(spirit?.aliases ?? [])]
        .some((name) => name.toLocaleLowerCase(locale).includes(normalizedEntryQuery));
    })
    : listedEntries;
  const importIssues = parsed
    ? ISSUE_PREVIEW_ROWS.filter(([key]) => Number(parsed.preview[key]) > 0)
    : [];
  const importIssueCount = importIssues.reduce(
    (total, [key]) => total + Number(parsed.preview[key]),
    0,
  );
  const importIssueDetails = parsed?.issueDetails ?? [];
  const updateCount = (parsed?.preview.added ?? 0) + (parsed?.preview.updated ?? 0);
  const exportedFavoriteCount = serverId === "global" ? (exportSummary?.library?.favorites?.length ?? 0) : 0;
  const canExport = (exportSummary?.exportedCount ?? 0) > 0 || exportedFavoriteCount > 0;
  const canImport = Boolean(parsed) && (updateCount > 0 || parsed.preview.favoritesAdded > 0);
  const importChanges = [...(parsed?.changes ?? [])].sort((left, right) => entryDexNo(left) - entryDexNo(right));

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label={dialogTitle}
        aria-modal="true"
        className={`share-dialog config-library-dialog${isPopular && entriesExpanded ? " config-library-dialog--popular-expanded" : ""}`}
        ref={dialogRef}
        role="dialog"
      >
        <h2>{dialogTitle}</h2>
        {isExport ? (
          <>
            <div className="config-library-summary">
              <strong>{t(serverId === "global" ? "可导出 {count} 份配置 · {favorites} 项收藏" : "可导出 {count} 只精灵", { count: exportSummary?.exportedCount ?? 0, favorites: exportedFavoriteCount })}</strong>
              <dl className="config-library-summary-details">
                {serverId === "global" ? <><div><dt>{t("配置")}</dt><dd>{exportSummary?.exportedCount ?? 0}</dd></div><div><dt>{t("手动收藏")}</dt><dd>{exportedFavoriteCount}</dd></div></> : <>
                <div>
                  <dt>{t("手动收藏")}</dt>
                  <dd>{exportSummary?.manualConfiguredCount ?? 0}</dd>
                </div>
                <div>
                  <dt>{t("自动识别")}</dt>
                  <dd>{exportSummary?.autoIncludedCount ?? 0}</dd>
                </div>
                <div>
                  <dt>{t("跳过")}</dt>
                  <dd>{exportSummary?.skippedUnconfiguredCount ?? 0}</dd>
                </div>
                </>}
              </dl>
              {listedEntries.length > 0 ? (
                <button
                  aria-controls="config-library-entries"
                  aria-expanded={entriesExpanded}
                  aria-label={entriesExpanded ? t("收起精灵和技能") : t("查看精灵和技能")}
                  className="config-library-summary-toggle"
                  onClick={() => setEntriesExpanded((expanded) => !expanded)}
                  type="button"
                >
                  {entriesExpanded ? t("收起清单") : t("查看精灵和技能")}
                </button>
              ) : null}
            </div>
            {entriesExpanded ? (
              <ConfigEntryList
                entries={listedEntries}
                skillById={skillById}
                spiritById={spiritById}
              />
            ) : null}
            <p>{t(serverId === "cn" ? "包含手动收藏和绿色完整配置的性格、个体、四技能与特性。" : "国际服配置保留原始引用和参数；已知占位资料可编辑，未知引用待核验。")}</p>
          </>
        ) : (
          <>
            {isPopular ? (
              <div className="popular-config-summary">
                <div>
                  <strong>{t("PVP 热门配置 · {count} 只", { count: POPULAR_CONFIG_COUNT })}</strong>
                  <span>{t("安装后可离线导入")}</span>
                </div>
                {listedEntries.length > 0 ? (
                  <button
                    aria-controls="config-library-entries"
                    aria-expanded={entriesExpanded}
                    aria-label={entriesExpanded ? t("收起精灵和技能") : t("查看精灵和技能")}
                    className="config-library-summary-toggle"
                    onClick={() => setEntriesExpanded((expanded) => !expanded)}
                    type="button"
                  >
                    {entriesExpanded ? t("收起清单") : t("查看精灵和技能")}
                  </button>
                ) : null}
              </div>
            ) : (
              <label>
                <span>{t("选择配置库 JSON（最大 5 MB）")}</span>
                <input
                  accept="application/json,.json"
                  aria-label={t("选择配置库文件")}
                  onChange={(event) => onFile?.(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
            )}
            {isPopular && entriesExpanded ? (
              <div className="config-library-search">
                <label className="config-library-search-field">
                  <span>{t("精灵名")}</span>
                  <input
                    aria-label={t("搜索精灵名")}
                    onChange={(event) => setEntryQuery(event.target.value)}
                    placeholder={t("输入精灵名查找")}
                    ref={entrySearchRef}
                    type="search"
                    value={entryQuery}
                  />
                </label>
                <strong aria-live="polite" className="config-library-search-count">
                  {visibleEntries.length} / {listedEntries.length}
                </strong>
                <button
                  className="secondary-action config-library-search-clear"
                  disabled={!entryQuery.trim()}
                  onClick={() => {
                    setEntryQuery("");
                    entrySearchRef.current?.focus();
                  }}
                  type="button"
                >
                  {t("清除")}
                </button>
              </div>
            ) : null}
            {entriesExpanded ? (
              <ConfigEntryList
                emptyMessage={isPopular ? t("没有匹配的精灵") : undefined}
                entries={isPopular ? visibleEntries : listedEntries}
                skillById={skillById}
                spiritById={spiritById}
                stableHeight={isPopular}
              />
            ) : null}
            {parsed ? (
              <>
                <dl className="config-library-preview config-library-primary-preview">
                  {PRIMARY_PREVIEW_ROWS.map(([key, label]) => (
                    <div key={key}>
                      <dt>{t(label)}</dt>
                      <dd>{parsed.preview[key] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
                {parsed.preview.favoritesAdded > 0 ? <p className="config-library-note">{t("新增收藏 {count} 只", { count: parsed.preview.favoritesAdded })}</p> : null}
                {importChanges.length > 0 ? (
                  <ul className="config-library-issue-details config-library-changes" aria-label={t("配置变动项目")}>
                    {importChanges.map((change) => (
                      <li key={change.spiritId}>
                        <div className="config-library-issue-heading">
                          <strong>{change.spiritName}</strong>
                          <span>{change.status === "added" ? t("新增 · 将导入") : change.canUpdate ? t("不同 · 将更新") : t("不同 · 保留手改")}</span>
                        </div>
                        {change.differences.map((difference) => (
                          <p key={difference.field}>{t("{field}：本地 {local}；导入 {incoming}", { field: t(difference.field), local: difference.local, incoming: difference.incoming })}</p>
                        ))}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {importIssueCount === 0 ? (
                  <p className="config-library-check-ok">
                    {t("检查通过，未发现兼容问题")}
                  </p>
                ) : (
                  <div className="config-library-issues">
                    <button
                      aria-controls="config-library-import-issues"
                      aria-expanded={importIssuesExpanded}
                      className="config-library-issues-toggle"
                      onClick={() => setImportIssuesExpanded((expanded) => !expanded)}
                      type="button"
                    >
                      {t("检查详情（{count} 项）", { count: importIssueCount })}
                    </button>
                    {importIssuesExpanded ? (
                      <div id="config-library-import-issues">
                        <dl className="config-library-preview config-library-issue-preview">
                          {importIssues.map(([key, label]) => (
                            <div key={key}>
                              <dt>{t(label)}</dt>
                              <dd>{parsed.preview[key]}</dd>
                            </div>
                          ))}
                        </dl>
                        {importIssueDetails.length > 0 ? (
                          <ul className="config-library-issue-details">
                            {importIssueDetails.map((detail, index) => (
                              <li key={`${detail.type}:${detail.entryIndex}:${detail.spiritId ?? index}`}>
                                <div className="config-library-issue-heading">
                                  <strong>{detail.spiritName}</strong>
                                  <span>
                                    {t("文件第 {index} 条 · {type}", { index: detail.entryIndex, type: t(ISSUE_LABELS[detail.type] ?? "检查项") })}
                                  </span>
                                </div>
                                <p>{detail.reason}</p>
                                <small>{detail.action}</small>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {parsed.preview.duplicateEntries > 0 ? (
                          <p className="config-library-note">
                            {t("同一精灵在文件内出现多次，采用最后一条有效配置。")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
                <p className="config-library-note">
                  {parsed.preview.same > 0 && !parsed.preview.different && !parsed.preview.added
                    ? t("全部配置与本地一致，无需更新。")
                    : t("旧预设更新，手改配置保留，相同跳过。")}
                  {t("队伍与当前页面不会改变。")}
                </p>
              </>
            ) : (
              <p>{isPopular ? t("正在检查内置配置…") : t("选择文件后先校验，不会立即写入。")}</p>
            )}
          </>
        )}
        {error && !/permission denied/i.test(error) ? (
          <p className="config-library-error" role="alert">{error}</p>
        ) : null}
        <div className="dialog-actions">
          {isPopular ? (
            <label className="config-library-preset-toggle" title={t("展开精灵列表时浏览预设与手动收藏；输入文字仍搜索全部精灵")}>
              <input
                type="checkbox"
                role="switch"
                checked={presetBrowse.enabled}
                onChange={(event) => presetBrowse.setEnabled(event.target.checked)}
              />
              <span>{t("仅预览配置项")}</span>
            </label>
          ) : null}
          {isExport && <button className={`secondary-action${!canExport ? " secondary-panel-primary" : ""}`} onClick={onStartImport} type="button">{t("导入")}</button>}
          <button
            className="secondary-action secondary-panel-primary"
            disabled={isExport
              ? !canExport
              : !canImport}
            onClick={isExport ? onExport : onConfirmImport}
            type="button"
          >
            {isExport ? t("导出") : updateCount > 0 ? t("更新配置（{count}）", { count: updateCount }) : parsed?.preview.favoritesAdded > 0 ? t("添加收藏（{count}）", { count: parsed.preview.favoritesAdded }) : parsed?.preview.different > 0 ? t("手改配置已保留") : t("已是最新")}
          </button>
          <button className="secondary-action" onClick={onClose} type="button">
            {t("取消")}
          </button>
        </div>
      </section>
    </div>
  );
}
