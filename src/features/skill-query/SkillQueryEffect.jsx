import { useId, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext.jsx";

export default function SkillQueryEffect({ skill, expanded, onToggle, onReverse, placeholder = false }) {
  const { t } = useLocale();
  const paragraph = useRef(null);
  const detailsId = useId();
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const element = paragraph.current;
    const measure = () => {
      if (!expanded) setClipped(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, skill.description]);
  const hasSource = !placeholder && skill.detailUrl?.startsWith("https://wiki.biligame.com/");
  const hasMethods = !placeholder && skill.methods?.length > 0;
  const hasDetails = clipped || hasSource || hasMethods;
  return <div className={`sq-effect${expanded ? " sq-skill-expanded" : ""}`}>
    <div className="sq-effect-line">
      <p ref={paragraph} className={expanded ? "" : "sq-effect-summary"}>{skill.description || t("技能效果待补充")}</p>
      {onReverse && <button className="sq-reverse" aria-label={t("查{name}的可学精灵", { name: skill.name })} onClick={onReverse}>{t("可学精灵")}</button>}
      {hasDetails && <button className="sq-effect-more" aria-label={t("查看{name}详情", { name: skill.name })} aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>{t(expanded ? "收起" : clipped ? "全文" : "详情")}</button>}
    </div>
    {expanded && <div id={detailsId} className="sq-effect-details">
      {hasMethods && <small>{skill.methods.join(" / ")}</small>}
      {hasSource && <a href={skill.detailUrl} target="_blank" rel="noreferrer">{t("BWIKI 资料")}</a>}
    </div>}
  </div>;
}
