import { damageSegments } from "../domain/result-presentation.js";
export { damagePresentation } from "../domain/result-presentation.js";

export function DamageSegments({ presentation, className = "" }) {
  return <span className={`damage-coverage ${className}`.trim()}>
    {damageSegments(presentation).map(({ kind, width }) => (
      <span className={`damage-coverage__${kind}`} key={kind} style={{ width: `${width}%` }} />
    ))}
  </span>;
}
