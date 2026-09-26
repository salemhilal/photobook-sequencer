import { useEffect, useState } from 'react';
import { deleteImage, imageIds, loadDoc, saveDoc } from './db';
import { forgetUrl } from './images';
import { docStore, emptyDoc, migrateDoc } from './store';
import { ui } from './ui';

const SAVE_DELAY = 400;

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
      await saveDoc(docStore.doc);
      await collectGarbage();
    };

    void loadDoc()
      .then((stored) => {
        if (cancelled) return;
        docStore.reset(stored ? migrateDoc(stored) : emptyDoc());
        setLoaded(true);
        void collectGarbage();
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

    const flush = () => void saveDoc(docStore.doc);
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
