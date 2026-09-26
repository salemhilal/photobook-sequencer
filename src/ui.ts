import { createStore } from './store';
import { applyDeskColor, loadDeskColor, saveDeskColor } from './deskColor';
import { loadTheme, type ThemePref } from './theme';
import type { PageSide } from './types';

export interface DeskView {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Ghost {
  photoId: string;
  count: number;
  clientX: number;
  clientY: number;
  w: number;
  h: number;
}

/** What the pointer is over during a drag, as resolved by `hitTest`. */
export type DropTarget =
  | { kind: 'page'; spreadId: string; side: PageSide }
  | { kind: 'desk' }
  | { kind: 'strip' }
  /** The gap before spread `index` in the sidebar: dropping there adds a spread. */
  | { kind: 'insert'; index: number }
  | null;

export type ContextMenuState =
  | { kind: 'desk'; x: number; y: number }
  | { kind: 'photo'; x: number; y: number; photoId: string };

export interface ConfirmAction {
  label: string;
  value: string;
  primary?: boolean;
}

/** An in-app confirmation; `resolve` gets the chosen action's value, or null if dismissed. */
export interface ConfirmRequest {
  title: string;
  message: string;
  actions: ConfirmAction[];
  resolve: (value: string | null) => void;
}

export interface UiState {
  selection: string[];
  editingSpreadId: string | null;
  previewOpen: boolean;
  settingsOpen: boolean;
  aboutOpen: boolean;
  view: DeskView;
  ghost: Ghost | null;
  /** `page:<spreadId>:<side>`, `desk`, or `strip` — for drop highlighting. */
  hoverKey: string | null;
  importing: { done: number; total: number } | null;
  /** Status text for long-running work like exporting. */
  busy: string | null;
  notice: string | null;
  /** True while the shortcut modifier is held, to reveal shortcut hints. */
  hints: boolean;
  theme: ThemePref;
  sidebarOpen: boolean;
  /** Preferred sidebar width in px (clamped to the window when shown). */
  sidebarWidth: number;
  deskColor: string;
  contextMenu: ContextMenuState | null;
  confirm: ConfirmRequest | null;
}

// Declared before the store below, which reads them while initializing.
const SIDEBAR_KEY = 'photobook-sidebar';
export const SIDEBAR_DEFAULT_WIDTH = 284;
export const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_WIDTH_KEY = 'photobook-sidebar-width';

export const ui = createStore<UiState>({
  selection: [],
  editingSpreadId: null,
  previewOpen: false,
  settingsOpen: false,
  aboutOpen: false,
  view: { panX: 40, panY: 40, zoom: 1 },
  ghost: null,
  hoverKey: null,
  importing: null,
  busy: null,
  notice: null,
  hints: false,
  theme: loadTheme(),
  sidebarOpen: loadSidebarOpen(),
  sidebarWidth: loadSidebarWidth(),
  deskColor: loadDeskColor(),
  contextMenu: null,
  confirm: null,
});

/** Ask the user to choose; resolves to the chosen action's value, or null if dismissed. */
export function ask(request: Omit<ConfirmRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    ui.get().confirm?.resolve(null);
    ui.set({
      confirm: {
        ...request,
        resolve: (value) => {
          ui.set({ confirm: null });
          resolve(value);
        },
      },
    });
  });
}

/** Right-click handler for a photo, wherever it's shown. */
export function openPhotoMenu(e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }, photoId: string): void {
  e.preventDefault();
  e.stopPropagation();
  ui.set({ contextMenu: { kind: 'photo', x: e.clientX, y: e.clientY, photoId } });
}

export function setDeskColor(color: string): void {
  ui.set({ deskColor: color });
  applyDeskColor(color);
  saveDeskColor(color);
}


function loadSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
  } catch {
    return true;
  }
}


function loadSidebarWidth(): number {
  try {
    const n = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(n) && n >= SIDEBAR_MIN_WIDTH) return n;
  } catch {
    // Fall through to the default.
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

/** Set the sidebar width; `persist` saves it (at the end of a resize drag). */
export function setSidebarWidth(width: number, persist: boolean): void {
  ui.set({ sidebarWidth: width });
  if (!persist) return;
  try {
    if (width === SIDEBAR_DEFAULT_WIDTH) localStorage.removeItem(SIDEBAR_WIDTH_KEY);
    else localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // Not persisted; still applies for this session.
  }
}

export function toggleSidebar(): void {
  const open = !ui.get().sidebarOpen;
  ui.set({ sidebarOpen: open });
  try {
    if (open) localStorage.removeItem(SIDEBAR_KEY);
    else localStorage.setItem(SIDEBAR_KEY, 'closed');
  } catch {
    // Not persisted; still applies for this session.
  }
}

/** Screen pixels per inch on the desk at zoom 1. */
export const DESK_PPI = 48;

export function targetKey(t: DropTarget): string | null {
  if (!t) return null;
  if (t.kind === 'page') return `page:${t.spreadId}:${t.side}`;
  if (t.kind === 'insert') return `insert:${t.index}`;
  return t.kind;
}

/** Resolve the drop target under a client point via `data-drop` attributes. */
export function hitTest(clientX: number, clientY: number): DropTarget {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof HTMLElement)) continue;
    const kind = el.dataset.drop;
    if (kind === 'page') {
      const spreadId = el.dataset.spread;
      const side = el.dataset.side;
      if (spreadId && (side === 'left' || side === 'right')) return { kind: 'page', spreadId, side };
    }
    if (kind === 'desk') return { kind: 'desk' };
    if (kind === 'strip') return { kind: 'strip' };
    if (kind === 'insert') {
      const index = Number(el.dataset.index);
      if (Number.isInteger(index)) return { kind: 'insert', index };
    }
    // A modal blocks targets beneath it.
    if (el.dataset.modal !== undefined) return null;
  }
  return null;
}

/** Converts client coordinates to desk inches; registered by the Desk component. */
export const deskGeometry = {
  toDesk: (clientX: number, clientY: number): { x: number; y: number } => ({ x: clientX, y: clientY }),
  /** Visible desk area in desk inches. */
  visible: (): { x: number; y: number; w: number; h: number } => ({ x: 0, y: 0, w: 20, h: 12 }),
};

export function isTyping(e: Event): boolean {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The platform's shortcut modifier: Cmd on macOS, Ctrl elsewhere. */
export function hasMod(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

export const MOD_LABEL = isMac ? '⌘' : 'Ctrl+';
