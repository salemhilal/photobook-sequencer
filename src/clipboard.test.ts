import { beforeEach, describe, expect, it, vi } from 'vitest';

const images = new Map<string, unknown>();
vi.mock('./db', () => ({
  putImage: async (id: string, img: unknown) => void images.set(id, img),
  getImage: async (id: string) => images.get(id),
  deleteImage: async (id: string) => void images.delete(id),
}));
vi.mock('./images', async (orig) => ({
  ...(await orig<typeof import('./images')>()),
  photoAsPng: async () => new Blob(['png'], { type: 'image/png' }),
}));

// A fake system clipboard that records what was written.
let written: Record<string, Blob> = {};
let failWrites = false;
class FakeClipboardItem {
  constructor(public items: Record<string, Blob | Promise<Blob>>) {}
}
vi.stubGlobal('ClipboardItem', FakeClipboardItem);
vi.stubGlobal('navigator', {
  clipboard: {
    write: async ([item]: FakeClipboardItem[]) => {
      if (failWrites) throw new Error('denied');
      written = Object.fromEntries(await Promise.all(Object.entries(item!.items).map(async ([k, v]) => [k, await v])));
    },
  },
});

const { addPhotosToPile } = await import('./actions');
const { copyPhotos, isInternalPaste, pasteCopied } = await import('./clipboard');
const { docStore, emptyDoc } = await import('./store');
const { ui } = await import('./ui');

/** What a paste event would carry after our copy (or after copying something else). */
const pasteData = async (text: string | null, files: File[] = []) =>
  ({ getData: () => text ?? '', files }) as unknown as DataTransfer;

beforeEach(() => {
  images.clear();
  written = {};
  failWrites = false;
  docStore.reset(emptyDoc());
  addPhotosToPile([
    { id: 'a', name: 'a.jpg', pxW: 100, pxH: 100 },
    { id: 'b', name: 'b.jpg', pxW: 100, pxH: 100 },
  ]);
  images.set('a', { full: new Blob(['a']), thumb: new Blob(['a']) });
  images.set('b', { full: new Blob(['b']), thumb: new Blob(['b']) });
});

describe('copy and paste', () => {
  it('puts the image and a marker on the system clipboard', async () => {
    await copyPhotos(['a']);
    expect(Object.keys(written).sort()).toEqual(['image/png', 'text/plain']);
  });

  it('pastes copied photos as duplicates, selected, cascading with each paste', async () => {
    await copyPhotos(['a', 'b']);
    const marker = await written['text/plain']!.text();
    expect(isInternalPaste(await pasteData(marker))).toBe(true);

    await pasteCopied();
    await pasteCopied();
    const pile = docStore.doc.pile;
    expect(pile).toHaveLength(6);
    const a = pile.find((p) => p.photoId === 'a')!;
    const copiesOfA = pile.filter((p) => docStore.doc.photos[p.photoId]!.name === 'a copy.jpg');
    expect(copiesOfA.map((p) => Math.round((p.x - a.x) * 100) / 100)).toEqual([0.25, 0.5]);
    expect(ui.get().selection).toHaveLength(2);
  });

  it('treats a paste as external once something else was copied', async () => {
    await copyPhotos(['a']);
    expect(isInternalPaste(await pasteData('some other text'))).toBe(false);
    expect(isInternalPaste(await pasteData(null, [new File(['x'], 'image.png')]))).toBe(false);
  });

  it('still pastes inside the app when the system clipboard is unavailable', async () => {
    failWrites = true;
    await copyPhotos(['a']).catch(() => {});
    expect(isInternalPaste(await pasteData(null))).toBe(true);
  });
});
