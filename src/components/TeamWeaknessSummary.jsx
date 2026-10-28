import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { ElementIcon } from "./ElementIcon.jsx";

function Portrait({ member }) {
  const { t } = useLocale();
  return member.assetUrl ? <img src={member.assetUrl} alt={member.name} title={t(member.name)} /> : <span title={t(member.name)}>{t(member.name)}</span>;
}

export default function TeamWeaknessSummary({ analysis, onCandidates }) {
  const { typeName, t } = useLocale();
  const rows = analysis.types.map(type => {
    const members = analysis.members.filter(member => member.defense.some(cell => cell.type === type && cell.multiplier > 1));
    const resistant = analysis.members.filter(member => member.defense.some(cell => cell.type === type && cell.multiplier !== null && cell.multiplier < 1));
    return { type, members, resistant };
  }).filter(row => row.members.length).sort((a, b) => b.members.length - a.members.length);
  return <section className="team-weakness-summary" aria-label={t("队伍弱点汇总")}>
    <h3>{t("队伍弱点")}{" "}<small>{t("按成员数量排序")}</small></h3>
    {rows.map(row => <button type="button" className="team-weakness-row" title={t("查看抗性候选")} key={row.type} aria-label={t("查看{v0}抗性候选", { v0: row.type })} onClick={() => onCandidates(row.type)}>
      <strong><ElementIcon type={row.type} size={22} />{row.members.length}{" "}{t("个")}{typeName(row.type)}{t("属性弱点")}</strong>
      <span className="weakness-members">{row.members.map((member, index) => <Portrait key={index} member={member} />)}</span>
      <span className="weakness-resistance"><small>{t("可抵抗 ×")}{row.resistant.length}</small>{row.resistant.map((member, index) => <Portrait key={index} member={member} />)}</span>
    </button>)}
    {!rows.length ? <p>{t("当前队伍没有属性弱点。")}</p> : null}
  </section>;
}
