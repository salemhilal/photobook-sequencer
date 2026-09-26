import { duplicatePhotos } from './actions';
import { photoAsPng } from './images';
import { docStore, newId } from './store';
import { ui } from './ui';

/**
 * Copying photos inside the app. ⌘C remembers which photos were copied and also
 * puts the first one on the system clipboard as an image (for pasting elsewhere),
 * alongside a text marker. When ⌘V finds that marker, pasting duplicates the
 * copied photos — the same as Duplicate. If something else was copied since, the
 * marker is gone and a pasted image is imported instead.
 */
const MARKER = 'photobook-sequencer:';
const PASTE_STEP = 0.25;

let copied: { ids: string[]; token: string; pastes: number; systemFailed: boolean } | null = null;

export function copyPhotos(ids: string[]): Promise<void> {
  const first = ids[0];
  if (!first) return Promise.resolve();
  const entry = { ids, token: newId(), pastes: 0, systemFailed: false };
  copied = entry;
  // The clipboard write must start inside the user's gesture, so it isn't awaited first.
  return navigator.clipboard
    .write([
      new ClipboardItem({
        'image/png': photoAsPng(first),
        'text/plain': new Blob([MARKER + entry.token], { type: 'text/plain' }),
      }),
    ])
    .catch((err: unknown) => {
      // Pasting inside the app still works without the system clipboard.
      entry.systemFailed = true;
      throw err;
    });
}

/**
 * Whether a paste should duplicate the photos copied in the app: the clipboard
 * still holds our marker, or (if writing to the system clipboard failed) holds nothing newer.
 */
export function isInternalPaste(data: DataTransfer | null): boolean {
  if (!copied) return false;
  const text = data?.getData('text/plain') ?? '';
  if (text === MARKER + copied.token) return true;
  return copied.systemFailed && !text && !data?.files.length;
}

/** Paste the copied photos as duplicates, each paste cascading a little further. Selects them. */
export async function pasteCopied(): Promise<void> {
  if (!copied) return;
  const ids = copied.ids.filter((id) => docStore.doc.photos[id]);
  if (!ids.length) return;
  copied.pastes += 1;
  const created = await duplicatePhotos(ids, PASTE_STEP * copied.pastes);
  selectIfOnDesk(created);
}

/** Duplicate photos (⌘D, or the menu) and select the copies that are on the desk. */
export async function duplicateAndSelect(ids: string[]): Promise<void> {
  selectIfOnDesk(await duplicatePhotos(ids));
}

function selectIfOnDesk(ids: string[]): void {
  const onDesk = new Set(docStore.doc.pile.map((p) => p.photoId));
  const selection = ids.filter((id) => onDesk.has(id));
  if (selection.length) ui.set({ selection });
}
