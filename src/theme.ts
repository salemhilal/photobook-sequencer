/** Light/dark preference. Stored per browser (see prefs.ts), not in the project. */
export type ThemePref = 'system' | 'light' | 'dark';

/** `system` removes the override so CSS follows prefers-color-scheme. */
export function applyTheme(t: ThemePref): void {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
}
