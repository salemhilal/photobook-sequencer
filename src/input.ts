/** Keyboard and input helpers. */

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The platform's shortcut modifier: Cmd on macOS, Ctrl elsewhere. */
export function hasMod(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

export const MOD_LABEL = isMac ? '⌘' : 'Ctrl+';

/** Whether a key event is aimed at a text field (so app shortcuts should stay out of the way). */
export function isTyping(e: Event): boolean {
  return isTextField(e.target);
}

export function isTextField(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}
