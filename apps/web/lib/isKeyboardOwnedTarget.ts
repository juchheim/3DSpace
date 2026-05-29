"use client";

const SHARED_BROWSER_KEYBOARD_OWNERSHIP_SELECTOR = [
  ".shared-browser-viewport__embed--input-layer",
  "[aria-label='Shared browser event overlay']"
].join(", ");

export function isKeyboardOwnedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    const nonTextTypes = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "hidden", "image"]);
    if (!nonTextTypes.has(type)) return true;
  }
  return Boolean(target.closest(SHARED_BROWSER_KEYBOARD_OWNERSHIP_SELECTOR));
}
