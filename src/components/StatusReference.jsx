import { BookOpen, Question, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MARK_DEFINITIONS } from "../domain/marks.js";
import { ElementIcon } from "./ElementIcon.jsx";

const groups = { status: "持续异常", negative: "负面印记", positive: "正面印记" };
const statuses = [
  { id: "burn", name: "灼烧", type: "火", summary: "每层造成生命基数 2% 的火系伤害。", note: "生命基数取最大生命，上限 1000；受克制影响，火系免疫。通常结算后层数减半向下取整。" },
  { id: "freeze", name: "冻结", type: "冰", summary: "每层冻结 5% 最大生命。", note: "剩余生命不高于冻结阈值时判定击倒，不直接扣除这部分生命；冰系免疫。" },
  { id: "parasitism", name: "寄生", type: "草", summary: "每层造成最大生命 2% 的伤害，并回复进攻方生命。", note: "草系免疫，不受克制影响；回复不超过进攻方缺失生命。" },
  { id: "poison", name: "中毒", type: "毒", summary: "每层造成最大生命 3% 的毒系伤害。", note: "受克制影响；毒系、机械系免疫。与中毒印记不是同一项。" },
  { id: "electrified", name: "引电", type: "电", summary: "每凑齐 2 层，触发一次最大生命 25% 的电系伤害。", note: "受克制影响，电系免疫；触发后消耗对应层数。" },
];
const markScope = {
  slow: ["翼", "速度计算"],
  starfall: ["幻", "条件触发"],
  momentum: ["普通", "威力计算"],
  attack: ["武", "威力计算"],
  tailwind: ["翼", "条件触发"],
  charge: ["电", "条件触发"],
  reassembly: ["幻", "条件触发", "攻击技能触发；1～2 层为 100% 幻系伤害，3 层及以上为 300%。"],
  "dragon-bite": ["龙", "手动配置", "请在能力配置中填写，不会自动叠加能力等级。"],
  poison: ["毒"], thorn: ["地"], "spirit-drop": ["幽"],
  wet: ["水"], photosynthesis: ["草"], sprout: ["草"], undertow: ["水"],
};

export function StatusHelpButton({ label, onClick }) {
  return <button type="button" className="status-help" aria-label={label} title={label} aria-haspopup="dialog" onClick={onClick}>
    <Question size={16} aria-hidden="true" />
  </button>;
}

export function StatusReference({ initialGroup, onClose }) {
  const [group, setGroup] = useState(initialGroup);
  const [search, setSearch] = useState("");
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const rows = group === "status" ? statuses : MARK_DEFINITIONS[group];
  return createPortal(<dialog ref={dialogRef} className="status-reference" aria-label="异常与印记" onCancel={onClose}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll("button, input")];
      const boundary = event.shiftKey ? controls[0] : controls.at(-1);
      if (document.activeElement === boundary) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0]).focus();
      }
    }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="status-reference__body">
      <header><div><h2><BookOpen size={22} aria-hidden="true" />异常与印记</h2><p>查规则，不改变当前配置</p></div>
        <button type="button" aria-label="关闭说明" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <nav aria-label="说明分组">{Object.entries(groups).map(([key, name]) => <button key={key} type="button" aria-pressed={group === key}
        onClick={() => { setGroup(key); setSearch(""); if (listRef.current) listRef.current.scrollTop = 0; }}>{name}</button>)}</nav>
      <div className="status-reference__list" ref={listRef}>
        <input type="search" aria-label={`搜索${groups[group]}`} placeholder="搜索名称" value={search} onChange={event => setSearch(event.target.value)} />
        {rows.filter(row => row.name.includes(search.trim())).map(row => {
          const [type, scope = "仅作说明", note] = group === "status" ? [row.type, "异常结算", row.note] : markScope[row.id] ?? [];
          return <article key={row.id}><ElementIcon type={type} size={28} /><div><div className="status-reference__name"><strong>{row.name}{group === "negative" && row.id === "poison" ? "印记" : ""}</strong>
            <span data-reference-only={scope === "仅作说明" || scope === "手动配置"}>{scope}</span></div><p>{row.summary}</p>{note && <small>{note}</small>}</div></article>;
        })}
        {!rows.some(row => row.name.includes(search.trim())) && <p role="status">未找到对应条目</p>}
      </div>
      <footer>{group === "status" ? "开启异常结算后，按所选技能与配置层数计算；不自动模拟完整对局。" : "标签说明计算范围，不代表当前已生效；未模拟入场、能量及全部回合事件。"}</footer>
    </div>
  </dialog>, document.body);
}
