import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { createSpeedTargets } from "../features/team-ability/domain/speed-targets.js";

const profiles = [["neutral-zero", "无个体"], ["neutral-max", "满个体"], ["positive-max", "极速"]];

export default function SpeedDetail({ entry, snapshot, reference, onClose, onLocate }) {
  const close = useRef(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [entry.id]);
  const image = entry.spirit.asset?.localUrl ?? entry.spirit.imageUrl;
  return <section className="speed-detail" aria-label="速度配置详情">
    <header>{image ? <img src={image} alt="" /> : null}<span><strong>{entry.spirit.fullName}</strong><small>{entry.spirit.types?.join(" · ")} · 种族速度 {entry.spirit.raceStats.speed}</small></span><button ref={close} type="button" aria-label="收起速度详情" onClick={onClose}><X size={18} /></button></header>
    {entry.specialLabel ? <small>当前 {entry.speed} · {entry.specialLabel}</small> : null}
    <div className="speed-detail-options">{profiles.map(([profileId, label]) => {
      const target = createSpeedTargets({ profileId, spirits: [entry.spirit], spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter })[0];
      if (!target) return null;
      const delta = reference === null ? null : target.speed - reference;
      return <button key={profileId} type="button" aria-pressed={!entry.specialLabel && entry.profileId === profileId} aria-label={`${label} ${target.speed}，定位实速`} onClick={() => onLocate(profileId, target.speed)}>{label}<b>{target.speed}</b>{delta !== null ? <small>比 {reference} {delta === 0 ? "同速" : `${delta > 0 ? "快" : "慢"} ${Math.abs(delta)}`}</small> : null}</button>;
    })}</div>
    <small>标准速度 · 点击定位</small>
  </section>;
}
