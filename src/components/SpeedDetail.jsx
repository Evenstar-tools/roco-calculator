import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { createSpeedTargets, SPEED_TARGET_PROFILES } from "../features/team-ability/domain/speed-targets.js";

const profiles = ["negative-zero", "neutral-zero", "positive-zero", "neutral-max", "positive-max"];

export default function SpeedDetail({ entry, snapshot, reference, onClose, onLocate }) {
  const { typeName, t } = useLocale();
  const close = useRef(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [entry.id]);
  const image = entry.spirit.asset?.localUrl ?? entry.spirit.imageUrl;
  return <section className="speed-detail" aria-label={t("速度配置详情")}>
    <header>{image ? <img src={image} alt="" /> : null}<span><strong>{t(entry.name ?? entry.spirit.fullName)}</strong><small>{entry.spirit.types?.map(typeName).join(" · ")}{" "}{t("· 种族速度")}{" "}{entry.spirit.raceStats.speed}</small></span><button ref={close} type="button" aria-label={t("收起速度详情")} onClick={onClose}><X size={18} /></button></header>
    {entry.specialLabel ? <small>{t("当前")}{" "}{entry.speed} · {t(entry.specialLabel)}</small> : null}
    <div className="speed-detail-options">{profiles.map(profileId => {
      const label = SPEED_TARGET_PROFILES[profileId].label;
      const target = createSpeedTargets({ profileId, spirits: [entry.spirit], spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter }).find(target => target.level === (entry.level ?? 60));
      if (!target) return null;
      const delta = reference === null ? null : target.speed - reference;
      return <button key={profileId} type="button" aria-pressed={!entry.specialLabel && entry.profileId === profileId} aria-label={t("{v0} {v1}，定位实速", { v0: label, v1: target.speed })} onClick={() => onLocate(profileId, target.speed)}>{t(label)}<b>{target.speed}</b>{delta !== null ? <small>{t("比")}{" "}{reference} {delta === 0 ? t("同速") : `${delta > 0 ? "快" : "慢"} ${Math.abs(delta)}`}</small> : null}</button>;
    })}</div>
    <small>{t("标准速度 · 点击定位")}</small>
  </section>;
}
