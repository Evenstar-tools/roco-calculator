// Present known storage failures without leaking untranslated browser messages.
export function storageIssueSource(error, fallback = "存档读取失败；原始内容仍保留") {
  switch (error?.code) {
    case "STORAGE_CONFLICT": return "另一标签页已更新存档；本标签内容已保留，未覆盖存档";
    case "STORAGE_CORRUPT": return "存档损坏；原始内容已保留，未覆盖";
    case "SERVER_MISMATCH": return "存档服务器不匹配，未导入";
    case "UNKNOWN_SERVER": return "无法识别存档服务器，未导入";
    case "SERVER_DATA_UNVERIFIED": return "国际服资料尚未核验，此操作暂不可用";
    case "INCOMPATIBLE_SERVER_VERSION": return "存档版本不兼容，原始内容已保留";
    case "STORAGE_WRITE_FAILED": return "存档写入失败；原始内容和本标签内容仍保留";
    case "STORAGE_UNAVAILABLE": return "本地存储不可用；本标签内容仍保留";
    case "INVALID_WORKSPACE": return "配置库结构无效，未导入";
    default: return fallback;
  }
}

export function configLibraryImportMessage(t, preview) {
  const parts = [];
  if (preview.added) parts.push(t("已新增 {count} 只配置", { count: preview.added }));
  if (preview.updated) parts.push(t("更新 {count} 条配置", { count: preview.updated }));
  if (preview.preserved ?? preview.different) parts.push(t("保留手改 {count} 条", { count: preview.preserved ?? preview.different }));
  if (preview.favoritesAdded) parts.push(t("新增收藏 {count} 只", { count: preview.favoritesAdded }));
  const skipped = (preview.missingSpirits ?? 0) + (preview.invalidEntries ?? 0);
  if (skipped) parts.push(t("跳过异常 {count} 条", { count: skipped }));
  return parts.length ? parts.join(" · ") : t("配置与本地一致，无需更新。");
}
