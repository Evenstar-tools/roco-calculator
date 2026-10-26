import { createContext, useContext } from "react";
import { ComparisonDamage } from "./ComparisonResults.jsx";

export const BalanceComparisonContext = createContext(null);

export function InlineComparison({ result, side, index, kind = "skill" }) {
  const comparison = useContext(BalanceComparisonContext);
  if (!comparison?.active) return null;
  const direction = side === "attacker" ? "forward" : "reverse";
  const before = !side ? comparison.beforeView?.result?.selectedResult
    : kind === "trait" ? comparison.beforeView?.traitResultsByDirection?.[direction]
      : comparison.beforeView?.skillResultsByDirection?.[direction]?.[index];
  return <span className="balance-inline"><ComparisonDamage before={before} after={result} issue={comparison.issue} /></span>;
}
