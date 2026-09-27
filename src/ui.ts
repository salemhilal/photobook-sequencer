import { applyDeskColor } from './deskColor';
import { deskColorPref, sidebarOpenPref, sidebarWidthPref, themePref } from './prefs';
import { createStore } from './store';
import { applyTheme, type ThemePref } from './theme';

/**
 * UI state that isn't part of the document or its undo history: selection,
 * open panels, drag feedback, and per-browser preferences.
 */

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

export type ContextMenuState =
  { kind: 'desk'; x: number; y: number } | { kind: 'photo'; x: number; y: number; photoId: string };

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

export type Modal = 'settings' | 'about' | 'preview';

export interface UiState {
  selection: string[];
  editingSpreadId: string | null;
  /** The open full-window dialog, if any. (The spread editor is tracked by editingSpreadId.) */
  modal: Modal | null;
  view: DeskView;
  ghost: Ghost | null;
  /** The drop target under the pointer during a drag (see targetKey), for highlighting. */
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
  /** The saved project is from a newer version of the app; nothing is shown or saved until a reload. */
  outdated: boolean;
  /** A new version of the app has downloaded and is waiting for a reload. */
  updateReady: boolean;
  /** Another tab or window is the one editing the project; this one shows and saves nothing. */
  elsewhere: boolean;
  /** The last save failed (e.g. storage full); cleared by the next successful save. */
  saveFailed: boolean;
  /** Photos open in Quick Look, and which one is showing. */
  quickLook: { ids: string[]; index: number } | null;
  /** The product tour's current step, while it's running (see tour.ts). */
  tour: number | null;
}

export const ui = createStore<UiState>({
  selection: [],
  editingSpreadId: null,
  modal: null,
  view: { panX: 40, panY: 40, zoom: 1 },
  ghost: null,
  hoverKey: null,
  importing: null,
  busy: null,
  notice: null,
  hints: false,
  theme: themePref.load(),
  sidebarOpen: sidebarOpenPref.load(),
  sidebarWidth: sidebarWidthPref.load(),
  deskColor: deskColorPref.load(),
  contextMenu: null,
  confirm: null,
  outdated: false,
  updateReady: false,
  elsewhere: false,
  saveFailed: false,
  quickLook: null,
  tour: null,
});

export function openModal(modal: Modal): void {
  ui.set({ modal });
}

export function closeModal(): void {
  ui.set({ modal: null });
}

export function toggleModal(modal: Modal): void {
  ui.set((s) => ({ modal: s.modal === modal ? null : modal }));
}

/** Whether something covers the desk (a dialog, the spread editor, Quick Look, or the tour), pausing desk shortcuts. */
export function deskCovered(): boolean {
  const s = ui.get();
  return s.modal !== null || s.editingSpreadId !== null || s.quickLook !== null || s.tour !== null;
}

/** Show photos full-size, starting with the first. */
export function openQuickLook(ids: string[]): void {
  if (ids.length) ui.set({ quickLook: { ids, index: 0 }, contextMenu: null });
}

export function closeQuickLook(): void {
  ui.set({ quickLook: null });
}

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
export function openPhotoMenu(
  e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number },
  photoId: string,
): void {
  e.preventDefault();
  e.stopPropagation();
  ui.set({ contextMenu: { kind: 'photo', x: e.clientX, y: e.clientY, photoId } });
}

export function setTheme(theme: ThemePref): void {
  ui.set({ theme });
  applyTheme(theme);
  themePref.save(theme);
}

export function setDeskColor(color: string): void {
  ui.set({ deskColor: color });
  applyDeskColor(color);
  deskColorPref.save(color);
}

/** Set the sidebar width; `persist` saves it (at the end of a resize drag). */
export function setSidebarWidth(width: number, persist: boolean): void {
  ui.set({ sidebarWidth: width });
  if (persist) sidebarWidthPref.save(Math.round(width));
}

export function toggleSidebar(): void {
  const open = !ui.get().sidebarOpen;
  ui.set({ sidebarOpen: open });
  sidebarOpenPref.save(open);
}
