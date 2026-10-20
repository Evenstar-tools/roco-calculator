import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { parseTeamDraft, serializeTeamDraft, TEAM_DRAFT_MAX_BYTES } from "../state/team-draft-exchange.js";

const errorSources = {
  TEAM_DRAFT_INVALID: "队伍草稿结构无效，未导入任何内容。",
  TEAM_DRAFT_FORMAT: "请选择工具队伍草稿 JSON；不支持游戏原生阵容码。",
  TEAM_DRAFT_SERVER_MISMATCH: "队伍草稿属于其他服务器，未导入任何内容。",
  TEAM_DRAFT_VERSION: "队伍草稿版本不受支持，未导入任何内容。",
  TEAM_DRAFT_TOO_LARGE: "队伍草稿文件不能超过 1 MB。",
  TEAM_DRAFT_JSON: "队伍草稿 JSON 无法解析，未导入任何内容。",
};

export function GlobalTeamDraftExchange({ mode, team, snapshot, onImport, onCancel }) {
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const outputRef = useRef(null);
  useEffect(() => () => { request.current++; }, []);
  const isImport = mode === "import";
  let output = "";
  let exportError = "";
  if (!isImport) {
    try { output = serializeTeamDraft(team); }
    catch (failure) { exportError = errorSources[failure.code] ?? "队伍草稿结构无效，未导入任何内容。"; }
  }

  function changed(value) {
    request.current++;
    setInput(value); setPreview(null); setError(""); setMessage(""); setLoading(false);
  }
  function parse(value = input) {
    setError(""); setPreview(null); setMessage("");
    try { setPreview(parseTeamDraft(value)); }
    catch (failure) { setError(errorSources[failure.code] ?? "队伍草稿读取失败。"); }
  }
  async function readFile(file) {
    if (!file) return;
    const current = ++request.current;
    setPreview(null); setError(""); setMessage(""); setLoading(true);
    try {
      if (file.size > TEAM_DRAFT_MAX_BYTES) throw Object.assign(new Error(), { code: "TEAM_DRAFT_TOO_LARGE" });
      const text = await file.text();
      if (request.current !== current) return;
      setInput(text); parse(text);
    } catch (failure) {
      if (request.current === current) setError(errorSources[failure.code] ?? "队伍草稿读取失败。");
    } finally {
      if (request.current === current) setLoading(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setMessage("队伍草稿已复制");
    } catch {
      outputRef.current?.focus(); outputRef.current?.select();
      setMessage("无法自动复制，请复制下方 JSON。");
    }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([output], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "roco-team-draft-global.json"; anchor.click();
      URL.revokeObjectURL(url);
    } catch { setError("队伍草稿下载失败，请复制 JSON。"); }
  }
  function confirm() {
    try {
      // Revalidate immediately before the only callback that can write storage.
      const imported = parseTeamDraft(serializeTeamDraft(preview));
      if (onImport?.(imported) !== true) setError("队伍草稿保存失败，原队伍未覆盖。");
    } catch { setError("队伍草稿保存失败，原队伍未覆盖。"); }
  }
  return <section className={`team-exchange team-exchange--${isImport ? "import" : "export"}`} aria-label={t("队伍草稿导入导出")}>
    <header><h3>{t(isImport ? "导入队伍草稿" : "导出队伍草稿")}</h3><button type="button" onClick={onCancel}>{t("返回队伍")}</button></header>
    <p className="team-exchange__note">{t("工具队伍草稿 JSON，与游戏原生阵容码不同。")}</p>
    {isImport ? <>
      <label>{t("队伍草稿 JSON")}<textarea rows={5} value={input} onChange={(event) => changed(event.target.value)} spellCheck={false} /></label>
      <label>{t("选择 JSON 文件")}<input type="file" accept=".json,application/json" onChange={(event) => { readFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      <div className="team-exchange__actions"><button type="button" disabled={!input.trim() || loading} onClick={() => parse()}>{t(loading ? "正在读取草稿…" : "预览队伍草稿")}</button></div>
      {preview ? <>
        <div className="team-exchange__summary"><strong>{preview.name || t("未命名队伍")}</strong><span>{t("{count} 个已配置位置", { count: preview.members.filter(Boolean).length })}</span></div>
        <ol className="team-exchange__members">{preview.members.map((member, index) => <li key={index}><span className="team-exchange__slot">{index + 1}</span><div>{member ? snapshot.spirits.find((spirit) => spirit.id === member.spiritId)?.fullName ?? member.spiritId : t("空位 {index}", { index: index + 1 })}</div></li>)}</ol>
        <p className="team-exchange__note">{t("导入会新增一支队伍，不覆盖已有队伍；未知引用和参数原样保留。")}</p>
        <div className="team-exchange__actions"><button type="button" onClick={confirm}>{t("确认导入为新队伍")}</button></div>
      </> : null}
    </> : <>
      <div className="team-exchange__actions"><button type="button" disabled={!output} onClick={copy}>{t("复制队伍草稿")}</button><button type="button" disabled={!output} onClick={download}>{t("下载 JSON")}</button></div>
      {output ? <label>{t("队伍草稿 JSON")}<textarea ref={outputRef} readOnly value={output} spellCheck={false} /></label> : null}
    </>}
    {error || exportError ? <p className="team-exchange__error" role="alert">{t(error || exportError)}</p> : null}
    {message ? <p role="status">{t(message)}</p> : null}
  </section>;
}
