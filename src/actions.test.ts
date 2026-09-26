import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPhotosToPile,
  folioLabel,
  deleteFromProject,
  deleteSpread,
  insertSpread,
  moveSpread,
  putInPile,
  putOnNewSpread,
  putOnPage,
  spreadLabel,
} from './actions';
import { docStore, emptyDoc } from './store';
import type { PhotoMeta } from './types';

const photos: PhotoMeta[] = [
  { id: 'land', name: 'land.jpg', pxW: 1800, pxH: 1000 },
  { id: 'port', name: 'port.jpg', pxW: 800, pxH: 1000 },
  { id: 'sq', name: 'sq.jpg', pxW: 1000, pxH: 1000 },
];
const doc = () => docStore.doc;
const middle = (i = 1) => {
  const s = doc().spreads[i];
  if (!s) throw new Error(`no spread ${i}`);
  return s;
};

beforeEach(() => {
  docStore.reset(emptyDoc());
  addPhotosToPile(photos);
});

describe('adding photos', () => {
  it('scatters new photos on the desk at 2" on the long edge', () => {
    expect(doc().pile).toHaveLength(3);
    const land = doc().pile.find((p) => p.photoId === 'land');
    expect(land?.w).toBe(2);
    expect(land?.h).toBeCloseTo(2 / 1.8);
  });

  it('adds later batches below the existing pile', () => {
    const bottom = Math.max(...doc().pile.map((p) => p.y + p.h));
    addPhotosToPile([{ id: 'late', name: 'late.jpg', pxW: 1000, pxH: 1000 }]);
    expect(doc().pile.find((p) => p.photoId === 'late')?.y).toBeGreaterThan(bottom);
  });
});

describe('putOnPage', () => {
  it('moves a photo from the pile to a page, fit to the largest border guide and centered', () => {
    docStore.apply((d) => putOnPage(d, ['port'], middle().id, 'right'));
    expect(doc().pile.map((p) => p.photoId)).not.toContain('port');
    const item = middle().items[0];
    expect(item).toMatchObject({ photoId: 'port', y: 0.5, h: 7 });
    expect(item!.x + item!.w / 2).toBeCloseTo(5);
  });

  it('centers left-page photos on the left page', () => {
    docStore.apply((d) => putOnPage(d, ['sq'], middle().id, 'left'));
    const item = middle().items[0]!;
    expect(item.x + item.w / 2).toBeCloseTo(-5);
  });

  it('adds a spread and places photos on its left page when dropped between spreads', () => {
    docStore.apply((d) => putOnPage(d, ['sq'], middle(1).id, 'right'));
    docStore.apply((d) => putOnNewSpread(d, ['sq', 'land'], 2));
    expect(doc().spreads).toHaveLength(5);
    const added = doc().spreads[2]!;
    expect(added.kind).toBe('middle');
    expect(added.items.map((i) => i.photoId)).toEqual(['sq', 'land']);
    expect(added.items.every((i) => i.x + i.w / 2 < 0)).toBe(true);
    expect(middle(1).items).toHaveLength(0);
  });

  it('never adds a spread before the first page or after the last', () => {
    docStore.apply((d) => putOnNewSpread(d, ['sq'], 0));
    expect(doc().spreads[0]!.kind).toBe('first');
    expect(doc().spreads[1]!.items.map((i) => i.photoId)).toEqual(['sq']);
  });

  it('moves a photo between spreads without duplicating it', () => {
    docStore.apply((d) => putOnPage(d, ['sq'], middle(1).id, 'left'));
    docStore.apply((d) => putOnPage(d, ['sq'], middle(2).id, 'right'));
    expect(middle(1).items).toHaveLength(0);
    expect(middle(2).items.map((i) => i.photoId)).toEqual(['sq']);
  });

  it('puts the most recently placed photo on top', () => {
    docStore.apply((d) => putOnPage(d, ['sq', 'land'], middle().id, 'right'));
    const [a, b] = middle().items;
    expect(b!.z).toBeGreaterThan(a!.z);
  });
});

describe('putInPile', () => {
  it('returns a photo to the desk at pile size, centered on a point', () => {
    docStore.apply((d) => putOnPage(d, ['sq'], middle().id, 'right'));
    docStore.apply((d) => putInPile(d, 'sq', { x: 10, y: 10 }));
    expect(middle().items).toHaveLength(0);
    expect(doc().pile.find((p) => p.photoId === 'sq')).toMatchObject({ x: 9, y: 9, w: 2, h: 2 });
  });
});

describe('spreads', () => {
  it('labels pages with single first and last pages', () => {
    expect([0, 1, 2, 3].map((i) => spreadLabel(i, 4))).toEqual(['1', '2–3', '4–5', '6']);
  });

  it('pads folio labels like page numbers in a book', () => {
    expect([0, 1, 3].map((i) => folioLabel(i, 4))).toEqual(['01', '02–03', '06']);
    expect(folioLabel(1, 60)).toBe('002–003');
  });

  it('inserts spreads between the fixed first and last pages', () => {
    insertSpread(0);
    expect(doc().spreads[0]!.kind).toBe('first');
    expect(doc().spreads[1]!.kind).toBe('middle');
    insertSpread(99);
    expect(doc().spreads.at(-1)!.kind).toBe('last');
    expect(doc().spreads).toHaveLength(6);
  });

  it('never deletes the first or last page', () => {
    deleteSpread(doc().spreads[0]!.id);
    deleteSpread(doc().spreads.at(-1)!.id);
    expect(doc().spreads).toHaveLength(4);
  });

  it('returns photos to the desk when their spread is deleted', () => {
    docStore.apply((d) => putOnPage(d, ['sq', 'land'], middle().id, 'right'));
    deleteSpread(middle().id);
    expect(doc().spreads).toHaveLength(3);
    expect(doc().pile.map((p) => p.photoId).sort()).toEqual(['land', 'port', 'sq']);
  });

  it('reorders middle spreads but keeps first and last in place', () => {
    const [first, a, b, last] = doc().spreads.map((s) => s.id);
    moveSpread(a!, 2);
    expect(doc().spreads.map((s) => s.id)).toEqual([first, b, a, last]);
    moveSpread(a!, 0);
    expect(doc().spreads[0]!.id).toBe(first);
    moveSpread(first!, 2);
    expect(doc().spreads[0]!.id).toBe(first);
  });
});

describe('deleteFromProject', () => {
  it('removes photos everywhere, undoably', () => {
    docStore.apply((d) => putOnPage(d, ['sq'], middle().id, 'right'));
    deleteFromProject(['sq', 'land']);
    expect(Object.keys(doc().photos)).toEqual(['port']);
    expect(middle().items).toHaveLength(0);
    docStore.undo();
    expect(Object.keys(doc().photos)).toHaveLength(3);
  });
});
