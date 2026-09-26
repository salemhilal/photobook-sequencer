import { useEffect, useState } from 'react';
import { deleteImage, imageIds, loadDoc, saveDoc } from './db';
import { forgetUrl } from './images';
import { migrateDoc, NewerProjectError, schemaVersionOf } from './schema';
import { requestPersistence } from './storage';
import { docStore, emptyDoc } from './store';
import { CURRENT_SCHEMA, type Doc } from './types';
import { ui } from './ui';

const SAVE_DELAY = 400;

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
      if (ui.get().outdated) return;
      if ((await saveUnlessNewer(docStore.doc)) === 'newer') return unsubscribe();
      await collectGarbage();
      keepStorage();
    };

    void loadDoc()
      .then((stored) => {
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
      })
      .catch(() => {
        if (cancelled) return;
        ui.set({ notice: "Couldn't open saved work. Changes won't be saved in this browser." });
        setLoaded(true);
      });

    // Best effort when leaving; the version check still applies.
    const flush = () => {
      if (timer !== undefined && !ui.get().outdated) void saveUnlessNewer(docStore.doc);
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
 * Skipped during imports, which store images before the document refers to them.
 */
async function collectGarbage(): Promise<void> {
  if (ui.get().importing) return;
  const live = new Set<string>();
  for (const d of docStore.allDocs()) for (const id of Object.keys(d.photos)) live.add(id);
  for (const id of await imageIds()) {
    if (!live.has(id) && !ui.get().importing) {
      await deleteImage(id);
      forgetUrl(id);
    }
  }
}
