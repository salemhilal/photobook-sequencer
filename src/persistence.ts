import { useEffect, useState } from 'react';
import { deleteImage, imageIds, loadDoc, saveDoc } from './db';
import { forgetUrl } from './images';
import { migrateDoc, NewerProjectError, schemaVersionOf } from './schema';
import { requestPersistence } from './storage';
import { docStore, emptyDoc } from './store';
import { claimEditor } from './tabLock';
import { CURRENT_SCHEMA, type Doc } from './types';
import { ui } from './ui';

const SAVE_DELAY = 400;

/**
 * Whether this tab may write to storage: it's the editing tab, its code isn't outdated,
 * and it's showing the user's project (not the tour's sample one).
 */
function maySave(): boolean {
  const s = ui.get();
  return !s.outdated && !s.elsewhere && s.tour === null;
}

/**
 * Save the project unless the stored one was saved by a newer version of the app
 * (say, in another tab after a deploy). Overwriting it would lose data this code
 * doesn't understand, so this tab stops instead and asks for a reload.
 */
export async function saveUnlessNewer(doc: Doc): Promise<'saved' | 'newer'> {
  const stored = await loadDoc();
  if (stored && schemaVersionOf(stored) > CURRENT_SCHEMA) {
    ui.set({ outdated: true });
    return 'newer';
  }
  await saveDoc(doc);
  return 'saved';
}

/**
 * Save now, reporting failures (e.g. storage full) so work isn't silently lost.
 * The warning clears on the next successful save.
 */
export async function saveProject(): Promise<'saved' | 'newer' | 'skipped' | 'failed'> {
  if (!maySave()) return 'skipped';
  try {
    const result = await saveUnlessNewer(docStore.doc);
    if (ui.get().saveFailed) ui.set({ saveFailed: false });
    return result;
  } catch {
    ui.set({ saveFailed: true });
    return 'failed';
  }
}

/**
 * Loads the saved project on startup, then saves it (debounced) whenever it changes,
 * cleaning up stored images nothing refers to anymore. Returns whether loading is done.
 */
export function usePersistence(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};

    const save = async () => {
      const result = await saveProject();
      if (result === 'newer') return unsubscribe();
      if (result === 'saved') {
        await collectGarbage();
        keepStorage();
      }
    };

    const start = async () => {
      if (!(await claimEditor(() => ui.set({ elsewhere: true })))) {
        ui.set({ elsewhere: true });
        return;
      }
      const stored = await loadDoc();
      if (cancelled) return;
      try {
        docStore.reset(stored ? migrateDoc(stored) : emptyDoc());
      } catch (e) {
        if (e instanceof NewerProjectError) return ui.set({ outdated: true });
        throw e;
      }
      setLoaded(true);
      void collectGarbage();
      keepStorage();
      let last = docStore.doc;
      unsubscribe = docStore.subscribe(() => {
        if (docStore.doc === last) return;
        last = docStore.doc;
        clearTimeout(timer);
        timer = setTimeout(() => void save(), SAVE_DELAY);
      });
    };

    start().catch(() => {
      if (cancelled) return;
      ui.set({ notice: "Couldn't open saved work. Changes won't be saved in this browser." });
      setLoaded(true);
    });

    // Best effort when leaving; the same checks apply.
    const flush = () => {
      if (timer !== undefined) void saveProject();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return loaded;
}

let askedToKeep = false;

/** Once the project has photos, ask (once per session) for the browser not to clear storage. */
function keepStorage(): void {
  if (askedToKeep || !Object.keys(docStore.doc.photos).length) return;
  askedToKeep = true;
  void requestPersistence();
}

/**
 * Delete stored images no longer reachable from the document or its undo history.
 * Skipped during imports, which store images before the document refers to them,
 * and in a tab that isn't the one editing.
 */
async function collectGarbage(): Promise<void> {
  if (ui.get().importing || !maySave()) return;
  const live = new Set<string>();
  for (const d of docStore.allDocs()) for (const id of Object.keys(d.photos)) live.add(id);
  for (const id of await imageIds()) {
    if (!live.has(id) && !ui.get().importing && maySave()) {
      await deleteImage(id);
      forgetUrl(id);
    }
  }
}
