/** Light/dark preference. Stored per browser, not in the project. */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'photobook-theme';

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return 'system';
}

export function saveTheme(t: ThemePref): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
}

/** `system` removes the override so CSS follows prefers-color-scheme. */
export function applyTheme(t: ThemePref): void {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
}
