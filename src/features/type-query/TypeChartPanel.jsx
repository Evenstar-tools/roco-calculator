import { X } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { ELEMENT_TYPES, getTypeMultiplier } from "../../domain/type-chart.js";
import { useModalFocus } from "../../hooks/useModalFocus.js";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import "./type-query.css";
import "./type-chart.css";

function isCompleteChart(chart) {
  return Array.isArray(chart?.types) && chart.types.length === ELEMENT_TYPES.length &&
    ELEMENT_TYPES.every((type) => chart.types.includes(type)) &&
    Array.isArray(chart.matrix) && chart.matrix.length === chart.types.length &&
    chart.matrix.every((row) => Array.isArray(row) && row.length === chart.types.length &&
      row.every((value) => [0, 0.5, 1, 2].includes(value)));
}

const tone = (value) => value > 1 ? "strong" : value < 1 ? "weak" : "neutral";

export default function TypeChartPanel({ typeChart, onClose }) {
  const { t, typeName } = useLocale();
  const root = useRef(null);
  const headingId = useId();
  const axesId = useId();
  const [selected, setSelected] = useState(null);
  const [focused, setFocused] = useState([0, 0]);
  useModalFocus(true, root, onClose);
  const valid = isCompleteChart(typeChart);
  const types = valid ? typeChart.types : [];
  const describe = (attack, defense, multiplier) => t("{attack} → {defense}：{multiplier}×", {
    attack: typeName(attack), defense: typeName(defense), multiplier,
  });
  const move = (event, row, column) => {
    let nextRow = row, nextColumn = column;
    switch (event.key) {
      case "ArrowUp": nextRow--; break;
      case "ArrowDown": nextRow++; break;
      case "ArrowLeft": nextColumn--; break;
      case "ArrowRight": nextColumn++; break;
      case "Home": nextColumn = 0; if (event.ctrlKey) nextRow = 0; break;
      case "End": nextColumn = types.length - 1; if (event.ctrlKey) nextRow = types.length - 1; break;
      default: return;
    }
    event.preventDefault();
    nextRow = Math.max(0, Math.min(types.length - 1, nextRow));
    nextColumn = Math.max(0, Math.min(types.length - 1, nextColumn));
    root.current?.querySelector(`[data-row="${nextRow}"][data-column="${nextColumn}"]`)?.focus();
  };
  return <div className="type-query-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={root} className="type-query type-chart" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header className="type-query__heading">
        <h2 id={headingId}>{t("18 系克制图")}</h2>
        <button type="button" className="type-query__quiet" aria-label={t("关闭克制图")} onClick={onClose}><X size={22} /></button>
      </header>
      {valid ? <>
        <div className="type-chart__toolbar">
          <p id={axesId}>{t("行：攻击 · 列：防御")}</p>
          <div className="type-chart__legend">
            {[[2, "有效打击"], [1, "常规打击"], [0.5, "打击盲点"]].map(([value, label]) => <span key={value}><b className={`type-chart__value--${tone(value)}`}>{value}×</b>{t(label)}</span>)}
          </div>
        </div>
        <div className="type-chart__scroll">
          <table role="grid" aria-label={t("18 系克制图")} aria-describedby={axesId} className="type-chart__matrix">
            <colgroup><col className="type-chart__row-width" />{types.map((type) => <col key={type} />)}</colgroup>
            <thead><tr>
              <th className="type-chart__corner"><span>{t("防御")} →</span><span>{t("攻击")} ↓</span></th>
              {types.map((type, column) => <th key={type} scope="col" aria-label={typeName(type)} data-highlight={selected?.[1] === column || undefined}>
                <div className="type-chart__column-label"><ElementIcon type={type} size={20} /><span>{typeName(type)}</span></div>
              </th>)}
            </tr></thead>
            <tbody>{types.map((attack, row) => <tr key={attack}>
              <th scope="row" aria-label={typeName(attack)} data-highlight={selected?.[0] === row || undefined}><span className="type-chart__row-label"><ElementIcon type={attack} size={20} />{typeName(attack)}</span></th>
              {types.map((defense, column) => {
                const multiplier = getTypeMultiplier(attack, [defense], typeChart);
                const picked = selected?.[0] === row && selected?.[1] === column;
                return <td key={defense} role="gridcell" tabIndex={focused[0] === row && focused[1] === column ? 0 : -1}
                  data-row={row} data-column={column} data-attack={attack} data-defense={defense}
                  data-highlight={selected?.[0] === row || selected?.[1] === column || undefined}
                  aria-label={describe(attack, defense, multiplier)} aria-selected={picked}
                  className={`type-chart__cell type-chart__value--${tone(multiplier)}`}
                  onClick={(event) => event.currentTarget.focus()}
                  onFocus={() => { setFocused([row, column]); setSelected([row, column]); }}
                  onKeyDown={(event) => move(event, row, column)}>{multiplier}×</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        <footer className="type-chart__footer">
          <div role="status" className="type-chart__result">{selected
            ? describe(types[selected[0]], types[selected[1]], getTypeMultiplier(types[selected[0]], [types[selected[1]]], typeChart))
            : t("点选格子查看倍率")}</div>
          <p>{t("单属性相性，不含本系、特性或天气。")}</p>
        </footer>
      </> : <p className="type-query__empty" role="status">{t("国际服属性关系待核验，暂不可查询。")}</p>}
    </section>
  </div>;
}
