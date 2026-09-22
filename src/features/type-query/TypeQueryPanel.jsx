import { Check, Info, Plus, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { ELEMENT_TYPES } from "../../domain/type-chart.js";
import { buildTypeQuery, findFinalDualTypeSpirits, toggleQueryType } from "./model.js";
import "./type-query.css";

const DEFENSE_GROUPS = [[3, "双重弱点"], [2, "弱点"], [0.5, "抗性"], [0.25, "双重抗性"]];
const OFFENSE_GROUPS = [[2, "有效打击"], [1, "常规打击"], [0.5, "打击盲点"]];
const multiplierText = (value) => `${value}×`;

function ResultGroup({ rows, multiplier, label, side, onInspect, inspected }) {
  const entries = rows.filter((row) => row.multiplier === multiplier);
  const favorable = side === "defense" ? multiplier < 1 : multiplier > 1;
  const tone = multiplier === 1 ? "neutral" : favorable ? "good" : "danger";
  return <div className={`type-query__group type-query__group--${tone}`} role="group" aria-label={`${label} ${multiplierText(multiplier)}`}>
    <div className="type-query__multiplier"><b>{multiplierText(multiplier)}</b><span>{label}</span></div>
    <div className="type-query__chips">
      {entries.length ? entries.map((row) => <ResultChip key={row.type} {...{ row, side, onInspect, inspected }} />) : <span className="type-query__none">无</span>}
    </div>
  </div>;
}

function ResultChip({ row, side, onInspect, inspected }) {
  return <button type="button" className="type-query__chip" aria-label={`查看${side === "defense" ? "防守" : "进攻"}${row.type}倍率来源`}
    aria-pressed={inspected?.side === side && inspected?.type === row.type}
    onClick={() => onInspect({ side, type: row.type })}>
    <ElementIcon type={row.type} size={18} />{row.type}
  </button>;
}

function explainRow(row, side, types) {
  if (side === "offense") return [`攻击${row.type}系目标：最佳打击 ${row.multiplier} 倍。`, row.parts.map((part) => `${part.type}系攻击：${part.multiplier} 倍`).join("；") + "。", "分别使用所选属性攻击，取较高倍率，不相乘。"];
  const raw = row.parts.reduce((value, part) => value * part.multiplier, 1);
  return [`${row.type}系攻击${types.join("＋")}系防守：承受 ${row.multiplier} 倍伤害。`, row.parts.map((part) => `${row.type}打${part.type}：${part.multiplier} 倍`).join("；") + "。", raw >= 4 ? "两项均克制，按游戏规则双重弱点为 3 倍，不是 4 倍。" : types.length === 2 ? "双属性防守按两项倍率相乘计算。" : "单属性防守，直接使用对应倍率。"];
}

function SpiritResults({ spirits, types, spiritFilterRevision }) {
  const matches = findFinalDualTypeSpirits(spirits, types, { spiritFilterRevision });
  return <section className="type-query__spirits" aria-label="对应属性精灵">
    <div className="type-query__spirits-heading"><div><h3>对应属性精灵</h3><p>{types.join(" ＋ ")} · 仅展示每条进化链的最终形态</p></div><span>{matches.length} 个结果</span></div>
    {matches.length ? <div className="type-query__spirit-list" role="list">{matches.map((spirit) => <article className="type-query__spirit-card" key={spirit.id} role="listitem">
      <img src={`${import.meta.env.BASE_URL}assets/spirits/${spirit.id}.png`} alt="" loading="lazy" />
      <div><strong>{spirit.fullName}</strong><span>{spirit.types.join(" · ")} · {spirit.stage}</span></div>
    </article>)}</div> : <p className="type-query__spirits-empty">当前没有匹配的双属性最终形态。</p>}
  </section>;
}

export default function TypeQueryPanel({ typeChart, spirits = [], spiritFilterRevision, selectedTypes, onTypesChange, onClose }) {
  const root = useRef(null);
  const [inspected, setInspected] = useState(null);
  const query = useMemo(() => buildTypeQuery(selectedTypes, typeChart), [selectedTypes, typeChart]);
  const inspectedRow = inspected && query[inspected.side].find((row) => row.type === inspected.type);
  const neutral = query.defense.filter(({ multiplier }) => multiplier === 1);
  const chooseType = (type) => {
    setInspected(null);
    onTypesChange(toggleQueryType(query.types, type));
  };

  useEffect(() => {
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current.focus();
    return () => {
      document.body.style.overflow = overflow;
      const target = trigger?.isConnected && trigger !== document.body ? trigger : document.querySelector('button[aria-label="打开菜单"]');
      target?.focus();
    };
  }, []);

  useEffect(() => {
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab") return;
      const controls = [...root.current.querySelectorAll('button:not(:disabled),summary')]
        .filter((element) => element.getClientRects().length);
      if (!controls.length) { event.preventDefault(); root.current.focus(); return; }
      const first = controls[0], last = controls.at(-1);
      if (!root.current.contains(document.activeElement) || document.activeElement === root.current) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [onClose]);

  return <div className="type-query-backdrop">
    <section className="type-query" role="dialog" aria-modal="true" aria-label="属性查询" ref={root} tabIndex={-1}>
      <header className="type-query__heading"><h2>属性查询</h2><button type="button" className="type-query__quiet" aria-label="关闭属性查询" onClick={onClose}>关闭 <X size={16} /></button></header>
      <div className="type-query__body">
        <section className="type-query__selection">
          <div className="type-query__label"><strong>选择属性</strong><span id="type-query-limit">{query.types.length === 2 ? "已选 2 / 2 · 取消一项后更换" : "最多选择 2 种 · 再点一次取消"}</span></div>
          <div className="type-query__rail" role="group" aria-label="选择属性" aria-describedby="type-query-limit">
            {ELEMENT_TYPES.map((type) => <button type="button" key={type} className="type-query__type" aria-label={type}
              aria-pressed={query.types.includes(type)} disabled={query.types.length === 2 && !query.types.includes(type)} onClick={() => chooseType(type)}>
              <ElementIcon type={type} size={25} /><span>{type}</span>{query.types.includes(type) && <Check className="type-query__check" size={12} aria-hidden="true" />}
            </button>)}
          </div>
          <div className="type-query__picked"><span>已选</span>
            {query.types.length ? query.types.map((type, index) => <span className="type-query__picked-item" key={type}>
              {index > 0 && <Plus size={12} aria-hidden="true" />}<button type="button" className="type-query__chip type-query__chip--picked" aria-label={`取消${type}`} onClick={() => chooseType(type)}><ElementIcon type={type} size={18} />{type}</button>
            </span>) : <span>请选择一种或两种属性</span>}
            <button type="button" className="type-query__quiet" disabled={!query.types.length} onClick={() => { setInspected(null); onTypesChange([]); }}>清空</button>
          </div>
        </section>
        {!query.types.length ? <p className="type-query__empty" role="status">点击上方属性，即时查看抗性和打击面</p> : <>
          <div className="type-query__columns">
            <section className="type-query__column" aria-label="防守抗性"><h3>防守抗性</h3><p>{query.types.join(" / ")}作为防御属性 · 优先看弱点</p>
              {DEFENSE_GROUPS.map(([multiplier, label]) => <ResultGroup key={multiplier} rows={query.defense} side="defense" {...{ multiplier, label, inspected }} onInspect={setInspected} />)}
              {query.defense.some(({ multiplier }) => multiplier === 0) && <ResultGroup rows={query.defense} side="defense" multiplier={0} label="免疫" inspected={inspected} onInspect={setInspected} />}
              <details className="type-query__neutral"><summary>常规承伤 1× · {neutral.length} 种属性</summary><div className="type-query__chips">{neutral.map((row) => <ResultChip key={row.type} row={row} side="defense" inspected={inspected} onInspect={setInspected} />)}</div></details>
            </section>
            <section className="type-query__column type-query__column--attack" aria-label="进攻打击面"><h3>进攻打击面</h3><p>针对 18 种单属性 · {query.types.length === 2 ? "两系取较优倍率" : "按所选属性计算"}</p>
              {OFFENSE_GROUPS.map(([multiplier, label]) => <ResultGroup key={multiplier} rows={query.offense} side="offense" {...{ multiplier, label, inspected }} onInspect={setInspected} />)}
              {query.offense.some(({ multiplier }) => multiplier === 0) && <ResultGroup rows={query.offense} side="offense" multiplier={0} label="无法打击" inspected={inspected} onInspect={setInspected} />}
              <div className="type-query__neutral">双系攻击分别计算，不把两个技能当作一招叠乘。</div>
            </section>
          </div>
          {inspectedRow && <div className="type-query__explanation" role="status"><strong>倍率来源</strong><div>{explainRow(inspectedRow, inspected.side, query.types).map((line) => <span key={line}>{line}</span>)}</div></div>}
          {query.types.length === 2 && <SpiritResults spirits={spirits} types={query.types} spiritFilterRevision={spiritFilterRevision} />}
        </>}
        <footer className="type-query__note"><Info size={16} aria-hidden="true" /><span>仅查属性关系，不计技能威力、本系加成、特性、天气与血脉。打击面默认针对 18 种单属性，不代表实际精灵伤害。</span></footer>
      </div>
    </section>
  </div>;
}
