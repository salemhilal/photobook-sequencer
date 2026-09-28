import { useEffect } from 'react';
import { duplicatePhotos, importPhotos } from './actions';
import { photoAsPng } from './images';
import type { PhotoId } from './ids';
import { projectStore } from './store';
import { isTyping } from './input';
import { deskCovered, ui } from './ui';

/**
 * Copying photos inside the app. ⌘C remembers which photos were copied and also
 * puts the first one on the system clipboard as an image (for pasting elsewhere),
 * alongside a text marker. When ⌘V finds that marker, pasting duplicates the
 * copied photos — the same as Duplicate. If something else was copied since, the
 * marker is gone and a pasted image is imported instead.
 */
const MARKER = 'photobook-sequencer:';
const PASTE_STEP = 0.25;

let copied: { ids: PhotoId[]; token: string; pastes: number; systemFailed: boolean } | null = null;

export function copyPhotos(ids: PhotoId[]): Promise<void> {
  const first = ids[0];
  if (!first) return Promise.resolve();
  const entry = { ids, token: crypto.randomUUID(), pastes: 0, systemFailed: false };
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
  const ids = copied.ids.filter((id) => projectStore.project.photos[id]);
  if (!ids.length) return;
  copied.pastes += 1;
  const created = await duplicatePhotos(ids, PASTE_STEP * copied.pastes);
  selectIfOnDesk(created);
}

/** Duplicate photos (⌘D, or the menu) and select the copies that are on the desk. */
export async function duplicateAndSelect(ids: PhotoId[]): Promise<void> {
  selectIfOnDesk(await duplicatePhotos(ids));
}

function selectIfOnDesk(ids: PhotoId[]): void {
  const onDesk = new Set(projectStore.project.pile.map((p) => p.photoId));
  const selection = ids.filter((id) => onDesk.has(id));
  if (selection.length) ui.set({ selection });
}

/**
 * ⌘V / Ctrl+V on the desk: photos copied in the app are pasted as duplicates;
 * images copied elsewhere are added to the desk.
 */
export function usePasteHandler(): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e) || ui.get().importing || deskCovered()) return;
      if (isInternalPaste(e.clipboardData)) {
        e.preventDefault();
        void pasteCopied();
        return;
      }
      const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!images.length) return;
      e.preventDefault();
      void importPhotos(images.map(renamePasted(images.length)));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
}

/** Clipboard images usually arrive as a generic "image.png"; name them "Pasted image 18.23.png". */
function renamePasted(count: number) {
  const time = new Date().toTimeString().slice(0, 5).replace(':', '.');
  return (f: File, i: number): File => {
    if (!/^image\.\w+$/i.test(f.name)) return f;
    const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const suffix = count > 1 ? ` ${i + 1}` : '';
    return new File([f], `Pasted image ${time}${suffix}.${ext}`, { type: f.type });
  };
}
