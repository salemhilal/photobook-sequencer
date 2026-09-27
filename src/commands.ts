import { useEffect } from 'react';
import { deleteFromProject, importPhotos } from './actions';
import { exportIndesign } from './indesign';
import { copyPhotos, duplicateAndSelect } from './clipboard';
import { savePdf } from './pdf';
import { hasMod, isMac, isTextField, isTyping, MOD_LABEL } from './platform';
import { newProject, openProjectFile, PROJECT_ACCEPT, saveProjectFile, saveProjectFileAs } from './project';
import { docStore } from './store';
import { startTour } from './tour';
import { deskCovered, openModal, toggleModal, toggleSidebar, ui } from './ui';

/**
 * Every keyboard shortcut in one table. Each command has its bindings, when it
 * applies, and what it does; the key handler, the hold-⌘ hints, and menus all read
 * from here, so adding a shortcut is one entry.
 *
 * (The spread editor, preview, and open menus handle their own keys while they're open.)
 */

interface Binding {
  /** `KeyboardEvent.key`, lowercased. */
  key: string;
  /** Requires the platform modifier (⌘ on macOS, Ctrl elsewhere). */
  mod?: boolean;
  /** `true` requires Shift, `false` (default) forbids it, `'any'` allows either. */
  shift?: boolean | 'any';
}

interface Command {
  bindings: Binding[];
  /**
   * Where it applies: `app` works anywhere (even over dialogs); `desk` only when no
   * dialog or spread editor covers the desk.
   */
  scope: 'app' | 'desk';
  /** Whether it also fires while typing in a text field (off by default). */
  inFields?: boolean;
  /**
   * `e` is the key event when run from a shortcut (absent from menus). Return false
   * to leave the key alone (e.g. nothing selected).
   */
  run: (e?: KeyboardEvent) => void | false;
  /** Overrides the label derived from the first binding. */
  label?: string;
}

/** Opens the system file picker; must be called from a user gesture. */
function pickFiles(accept: string, multiple: boolean, onPick: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (files.length) onPick(files);
  };
  input.click();
}

export function addPhotos(): void {
  if (ui.get().importing) return;
  pickFiles('image/*', true, (files) => void importPhotos(files));
}

export function importProject(): void {
  if (ui.get().importing) return;
  if (__NATIVE_APP__) return void import('./document').then((m) => m.openWithDialog());
  pickFiles(PROJECT_ACCEPT, false, ([file]) => file && void openProjectFile(file));
}

const NUDGE = 1 / 8;
const NUDGE_BIG = 1;

function nudgeSelection(e?: KeyboardEvent): void | false {
  const ids = new Set(ui.get().selection);
  if (!e || !ids.size) return false;
  const n = e.shiftKey ? NUDGE_BIG : NUDGE;
  const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
  const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
  docStore.apply(
    (d) => {
      for (const p of d.pile) {
        if (!ids.has(p.photoId)) continue;
        p.x += dx;
        p.y += dy;
      }
    },
    { coalesce: 'desk-nudge' },
  );
}

/** Runs `fn` with the desk selection, or leaves the key alone when nothing is selected. */
const withSelection = (fn: (ids: string[]) => void) => (): void | false => {
  const ids = ui.get().selection;
  if (!ids.length) return false;
  fn(ids);
};

