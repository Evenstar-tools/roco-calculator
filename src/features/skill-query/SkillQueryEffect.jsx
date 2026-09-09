import { useId, useLayoutEffect, useRef, useState } from "react";

export default function SkillQueryEffect({ skill, expanded, onToggle, onReverse }) {
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
  const hasSource = skill.detailUrl?.startsWith("https://wiki.biligame.com/");
  const hasDetails = clipped || hasSource || skill.methods?.length > 0;
  return <div className={`sq-effect${expanded ? " sq-skill-expanded" : ""}`}>
    <div className="sq-effect-line">
      <p ref={paragraph} className={expanded ? "" : "sq-effect-summary"}>{skill.description || "技能效果待补充"}</p>
      {onReverse && <button className="sq-reverse" aria-label={`查${skill.name}的可学精灵`} onClick={onReverse}>可学精灵</button>}
      {hasDetails && <button className="sq-effect-more" aria-label={`查看${skill.name}详情`} aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>{expanded ? "收起" : clipped ? "全文" : "详情"}</button>}
    </div>
    {expanded && <div id={detailsId} className="sq-effect-details">
      {skill.methods?.length > 0 && <small>{skill.methods.join(" / ")}</small>}
      {hasSource && <a href={skill.detailUrl} target="_blank" rel="noreferrer">BWIKI 资料</a>}
    </div>}
  </div>;
}
