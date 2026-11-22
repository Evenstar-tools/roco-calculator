import { createPortal } from "react-dom";
import { SkillIcon } from "./SkillIcon.jsx";

export function SkillSlotSwapPreview({ skill, name, previewRef }) {
  if (!skill) return null;
  return createPortal(
    <div aria-hidden="true" className="skill-slot-swap-preview" ref={previewRef}>
      <SkillIcon skill={skill} size={28} />
      <strong>{name}</strong>
    </div>,
    document.body,
  );
}
