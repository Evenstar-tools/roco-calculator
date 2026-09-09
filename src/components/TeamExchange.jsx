import { useEffect, useRef, useState } from "react";
import { getNature, STAT_LABELS } from "../domain/natures.js";
import { inspectLineupIvs, recommendLineupIvs } from "../state/lineup-ivs.js";
import { TEAM_BLOODLINE_OPTIONS } from "../state/team-presets.js";
import { exportLineupCode, importLineupCode, LINEUP_MODES } from "../state/lineup-code.js";
import "../styles/team-exchange.css";

let mappingRequest;
function loadMapping() {
  mappingRequest ??= fetch("./data/lineup-code-map.json").then((response) => {
    if (!response.ok) throw new Error("读取阵容数据失败");
    return response.json();
  }).then((data) => {
    if (!data?.spirits || !data?.skills || !data?.magic) throw new Error("阵容数据格式无效");
    return data;
  }).catch((error) => { mappingRequest = null; throw error; });
  return mappingRequest;
}

export function TeamExchange(props) {
  const [mapping, setMapping] = useState(props.mapping ?? null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mapping) return undefined;
    let active = true;
    loadMapping().then((data) => { if (active) setMapping(data); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [mapping, retry]);
  if (!mapping) return <section className="team-exchange" aria-label="阵容数据加载">
    <p role={failed ? "alert" : "status"}>{failed ? "阵容数据读取失败，请重试" : "正在读取阵容数据…"}</p>
    {failed ? <button type="button" onClick={() => { setFailed(false); setRetry(retry + 1); }}>重试</button> : null}
    <button type="button" onClick={props.onCancel}>返回队伍</button>
  </section>;
  return <TeamExchangeForm {...props} mapping={mapping} />;
}

function TeamExchangeForm({ mode, team, snapshot, onImport, onCancel, onUpdateLineup, mapping, presets }) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState(null);
  const exportTextRef = useRef(null);
  const [accepted, setAccepted] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const parseRequest = useRef(0);
  useEffect(() => () => { parseRequest.current++; }, []);
  const [magicId, setMagicId] = useState(team?.lineup?.magicId ?? "");
  const [formation, setFormation] = useState(team?.lineup ? team.lineup.mode ?? "" : 2);
  const isImport = mode === "import";
  useEffect(() => {
    if (manualCopy) {
      exportTextRef.current?.focus();
      exportTextRef.current?.select();
    }
  }, [manualCopy]);
  const options = { magicId: magicId === "" ? null : Number(magicId), mode: formation === "" ? null : Number(formation) };
  let exported = null;
  let exportError = "";
  if (!isImport && team) {
    try { exported = exportLineupCode(team, snapshot, mapping, options); }
    catch (failure) { exportError = failure.message; }
  }

  async function parse() {
    const request = ++parseRequest.current;
    setError("");
    setPreview(null);
    setAccepted(false);
    setRecommended([]);
    setRecommendations([]);
    try {
      const result = importLineupCode(input, snapshot, mapping);
      setPreview(result);
      setName(result.name);
      if (result.members.some(member => member && inspectLineupIvs(member.lineupSource.talents).status === "missing")) {
        setLoadingPresets(true);
        let entries = presets;
        if (!entries) {
          try {
            const response = await fetch("./data/presets/pvp-popular-configs.json");
            if (!response.ok) throw new Error("presets unavailable");
            entries = (await response.json()).entries;
          } catch { entries = []; }
        }
        if (request !== parseRequest.current) return;
        setRecommendations(result.members.map(member => recommendLineupIvs(member, snapshot, Array.isArray(entries) ? entries : [])));
        setLoadingPresets(false);
      }
    } catch (failure) { setError(failure.message); }
  }

  async function copy(value, kind) {
    setError("");
    setMessage("");
    setManualCopy(null);
    if (onUpdateLineup?.(team.id, options) === false) {
      setError("队伍分享设置保存失败，请重试");
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setMessage(kind === "url" ? "分享链接已复制" : "阵容码已复制");
    } catch {
      setManualCopy(kind);
      setError("无法访问剪贴板，请选中阵容文本手动复制");
    }
  }

  return (
    <section className={`team-exchange team-exchange--${isImport ? "import" : "export"}`} aria-label={isImport ? "阵容导入" : "阵容导出"}>
      <header><h3>{isImport ? "导入阵容" : "导出阵容"}</h3><button type="button" onClick={onCancel}>返回队伍</button></header>
      {isImport ? <>
        {!preview ? <><label>阵容码或分享链接
          <textarea autoFocus rows={4} value={input} maxLength={4096} placeholder="粘贴游戏或千岛复制的阵容代码"
            onChange={(event) => { setInput(event.target.value); setPreview(null); setError(""); }} />
        </label>
        <div className="team-exchange__actions"><button type="button" disabled={!input.trim()} onClick={parse}>解析阵容</button></div></> : (
          <div className="team-exchange__summary">
            <span>已解析 {preview.members.filter(Boolean).length} 位精灵 · {preview.members.reduce((count, member) => count + (member?.skills.four.filter(Boolean).length ?? 0), 0)} 个技能</span>
            <button type="button" onClick={() => { parseRequest.current++; setLoadingPresets(false); setPreview(null); setAccepted(false); setError(""); }}>修改代码</button>
          </div>
        )}
        {preview ? <>
          <label>新队伍名称<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
          <p className="team-exchange__note">{mapping.magic[preview.lineup.magicId] ?? (preview.lineup.magicId ? `魔法 ${preview.lineup.magicId}` : "无共鸣魔法")} · {LINEUP_MODES[preview.lineup.mode] ?? "未指定模式"}</p>
          {loadingPresets ? <p role="status">正在匹配个体推荐…</p> : recommendations.some(Boolean) ? <div className="team-exchange__recommend-all"><span>仅为缺失配置提供参考，各项 60；默认不采用。</span><button type="button" onClick={() => setRecommended(recommendations.map((entry, index) => entry ? index : -1).filter(index => index >= 0))}>缺失项全部推荐</button></div> : null}
          <ol className="team-exchange__members">
            {preview.members.map((member, index) => {
              const spirit = snapshot.spirits.find((entry) => entry.id === member?.spiritId);
              const portrait = spirit?.asset?.localUrl ?? spirit?.assetUrl;
              return <li key={index} aria-label={`第 ${index + 1} 位 · ${spirit?.fullName ?? "空位"}`}>
                {portrait ? <img className="team-exchange__portrait" src={portrait} alt={spirit.fullName} width="44" height="44" /> : <span className="team-exchange__slot">{index + 1}</span>}
                <div><strong>{spirit?.fullName ?? "空位"}</strong>{member ? <>
                  <span className="team-exchange__meta">{getNature(member.natureId).name} · {TEAM_BLOODLINE_OPTIONS.find((entry) => entry.value === member.bloodlineType)?.label}血脉<small className="team-iv-pending">{recommended.includes(index) ? "已采用推荐" : inspectLineupIvs(member.lineupSource.talents).status === "selected" ? "原码选择 · 按 60 恢复" : inspectLineupIvs(member.lineupSource.talents).status === "unknown" ? "原码个体待确认" : "个体未配置"}</small></span>
                  <p>{member.skills.four.map((id) => snapshot.skills.find((entry) => entry.id === id)?.name ?? "空技能").join(" / ")}</p>
                  {recommendations[index] ? <label className="team-exchange__check team-exchange__recommend"><input type="checkbox" checked={recommended.includes(index)} onChange={event => setRecommended(current => event.target.checked ? [...current, index] : current.filter(value => value !== index))} />
                    <span>使用推荐：{Object.entries(recommendations[index].values).filter(([, value]) => value === 60).map(([stat]) => STAT_LABELS[stat]).join("／")}<small>{recommendations[index].reason}</small></span>
                  </label> : inspectLineupIvs(member.lineupSource.talents).status === "selected" ? <p className="team-exchange__iv-values">{Object.entries(member.displayIvs).filter(([, value]) => value === 60).map(([stat]) => STAT_LABELS[stat]).join("／")} · 各 60，非原始数值</p> : null}
                </> : null}</div>
              </li>;
            })}
          </ol>
          <label className="team-exchange__check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            已确认个体处理：原码选择及推荐按 60，未设置或待确认项暂按 0，可在保存后调整。
          </label>
          <div className="team-exchange__actions"><button type="button" disabled={!accepted || !name.trim()} onClick={() => {
            const members = preview.members.map((member, index) => recommended.includes(index) && recommendations[index] ? { ...member, displayIvs: { ...recommendations[index].values }, ivsPending: false } : member);
            if (onImport({ ...preview, members, name: name.trim() }) !== true) setError("队伍保存失败，请重试");
          }}>保存并调整个体</button><span className="team-exchange__save-note">另存为新队伍，不覆盖原队伍</span></div>
        </> : null}
      </> : <>
        <p className="team-exchange__note">{team?.name} · 可粘贴到游戏或千岛的阵容导入入口</p>
        <div className="team-exchange__options">
          <label>共鸣魔法<select value={magicId} onChange={(event) => { setMagicId(event.target.value); setMessage(""); setError(""); setManualCopy(null); }}>
            <option value="">无共鸣魔法</option>
            {magicId && !mapping.magic[magicId] ? <option value={magicId}>魔法 {magicId}</option> : null}
            {Object.entries(mapping.magic).filter(([id]) => Number(id) <= 104010 || String(magicId) === id).map(([id, label]) => <option key={id} value={id}>{label}{Number(id) > 104010 ? "（原阵容）" : ""}</option>)}
          </select></label>
          <label>编队模式<select value={formation} onChange={(event) => { setFormation(event.target.value); setMessage(""); setError(""); setManualCopy(null); }}>
            <option value="">未指定</option>
            {formation && !LINEUP_MODES[formation] ? <option value={formation}>模式 {formation}</option> : null}
            {Object.entries(LINEUP_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
        </div>
        <p className="team-exchange__note">包含成员、性格、血脉及四技能；不含实际个体值、月相记忆和战斗参数。</p>
        <p className="team-exchange__note">个体未编辑时保留原码；编辑后导出最多三项已选属性，不含具体数值。</p>
        {exported ? <>
          <label>{manualCopy === "url" ? "官方分享链接" : "阵容代码"}<textarea ref={exportTextRef} readOnly rows={2} value={manualCopy === "url" ? exported.url : exported.code} onFocus={(event) => event.target.select()} /></label>
          <div className="team-exchange__actions"><button type="button" onClick={() => copy(exported.code, "code")}>复制阵容码</button><button type="button" onClick={() => copy(exported.url, "url")}>复制分享链接</button></div>
        </> : null}
      </>}
      {error || exportError ? <p className="team-exchange__error" role="alert">{error || exportError}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
