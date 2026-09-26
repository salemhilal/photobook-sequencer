import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stand in for IndexedDB: keep stored images in memory.
const images = new Map<string, unknown>();
vi.mock('./db', () => ({
  putImage: async (id: string, img: unknown) => void images.set(id, img),
  getImage: async (id: string) => images.get(id),
  deleteImage: async (id: string) => void images.delete(id),
}));

const { addPhotosToPile, copyName, duplicatePhoto, putOnPage } = await import('./actions');
const { docStore, emptyDoc } = await import('./store');

beforeEach(() => {
  images.clear();
  docStore.reset(emptyDoc());
  addPhotosToPile([{ id: 'a', name: 'IMG_1.jpg', pxW: 1200, pxH: 800 }]);
  images.set('a', { full: new Blob(['full']), thumb: new Blob(['thumb']) });
});

describe('duplicatePhoto', () => {
  it('names copies', () => {
    expect(copyName('IMG_1.jpg')).toBe('IMG_1 copy.jpg');
    expect(copyName('scan')).toBe('scan copy');
  });

  it('adds an independent copy next to a desk photo, with its own image data', async () => {
    const id = await duplicatePhoto('a');
    const doc = docStore.doc;
    expect(id).not.toBe('a');
    expect(doc.photos[id!]).toMatchObject({ name: 'IMG_1 copy.jpg', pxW: 1200, pxH: 800 });
    const [orig, copy] = ['a', id!].map((pid) => doc.pile.find((p) => p.photoId === pid)!);
    expect(copy!.x - orig!.x).toBeCloseTo(0.25);
    expect(copy!.w).toBe(orig!.w);
    expect(copy!.z).toBeGreaterThan(orig!.z);
    expect(images.has(id!)).toBe(true);
  });

  it('keeps the copy on the same spread when the original is on a page', async () => {
    docStore.apply((d) => putOnPage(d, ['a'], d.spreads[1]!.id, 'right'));
    const id = await duplicatePhoto('a');
    const items = docStore.doc.spreads[1]!.items.map((i) => i.photoId);
    expect(items).toEqual(['a', id]);
    expect(docStore.doc.pile).toHaveLength(0);
  });

  it('is undoable', async () => {
    await duplicatePhoto('a');
    docStore.undo();
    expect(Object.keys(docStore.doc.photos)).toEqual(['a']);
  });
});