export const commands = {
  // No shortcut: browsers reserve ⌘N / Ctrl+N for a new window.
  newProject: { bindings: [], scope: 'app', run: () => void newProject() },
  addPhotos: { bindings: [{ key: 'i', mod: true }], scope: 'app', inFields: true, run: addPhotos },
  importProject: { bindings: [{ key: 'o', mod: true }], scope: 'app', inFields: true, run: importProject },
  exportProject: {
    bindings: [{ key: 's', mod: true }],
    scope: 'app',
    inFields: true,
    run: () => void saveProjectFile(),
  },
  // Mac app only: the website exports instead of saving.
  saveAs: {
    bindings: __NATIVE_APP__ ? [{ key: 's', mod: true, shift: true }] : [],
    scope: 'app',
    inFields: true,
    run: () => void saveProjectFileAs(),
  },
  savePdf: {
    bindings: [{ key: 'p', mod: true, shift: true }],
    scope: 'app',
    inFields: true,
    run: () => void savePdf(),
  },
  exportIndesign: { bindings: [], scope: 'app', run: () => void exportIndesign() },
  preview: { bindings: [{ key: 'p', mod: true }], scope: 'app', inFields: true, run: () => toggleModal('preview') },
  settings: { bindings: [{ key: ',', mod: true }], scope: 'app', inFields: true, run: () => toggleModal('settings') },
  toggleSidebar: { bindings: [{ key: 'b', mod: true }], scope: 'app', inFields: true, run: toggleSidebar },
  undo: { bindings: [{ key: 'z', mod: true }], scope: 'app', run: () => docStore.undo() },
  redo: {
    bindings: [
      { key: 'z', mod: true, shift: true },
      { key: 'y', mod: true },
    ],
    scope: 'app',
    label: isMac ? '⇧⌘Z' : 'Ctrl+Y',
    run: () => docStore.redo(),
  },
  selectAll: {
    bindings: [{ key: 'a', mod: true }],
    scope: 'desk',
    run: () => ui.set({ selection: docStore.doc.pile.map((p) => p.photoId) }),
  },
  copy: {
    bindings: [{ key: 'c', mod: true }],
    scope: 'desk',
    // A failed system-clipboard write still leaves the photos pasteable inside the app.
    run: withSelection((ids) => void copyPhotos(ids).catch(() => {})),
  },
  duplicate: {
    bindings: [{ key: 'd', mod: true }],
    scope: 'desk',
    run: withSelection((ids) => void duplicateAndSelect(ids)),
  },
  deleteSelection: {
    bindings: [{ key: 'delete' }, { key: 'backspace' }],
    scope: 'desk',
    run: withSelection((ids) => deleteFromProject(ids)),
  },
  clearSelection: { bindings: [{ key: 'escape' }], scope: 'desk', run: () => ui.set({ selection: [] }) },
  nudge: {
    bindings: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].map((key) => ({ key, shift: 'any' as const })),
    scope: 'desk',
    run: nudgeSelection,
  },
  about: { bindings: [], scope: 'app', run: () => openModal('about') },
  tour: { bindings: [], scope: 'app', run: startTour },
} satisfies Record<string, Command>;

export type CommandId = keyof typeof commands;

/** Run a command from a menu or button. */
export function runCommand(id: CommandId): void {
  (commands[id] as Command).run();
}

/**
 * Run a command chosen from the Mac app's menu bar. Shortcuts reach the page first, so
 * this runs for clicks, and for shortcuts the page left alone: those typed in a text
 * field, which get the field's own editing (e.g. its undo) instead. Returns whether it ran.
 */
export function runFromMenu(id: CommandId, textFallback?: () => void): boolean {
  const c: Command = commands[id];
  if (isTextField(document.activeElement) && !c.inFields) {
    textFallback?.();
    return false;
  }
  if (c.scope === 'desk' && deskCovered()) return false;
  c.run();
  return true;
}

/** The shortcut as a native menu accelerator, e.g. "CmdOrCtrl+Shift+P"; none for plain keys like Delete. */
export function shortcutAccelerator(id: CommandId): string | undefined {
  const b = (commands[id] as Command).bindings[0];
  // Menus would take plain keys (Delete, Escape, arrows) away from text fields.
  if (!b?.mod) return undefined;
  return ['CmdOrCtrl', b.shift === true && 'Shift', b.key.length === 1 ? b.key.toUpperCase() : b.key]
    .filter(Boolean)
    .join('+');
}

function matches(b: Binding, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== b.key || e.altKey) return false;
  if (hasMod(e) !== Boolean(b.mod)) return false;
  return b.shift === 'any' || e.shiftKey === Boolean(b.shift);
}

/** The shortcut's label for display, e.g. "⌘O" or "Ctrl+Shift+P"; empty if it has none. */
export function shortcutLabel(id: CommandId): string {
  const c: Command = commands[id];
  if (c.label) return c.label;
  const b = c.bindings[0];
  if (!b) return '';
  const key = b.key.length === 1 ? b.key.toUpperCase() : b.key;
  if (!b.mod) return key;
  if (isMac) return `${b.shift === true ? '⇧' : ''}⌘${key}`;
  return `${MOD_LABEL}${b.shift === true ? 'Shift+' : ''}${key}`;
}

/** How long the modifier must be held before shortcut hints appear. */
const HINT_DELAY = 250;

/** Handles every command's shortcut, and shows hints while the modifier is held. */
export function useCommandShortcuts(): void {
  useEffect(() => {
    const modKey = isMac ? 'Meta' : 'Control';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hideHints = () => {
      clearTimeout(timer);
      if (ui.get().hints) ui.set({ hints: false });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === modKey) {
        if (!e.repeat) {
          clearTimeout(timer);
          timer = setTimeout(() => ui.set({ hints: true }), HINT_DELAY);
        }
        return;
      }
      hideHints();
      if (e.defaultPrevented) return;
      for (const c of Object.values(commands) as Command[]) {
        if (!c.bindings.some((b) => matches(b, e))) continue;
        if (isTyping(e) && !c.inFields) return;
        if (c.scope === 'desk' && deskCovered()) return;
        if (c.run(e) !== false) e.preventDefault();
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === modKey) hideHints();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', hideHints);
    return () => {
      hideHints();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', hideHints);
    };
  }, []);
}
