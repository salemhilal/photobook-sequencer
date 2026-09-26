/** Desk background color. A per-browser viewing preference (see prefs.ts), like the theme. */

export const DEFAULT_DESK = '#787876';

/** Darkest to lightest. */
export const DESK_PRESETS: { value: string; label: string }[] = [
  { value: '#121211', label: 'Black' },
  { value: '#3b3b3a', label: 'Dark gray' },
  { value: DEFAULT_DESK, label: 'Neutral gray' },
  { value: '#b3b3b0', label: 'Light gray' },
  { value: '#f4f3f0', label: 'White' },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: string): boolean {
  return HEX.test(v);
}

/** Relative luminance (WCAG) of a #rrggbb color. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Sets --desk, and whether text on the desk should be dark or light. */
export function applyDeskColor(color: string): void {
  const root = document.documentElement;
  root.style.setProperty('--desk', color);
  root.dataset.deskTone = luminance(color) > 0.3 ? 'light' : 'dark';
}
