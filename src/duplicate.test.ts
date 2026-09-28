import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toPhotoId } from './ids';

const A = toPhotoId('a');
const B = toPhotoId('b');

// Stand in for IndexedDB: keep stored images in memory.
const images = new Map<string, unknown>();
vi.mock('./db', () => ({
  putImage: async (id: string, img: unknown) => void images.set(id, img),
  getImage: async (id: string) => images.get(id),
  deleteImage: async (id: string) => void images.delete(id),
}));

const { addPhotosToPile, copyName, duplicatePhotos, putOnPage } = await import('./actions');
const { docStore, emptyDoc } = await import('./store');

beforeEach(() => {
  images.clear();
  docStore.reset(emptyDoc());
  addPhotosToPile([{ id: A, name: 'IMG_1.jpg', pxW: 1200, pxH: 800 }]);
  images.set(A, { full: new Blob(['full']), thumb: new Blob(['thumb']) });
});

describe('duplicatePhoto', () => {
  it('names copies', () => {
    expect(copyName('IMG_1.jpg')).toBe('IMG_1 copy.jpg');
    expect(copyName('scan')).toBe('scan copy');
  });

  it('adds an independent copy next to a desk photo, with its own image data', async () => {
    const [id] = await duplicatePhotos([A]);
    const doc = docStore.doc;
    expect(id).not.toBe(A);
    expect(doc.photos[id!]).toMatchObject({ name: 'IMG_1 copy.jpg', pxW: 1200, pxH: 800 });
    const [orig, copy] = [A, id!].map((pid) => doc.pile.find((p) => p.photoId === pid)!);
    expect(copy!.x - orig!.x).toBeCloseTo(0.25);
    expect(copy!.w).toBe(orig!.w);
    expect(copy!.z).toBeGreaterThan(orig!.z);
    expect(images.has(id!)).toBe(true);
  });

  it('keeps the copy on the same spread when the original is on a page', async () => {
    docStore.apply((d) => putOnPage(d, [A], d.spreads[0]!.id, 'right'));
    const [id] = await duplicatePhotos([A]);
    const items = docStore.doc.spreads[0]!.items.map((i) => i.photoId);
    expect(items).toEqual([A, id]);
    expect(docStore.doc.pile).toHaveLength(0);
  });

  it('duplicates several photos as one undo step, at a chosen offset', async () => {
    addPhotosToPile([{ id: B, name: 'IMG_2.jpg', pxW: 800, pxH: 800 }]);
    images.set(B, { full: new Blob([B]), thumb: new Blob([B]) });
    const ids = await duplicatePhotos([A, B], 0.5);
    expect(ids).toHaveLength(2);
    const b = docStore.doc.pile.find((p) => p.photoId === B)!;
    const bCopy = docStore.doc.pile.find((p) => p.photoId === ids[1])!;
    expect(bCopy.y - b.y).toBeCloseTo(0.5);
    docStore.undo();
    expect(Object.keys(docStore.doc.photos).sort()).toEqual([A, B]);
  });

  it('is undoable', async () => {
    await duplicatePhotos([A]);
    docStore.undo();
    expect(Object.keys(docStore.doc.photos)).toEqual([A]);
  });
});
