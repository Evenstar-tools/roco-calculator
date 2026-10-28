import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_SPEED_PROFILES, createBaseSpeedGroups, selectBaseSpeedGroups } from "../features/team-ability/domain/ranking-tools.js";

const labels = ["无个体", "满个体", "极速"];

export default function BaseSpeedOverview({ location, detail, detailPanel, snapshot, query, onQueryChange, onDetail, onLocate }) {
  const { t } = useLocale();
  const [mobileProfile, setMobileProfile] = useState("positive-max");
  const baseGroups = useMemo(() => createBaseSpeedGroups({ snapshot }), [snapshot]);
  const groups = useMemo(() => selectBaseSpeedGroups(baseGroups, query), [baseGroups, query]);
  const hasLevelVariants = groups.some(group => group.members.some(member => member.level !== 60));
  const locationRef = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => locationRef.current?.scrollIntoView?.({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return <section className="base-speed" aria-label={t("种族速度总览")}>
    <div className="rank-toolbar">
      <label className="rank-search"><input aria-label={t("搜索种族总览")} placeholder={t("名称、图鉴号或种族速度")} value={query} onChange={event => onQueryChange(event.target.value)} /></label>
      <select className="base-speed-mobile-profile" aria-label={t("总览培养口径")} value={mobileProfile} onChange={event => setMobileProfile(event.target.value)}>{BASE_SPEED_PROFILES.map((id, index) => <option key={id} value={id}>{t(labels[index])}</option>)}</select>
      <button type="button" onClick={() => onQueryChange("")}>{t("重置")}</button>
    </div>
    <p className="base-speed-note">{hasLevelVariants ? t("默认60级，冥古龙按标注等级") : t("60级标准值")}{" "}{t("· 个体0 / 个体60 / 个体60且速度性格×1.2 · 不叠加条件特性。点击数值定位实速，点头像查看详情。")}</p>
    <div className="rank-summary">{groups.length}{t("档 ·")}{" "}{groups.reduce((sum, group) => sum + group.members.length, 0)}{t("个")}{hasLevelVariants ? t("配置") : t("形态")}</div>
    <div className="rank-table-scroll"><table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }} aria-label={t("种族速度档位表")}>
      <thead><tr><th>{t("种族速度")}</th>{BASE_SPEED_PROFILES.map((id, index) => <th key={id} className={`base-speed-column${mobileProfile === id ? " is-mobile-selected" : ""}`}>{t(labels[index])}</th>)}<th>{t("精灵 · 最终形态与首领")}</th></tr></thead>
      <tbody>{groups.map(group => <tr key={group.key} ref={group.base === location?.base ? locationRef : null} aria-current={group.base === location?.base ? "true" : undefined} style={group.base === location?.base ? { background: "var(--color-primary-soft, #f3f1ff)" } : undefined}>
        <th scope="row">{group.base}</th>
        {BASE_SPEED_PROFILES.map((id, index) => <td key={id} className={`base-speed-column${mobileProfile === id ? " is-mobile-selected" : ""}`}><button className="base-speed-value" type="button" aria-label={t("{v0}种族{v1}，定位实速{v2}", { v0: group.base, v1: labels[index], v2: group.values[index] })} onClick={() => onLocate(id, group.values[index])}>{group.values[index]}</button></td>)}
        <td><div className="base-speed-portraits" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{group.members.map(({ id, name, level, spirit, targets }) => <button style={{ width: 72, minHeight: 72, padding: 3, border: 0, background: "transparent" }} key={id} type="button" title={t(name)} aria-label={t("查看{v0}标准速度详情", { v0: name })} onClick={() => onDetail(targets[mobileProfile])}>{spirit.asset?.localUrl || spirit.imageUrl ? <img style={{ width: 64, height: 64, objectFit: "contain" }} alt="" src={spirit.asset?.localUrl ?? spirit.imageUrl} /> : <span>{t(name)}</span>}{level !== 60 ? <small style={{ display: "block" }}>{level}{t("级")}</small> : null}</button>)}</div>{detail && group.members.some(member => member.id === detail.id) ? detailPanel : null}</td>
      </tr>)}</tbody>
    </table>{!groups.length ? <p className="rank-empty">{t("没有匹配的精灵或种族速度。")}</p> : null}</div>
  </section>;
}
