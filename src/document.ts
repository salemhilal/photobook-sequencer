import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { projectLoaded } from './persistence';
import { createPref } from './prefs';
import { buildProjectFile, confirmReplace, importProject, PROJECT_EXTENSION, ProjectFileError } from './project';
import { docStore } from './store';
import { endTour } from './tour';
import type { Doc } from './types';
import { ask, ui } from './ui';

/**
 * The Mac app's documents. The project is saved to a .photo-sequence file (the same
 * format the website exports), which is the lasting copy: double-clicking one in Finder
 * opens it here. Between saves, the working copy is kept in the app (as on the website),
 * so unsaved changes survive quitting; the window's title says when there are some.
 */

const FILTERS = [{ name: 'Photobook Sequencer project', extensions: [PROJECT_EXTENSION.slice(1)] }];

/** The open project's file, and the doc as it was last saved there (or opened from it). */
let path: string | null = null;
let saved: Doc | null = null;

/** Remembered across launches, since the working copy is too. */
const filePref = createPref<{ path: string; clean: boolean } | null>(
  'photobook-document',
  null,
  (raw) => {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v && 'path' in v && typeof v.path === 'string'
      ? { path: v.path, clean: 'clean' in v && v.clean === true }
      : undefined;
  },
  JSON.stringify,
);

/** Whether there's anything the file doesn't have. */
function edited(): boolean {
  if (saved) return docStore.doc !== saved;
  return Object.keys(docStore.doc.photos).length > 0 || docStore.getSnapshot().canUndo;
}

/** Whether the project is safe in its file, so replacing it loses nothing. */
export function isSaved(): boolean {
  return path !== null && !edited();
}

function name(p = path): string {
  const base = p?.split('/').pop() ?? 'Untitled';
  return base.endsWith(PROJECT_EXTENSION) ? base.slice(0, -PROJECT_EXTENSION.length) : base;
}

function remember(): void {
  filePref.save(path ? { path, clean: !edited() } : null);
}

let shownTitle = '';
function showState(): void {
  // During the tour, the sample project is showing; the user's file is untouched.
  const title = ui.get().tour !== null ? 'Photobook Sequencer' : `${name()}${edited() ? ' — Edited' : ''}`;
  if (title === shownTitle) return;
  shownTitle = title;
  void getCurrentWindow().setTitle(title);
  if (ui.get().tour === null) remember();
}

/** Forget the file (after starting a new project, or importing one without a known location). */
export function forgetFile(): void {
  path = null;
  saved = null;
  showState();
  remember();
}

/** Save to the project's file, or ask where if it has none. Resolves to whether it was saved. */
export async function save(): Promise<boolean> {
  if (!path) return saveAs();
  if (await writeTo(path)) return true;
  // The file may have moved, or (sandboxed) this launch may not have access to it yet.
  return saveAs();
}

export async function saveAs(): Promise<boolean> {
  const chosen = await saveDialog({ defaultPath: `${name()}${PROJECT_EXTENSION}`, filters: FILTERS });
  if (!chosen) return false;
  if (!(await writeTo(chosen))) {
    ui.set({ notice: `Couldn't save “${name(chosen)}”.` });
    return false;
  }
  return true;
}

async function writeTo(target: string): Promise<boolean> {
  if (ui.get().busy || ui.get().importing || ui.get().tour !== null) return false;
  const doc = docStore.doc;
  try {
    const file = await buildProjectFile('Saving');
    ui.set({ busy: 'Saving…' });
    await invoke('write_project', new Uint8Array(await file.arrayBuffer()), {
      headers: { path: encodeURIComponent(target) },
    });
  } catch {
    return false;
  } finally {
    ui.set({ busy: null });
  }
  path = target;
  // Changes made while saving aren't in the file.
  saved = doc;
  showState();
  remember();
  return true;
}

/** File → Open. */
export async function openWithDialog(): Promise<void> {
  const chosen = await openDialog({ multiple: false, directory: false, filters: FILTERS });
  if (typeof chosen === 'string') await openPath(chosen);
}

/** Open a project file (from File → Open, or Finder). */
export async function openPath(target: string): Promise<void> {
  if (ui.get().importing) return;
  // Opened from Finder mid-tour: the tour gives way.
  endTour();
  if (target === path && !edited()) return;
  const hasWork = Object.keys(docStore.doc.photos).length > 0;
  if (hasWork && !(await confirmReplace('Open another project?', `“${name(target)}”`, 'Open'))) return;
  try {
    const bytes = await invoke<ArrayBuffer>('read_project', { path: target });
    await importProject(new File([bytes], target.split('/').pop() ?? 'project'));
    // Undo shouldn't lead back into a different file's project.
    docStore.reset(docStore.doc);
    path = target;
    saved = docStore.doc;
    ui.set({ selection: [], editingSpreadId: null, modal: null });
    showState();
    remember();
  } catch (e) {
    ui.set({ notice: e instanceof ProjectFileError ? e.message : `Couldn't open “${name(target)}”.` });
  }
}

/** Before the window closes with changes the file doesn't have, offer to save them. */
async function confirmClose(): Promise<boolean> {
  if (!edited() || ui.get().tour !== null) return true;
  const choice = await ask({
    title: `Save changes to “${name()}”?`,
    message: "Unsaved changes are kept in the app for next time, but they're only safe once they're in a file.",
    actions: [
      { label: 'Don’t Save', value: 'discard' },
      { label: 'Cancel', value: 'cancel' },
      { label: 'Save', value: 'save', primary: true },
    ],
  });
  if (choice === 'save') return save();
  return choice === 'discard';
}

export async function startDocuments(): Promise<void> {
  await projectLoaded;
  const remembered = filePref.load();
  if (remembered) {
    path = remembered.path;
    saved = remembered.clean ? docStore.doc : null;
  }
  showState();
  docStore.subscribe(showState);
  ui.subscribe(showState);

  const win = getCurrentWindow();
  void win.onCloseRequested(async (e) => {
    e.preventDefault();
    if (await confirmClose()) await win.destroy();
  });

  // Files opened from Finder (or dropped on the Dock icon), including the one that launched the app.
  const takeOpened = async () => {
    const paths = await invoke<string[]>('take_opened_files');
    const last = paths.at(-1);
    if (last) await openPath(last);
  };
  await listen('opened-files', () => void takeOpened());
  await takeOpened();
}

/** Quit, after offering to save (the menu's Quit goes through closing the window). */
export function quit(): void {
  void getCurrentWindow().close();
}
