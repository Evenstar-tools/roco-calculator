import { useEffect, useEffectEvent } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// These dialogs replace their menu trigger on open. Restore the surviving menu
// button when the original trigger no longer exists.
export function useModalFocus(open, dialogRef, onClose) {
  const close = useEffectEvent(() => onClose?.());
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    const focusable = () => [...(dialog?.querySelectorAll(FOCUSABLE) ?? [])]
      .filter((node) => !node.closest("[hidden], [inert]") &&
        getComputedStyle(node).display !== "none" &&
        getComputedStyle(node).visibility !== "hidden");
    focusable()[0]?.focus();
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0], last = nodes.at(-1);
        if (!first) return;
        if (!dialog.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) {
        trigger.focus();
      } else {
        document.querySelector('[aria-label="打开菜单"]')?.focus();
      }
    };
  }, [open, dialogRef]);
}
