import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_SPEED_PROFILES, createBaseSpeedGroups, selectBaseSpeedGroups } from "../features/team-ability/domain/ranking-tools.js";

const labels = ["无个体", "满个体", "极速"];

export default function BaseSpeedOverview({ location, detail, detailPanel, snapshot, query, onQueryChange, onDetail, onLocate }) {
  const [mobileProfile, setMobileProfile] = useState("positive-max");
  const baseGroups = useMemo(() => createBaseSpeedGroups({ snapshot }), [snapshot]);
  const groups = useMemo(() => selectBaseSpeedGroups(baseGroups, query), [baseGroups, query]);
  const locationRef = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => locationRef.current?.scrollIntoView?.({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return <section className="base-speed" aria-label="种族速度总览">
    <div className="rank-toolbar">
      <label className="rank-search"><input aria-label="搜索种族总览" placeholder="名称、图鉴号或种族速度" value={query} onChange={event => onQueryChange(event.target.value)} /></label>
      <select className="base-speed-mobile-profile" aria-label="总览培养口径" value={mobileProfile} onChange={event => setMobileProfile(event.target.value)}>{BASE_SPEED_PROFILES.map((id, index) => <option key={id} value={id}>{labels[index]}</option>)}</select>
      <button type="button" onClick={() => onQueryChange("")}>重置</button>
    </div>
    <p className="base-speed-note">60级标准值 · 个体0 / 个体60 / 个体60且速度性格×1.2 · 不叠加条件特性。点击数值定位实速，点头像查看详情。</p>
    <div className="rank-summary">{groups.length}档 · {groups.reduce((sum, group) => sum + group.members.length, 0)}个形态</div>
    <div className="rank-table-scroll"><table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }} aria-label="种族速度档位表">
      <thead><tr><th>种族速度</th>{BASE_SPEED_PROFILES.map((id, index) => <th key={id} className={`base-speed-column${mobileProfile === id ? " is-mobile-selected" : ""}`}>{labels[index]}</th>)}<th>精灵 · 最终形态与首领</th></tr></thead>
      <tbody>{groups.map(group => <tr key={group.key} ref={group.base === location?.base ? locationRef : null} aria-current={group.base === location?.base ? "true" : undefined} style={group.base === location?.base ? { background: "var(--color-primary-soft, #f3f1ff)" } : undefined}>
        <th scope="row">{group.base}</th>
        {BASE_SPEED_PROFILES.map((id, index) => <td key={id} className={`base-speed-column${mobileProfile === id ? " is-mobile-selected" : ""}`}><button className="base-speed-value" type="button" aria-label={`${group.base}种族${labels[index]}，定位实速${group.values[index]}`} onClick={() => onLocate(id, group.values[index])}>{group.values[index]}</button></td>)}
        <td><div className="base-speed-portraits" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{group.members.map(({ spirit, targets }) => <button style={{ width: 72, height: 72, padding: 3, border: 0, background: "transparent" }} key={spirit.id} type="button" title={spirit.fullName} aria-label={`查看${spirit.fullName}标准速度详情`} onClick={() => onDetail(targets[mobileProfile])}>{spirit.asset?.localUrl || spirit.imageUrl ? <img style={{ width: 64, height: 64, objectFit: "contain" }} alt="" src={spirit.asset?.localUrl ?? spirit.imageUrl} /> : <span>{spirit.fullName}</span>}</button>)}</div>{detail && group.members.some(member => member.spirit.id === detail.spiritId) ? detailPanel : null}</td>
      </tr>)}</tbody>
    </table>{!groups.length ? <p className="rank-empty">没有匹配的精灵或种族速度。</p> : null}</div>
  </section>;
}
