import { useEffect, useRef, useState } from "react";
import { getNature } from "../domain/natures.js";

const POPULAR_CONFIG_COUNT = 213;
const PRIMARY_PREVIEW_ROWS = [
  ["added", "新增配置"],
  ["overwritten", "覆盖本机配置"],
  ["favoritesAdded", "新增收藏"],
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

function ConfigEntryList({ entries, skillById, spiritById }) {
  return (
    <ul className="config-library-entry-list" id="config-library-entries">
      {entries.map((entry) => {
        const spirit = spiritById.get(entry.spiritId);
        const spiritName = spirit?.fullName ?? entry.spiritId;
        const natureName = getNature(entry.natureId)?.name ?? entry.natureId;
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
                <span>性格 {natureName}</span>
              </div>
              <ol className="config-library-entry-skills">
                {entry.skills.map((skillId, index) => (
                  <li key={`${entry.spiritId}:skill:${index}`}>
                    <span>{index + 1}</span>
                    <strong>{skillById.get(skillId)?.name ?? skillId ?? "空"}</strong>
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
  parsed,
  snapshot,
}) {
  const dialogRef = useRef(null);
  const [entriesExpanded, setEntriesExpanded] = useState(false);
  const [importIssuesExpanded, setImportIssuesExpanded] = useState(false);

  useEffect(() => {
    if (!mode) return undefined;
    const trigger = document.activeElement;
    dialogRef.current?.querySelector("button, input")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [mode, onClose]);

  useEffect(() => {
    // 切换导出摘要或对话框模式时收回折叠，避免沿用上一份列表的展开态。
    /* eslint-disable react-hooks/set-state-in-effect -- 重置局部 UI，改渲染期 setState 会打断当前预览 */
    setEntriesExpanded(false);
    setImportIssuesExpanded(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [exportSummary, mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 新解析结果应收回问题列表
    setImportIssuesExpanded(false);
  }, [parsed]);

  if (!mode) return null;
  const isExport = mode === "export";
  const isPopular = mode === "popular";
  const dialogTitle = isExport
    ? "配置库导出"
    : isPopular
      ? "常用精灵配置"
      : "配置库导入";
  const listedEntries = isExport
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
  const importIssues = parsed
    ? ISSUE_PREVIEW_ROWS.filter(([key]) => Number(parsed.preview[key]) > 0)
    : [];
  const importIssueCount = importIssues.reduce(
    (total, [key]) => total + Number(parsed.preview[key]),
    0,
  );
  const importIssueDetails = parsed?.issueDetails ?? [];
  const canImport = Boolean(parsed) && (
    parsed.entries.length > 0 || parsed.favoriteSpiritIds.length > 0
  );

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
        className="share-dialog config-library-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2>{dialogTitle}</h2>
        {isExport ? (
          <>
            <div className="config-library-summary">
              <strong>可导出 {exportSummary?.exportedCount ?? 0} 只精灵</strong>
              <dl className="config-library-summary-details">
                <div>
                  <dt>手动收藏</dt>
                  <dd>{exportSummary?.manualConfiguredCount ?? 0}</dd>
                </div>
                <div>
                  <dt>自动识别</dt>
                  <dd>{exportSummary?.autoIncludedCount ?? 0}</dd>
                </div>
                <div>
                  <dt>跳过</dt>
                  <dd>{exportSummary?.skippedUnconfiguredCount ?? 0}</dd>
                </div>
              </dl>
              {listedEntries.length > 0 ? (
                <button
                  aria-controls="config-library-entries"
                  aria-expanded={entriesExpanded}
                  aria-label={entriesExpanded ? "收起精灵和技能" : "查看精灵和技能"}
                  className="config-library-summary-toggle"
                  onClick={() => setEntriesExpanded((expanded) => !expanded)}
                  type="button"
                >
                  {entriesExpanded ? "收起清单" : "查看精灵和技能"}
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
            <p>包含手动收藏和绿色完整配置的性格、个体、四技能与特性。</p>
          </>
        ) : (
          <>
            {isPopular ? (
              <div className="popular-config-summary">
                <div>
                  <strong>PVP 热门配置 · {POPULAR_CONFIG_COUNT} 只</strong>
                  <span>安装后可离线导入</span>
                </div>
                {listedEntries.length > 0 ? (
                  <button
                    aria-controls="config-library-entries"
                    aria-expanded={entriesExpanded}
                    aria-label={entriesExpanded ? "收起精灵和技能" : "查看精灵和技能"}
                    className="config-library-summary-toggle"
                    onClick={() => setEntriesExpanded((expanded) => !expanded)}
                    type="button"
                  >
                    {entriesExpanded ? "收起清单" : "查看精灵和技能"}
                  </button>
                ) : null}
              </div>
            ) : (
              <label>
                <span>选择配置库 JSON（最大 5 MB）</span>
                <input
                  accept="application/json,.json"
                  aria-label="选择配置库文件"
                  onChange={(event) => onFile?.(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
            )}
            {entriesExpanded ? (
              <ConfigEntryList
                entries={listedEntries}
                skillById={skillById}
                spiritById={spiritById}
              />
            ) : null}
            {parsed ? (
              <>
                <dl className="config-library-preview config-library-primary-preview">
                  {PRIMARY_PREVIEW_ROWS.map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{parsed.preview[key]}</dd>
                    </div>
                  ))}
                </dl>
                {importIssueCount === 0 ? (
                  <p className="config-library-check-ok">
                    检查通过，未发现兼容问题
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
                      检查详情（{importIssueCount} 项）
                    </button>
                    {importIssuesExpanded ? (
                      <div id="config-library-import-issues">
                        <dl className="config-library-preview config-library-issue-preview">
                          {importIssues.map(([key, label]) => (
                            <div key={key}>
                              <dt>{label}</dt>
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
                                    文件第 {detail.entryIndex} 条 · {ISSUE_LABELS[detail.type] ?? "检查项"}
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
                            同一精灵在文件内出现多次，采用最后一条有效配置。
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
                {parsed.warnings.map((warning) => (
                  <p className="config-library-warning" key={warning}>{warning}</p>
                ))}
                {isPopular ? (
                  <p className="config-library-note">
                    只覆盖同 ID 精灵配置，队伍与当前页面不会改变。
                  </p>
                ) : parsed.preview.overwritten > 0 ? (
                  <p className="config-library-warning">
                    确认后将覆盖 {parsed.preview.overwritten} 只精灵的现有配置。
                  </p>
                ) : null}
              </>
            ) : (
              <p>{isPopular ? "正在检查内置配置…" : "选择文件后先校验，不会立即写入。"}</p>
            )}
          </>
        )}
        {error && !/permission denied/i.test(error) ? (
          <p className="config-library-error" role="alert">{error}</p>
        ) : null}
        <div className="dialog-actions">
          <button
            className="secondary-action"
            disabled={isExport
              ? (exportSummary?.exportedCount ?? 0) === 0
              : !canImport}
            onClick={isExport ? onExport : onConfirmImport}
            type="button"
          >
            {isExport ? "导出" : isPopular ? "导入常用配置" : "确认导入"}
          </button>
          <button className="secondary-action" onClick={onClose} type="button">
            取消
          </button>
        </div>
      </section>
    </div>
  );
}
