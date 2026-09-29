import { useLayoutEffect, useRef } from "react";
import { SkillIcon } from "../../components/SkillIcon.jsx";

// Presentation only: play the engine's trace, never advance or settle a round here.
export default function TransmissionMotion({ playback, boardRef, onComplete }) {
  const cards = useRef([]);
  const progress = useRef(null);
  useLayoutEffect(() => {
    let cancelled = false;
    let animations = [];
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const board = boardRef.current;
    const bounds = board.getBoundingClientRect();
    const anchors = [...board.querySelectorAll(":scope > li")].map((cell) => {
      const rect = cell.getBoundingClientRect();
      return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
    });
    const stop = () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
      onComplete(playback);
    };
    if (media?.matches || !cards.current[0]?.animate || !anchors[0]?.height) {
      onComplete(playback);
      return undefined;
    }
    const transform = (index) => `translate(${anchors[index].x}px, ${anchors[index].y}px)`;
    cards.current.forEach((card, index) => {
      Object.assign(card.style, { width: `${anchors[index].width}px`, height: `${anchors[index].height}px`, transform: transform(index) });
    });
    async function play() {
      let positions = [0, 1, 2, 3];
      try {
        for (const [frame, step] of playback.steps.entries()) {
          if (cancelled) return;
          const nextPositions = positions.map((_, key) => step.keys.indexOf(key));
          progress.current.textContent = `${playback.label} · ${frame + 1}/${playback.steps.length}`;
          animations = cards.current.flatMap((card, key) => {
            const from = positions[key], to = nextPositions[key];
            card.dataset.moving = String(from !== to);
            if (from === to) return [];
            return [card.animate([
              { transform: transform(from) },
              { transform: transform(to) },
            ], { duration: 420, easing: "cubic-bezier(.22,.7,.25,1)", fill: "forwards" })];
          });
          await Promise.all(animations.map((animation) => animation.finished));
          if (cancelled) return;
          cards.current.forEach((card, key) => {
            card.style.transform = transform(nextPositions[key]);
            card.querySelector(".transmission-slot-number").textContent = `${nextPositions[key] + 1} 号位`;
          });
          animations.forEach((animation) => animation.cancel());
          positions = nextPositions;
        }
      } catch {
        // Cancellation or an unsupported animation falls back to the authoritative final state.
      }
      if (!cancelled) onComplete(playback);
    }
    media?.addEventListener?.("change", stop);
    window.addEventListener("resize", stop);
    void play();
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
      media?.removeEventListener?.("change", stop);
      window.removeEventListener("resize", stop);
    };
  }, [playback, boardRef, onComplete]);

  return <>
    <ol className="transmission-motion-layer" aria-hidden="true">
      {playback.before.map((skill, key) => <li key={key} ref={(node) => { cards.current[key] = node; }} data-instance={key}>
        <SkillIcon skill={skill} size={32} />
        <div><span className="transmission-slot-number">{key + 1} 号位</span><strong>{skill.name}</strong></div>
      </li>)}
    </ol>
    <span className="transmission-motion-progress" ref={progress} aria-hidden="true" />
  </>;
}
