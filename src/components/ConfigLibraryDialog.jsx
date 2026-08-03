import { useEffect, useRef, useState } from "react";
import { getNature } from "../domain/natures.js";

const PRIMARY_PREVIEW_ROWS = [
  ["added", "新增配置"],
  ["overwritten", "覆盖本机配置"],
  ["favoritesAdded", "新增收藏"],
];

const ISSUE_PREVIEW_ROWS = [
  ["missingSpirits", "缺失精灵"],
  ["missingSkills", "失效技能槽"],
  ["unknownTraitFields", "未知特性字段"],
  ["invalidEntries", "无效配置"],
  ["duplicateEntries", "文件内重复"],
];

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
  const [exportExpanded, setExportExpanded] = useState(false);
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
  }, [mode]);

  useEffect(() => {
    setExportExpanded(false);
    setImportIssuesExpanded(false);
  }, [exportSummary, mode]);

  useEffect(() => {
    setImportIssuesExpanded(false);
  }, [parsed]);

  if (!mode) return null;
  const isExport = mode === "export";
  const exportEntries = exportSummary?.library?.entries ?? [];
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
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        aria-label={isExport ? "配置库导出" : "配置库导入"}
        aria-modal="true"
        className="share-dialog config-library-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2>{isExport ? "配置库导出" : "配置库导入"}</h2>
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
              {exportEntries.length > 0 ? (
                <button
                  aria-controls="config-library-export-entries"
                  aria-expanded={exportExpanded}
                  aria-label={exportExpanded ? "收起精灵和技能" : "查看精灵和技能"}
                  className="config-library-summary-toggle"
                  onClick={() => setExportExpanded((expanded) => !expanded)}
                  type="button"
                >
                  {exportExpanded ? "收起清单" : "查看精灵和技能"}
                </button>
              ) : null}
            </div>
            {exportExpanded ? (
              <ul
                className="config-library-entry-list"
                id="config-library-export-entries"
              >
                {exportEntries.map((entry) => {
                  const spirit = spiritById.get(entry.spiritId);
                  const spiritName = spirit?.fullName ?? entry.spiritId;
                  const natureName =
                    getNature(entry.natureId)?.name ?? entry.natureId;
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
            ) : null}
            <p>包含手动收藏和绿色完整配置的性格、个体、四技能与特性。</p>
          </>
        ) : (
          <>
            <label>
              <span>选择配置库 JSON（最大 5 MB）</span>
              <input
                accept="application/json,.json"
                aria-label="选择配置库文件"
                onChange={(event) => onFile?.(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
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
                {parsed.preview.overwritten > 0 ? (
                  <p className="config-library-warning">
                    确认后将覆盖 {parsed.preview.overwritten} 只精灵的现有配置。
                  </p>
                ) : null}
              </>
            ) : (
              <p>选择文件后先校验，不会立即写入。</p>
            )}
          </>
        )}
        {error ? <p className="config-library-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button
            className="secondary-action"
            disabled={isExport
              ? (exportSummary?.exportedCount ?? 0) === 0
              : !parsed || (
                parsed.entries.length === 0 &&
                parsed.favoriteSpiritIds.length === 0
              )}
            onClick={isExport ? onExport : onConfirmImport}
            type="button"
          >
            {isExport ? "导出" : "确认导入"}
          </button>
          <button className="secondary-action" onClick={onClose} type="button">
            取消
          </button>
        </div>
      </section>
    </div>
  );
}
