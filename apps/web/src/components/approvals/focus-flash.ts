/**
 * Moves focus for the CEO (e.g. to the next approval after a decision) and briefly marks the target so sighted users
 * can see where focus went even after a mouse click, when `:focus-visible` doesn't apply. Pair with an outline style
 * keyed on `data-focus-flash` (FOCUS_FLASH_OUTLINE below).
 */
export function focusWithFlash(el: HTMLElement | null, durationMs = 2_000): void {
  if (!el) return;
  el.focus({ preventScroll: false });
  el.setAttribute("data-focus-flash", "");
  window.setTimeout(() => el.removeAttribute("data-focus-flash"), durationMs);
}

/** Outline showing where the app moved focus (fades ~2 s after `focusWithFlash`), plus the usual keyboard ring. */
export const FOCUS_FLASH_OUTLINE =
  "outline-2 outline-offset-4 outline-transparent transition-[outline-color] duration-500 motion-reduce:transition-none focus-visible:outline-accent data-[focus-flash]:outline-accent";

/** Same, drawn inside the element (for containers whose parent clips overflow). */
export const FOCUS_FLASH_INSET =
  "outline-2 -outline-offset-2 outline-transparent transition-[outline-color] duration-500 motion-reduce:transition-none focus-visible:outline-accent data-[focus-flash]:outline-accent";
