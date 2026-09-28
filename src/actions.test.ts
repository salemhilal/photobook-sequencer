import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  addPhotosToPile,
  folioLabel,
  deleteFromProject,
  deleteSpread,
  dropPhotos,
  insertSpread,
  locate,
  moveSpread,
  putInPile,
  putOnNewSpread,
  raise,
  putOnPage,
  spreadLabel,
  tidyPile,
} from './actions';
import { toPhotoId } from './ids';
import { allSpreads } from './spreads';
import { docStore, emptyDoc } from './store';
import type { PhotoMeta } from './types';

const LAND = toPhotoId('land');
const PORT = toPhotoId('port');
const SQ = toPhotoId('sq');
const photos: PhotoMeta[] = [
  { id: LAND, name: 'land.jpg', pxW: 1800, pxH: 1000 },
  { id: PORT, name: 'port.jpg', pxW: 800, pxH: 1000 },
  { id: SQ, name: 'sq.jpg', pxW: 1000, pxH: 1000 },
];
const doc = () => docStore.doc;
/** The whole book, in order: first, middles, last. */
const book = () => allSpreads(doc());
/** A middle spread by its place in the book (1 is the first middle one). */
const middle = (i = 1) => {
  const s = book()[i];
  if (!s || s.kind !== 'middle') throw new Error(`no middle spread at ${i}`);
  return s;
};

beforeEach(() => {
  docStore.reset(emptyDoc());
  addPhotosToPile(photos);
});

describe('adding photos', () => {
  it('scatters new photos on the desk at 2" on the long edge', () => {
    expect(doc().pile).toHaveLength(3);
    const land = doc().pile.find((p) => p.photoId === LAND);
    expect(land?.w).toBe(2);
    expect(land?.h).toBeCloseTo(2 / 1.8);
  });

  it('adds later batches below the existing pile', () => {
    const bottom = Math.max(...doc().pile.map((p) => p.y + p.h));
    addPhotosToPile([{ id: toPhotoId('late'), name: 'late.jpg', pxW: 1000, pxH: 1000 }]);
    expect(doc().pile.find((p) => p.photoId === 'late')?.y).toBeGreaterThan(bottom);
  });
});

describe('putOnPage', () => {
  it('moves a photo from the pile to a page, fit to the largest border guide and centered', () => {
    docStore.apply((d) => putOnPage(d, [PORT], middle().id, 'right'));
    expect(doc().pile.map((p) => p.photoId)).not.toContain(PORT);
    const item = middle().items[0];
    expect(item).toMatchObject({ photoId: PORT, y: 0.5, h: 7 });
    expect(item!.x + item!.w / 2).toBeCloseTo(5);
  });

  it('centers left-page photos on the left page', () => {
    docStore.apply((d) => putOnPage(d, [SQ], middle().id, 'left'));
    const item = middle().items[0]!;
    expect(item.x + item.w / 2).toBeCloseTo(-5);
  });

  it('adds a spread and places photos on its left page when dropped between spreads', () => {
    docStore.apply((d) => putOnPage(d, [SQ], middle(1).id, 'right'));
    docStore.apply((d) => putOnNewSpread(d, [SQ, LAND], 2));
    expect(book()).toHaveLength(5);
    const added = book()[2]!;
    expect(added.kind).toBe('middle');
    expect(added.items.map((i) => i.photoId)).toEqual([SQ, LAND]);
    expect(added.items.every((i) => i.x + i.w / 2 < 0)).toBe(true);
    expect(middle(1).items).toHaveLength(0);
  });

  it('never adds a spread before the first page or after the last', () => {
    docStore.apply((d) => putOnNewSpread(d, [SQ], 0));
    expect(book()[0]!.kind).toBe('first');
    expect(book()[1]!.items.map((i) => i.photoId)).toEqual([SQ]);
  });

  it('moves a photo between spreads without duplicating it', () => {
    docStore.apply((d) => putOnPage(d, [SQ], middle(1).id, 'left'));
    docStore.apply((d) => putOnPage(d, [SQ], middle(2).id, 'right'));
    expect(middle(1).items).toHaveLength(0);
    expect(middle(2).items.map((i) => i.photoId)).toEqual([SQ]);
  });

  it('puts the most recently placed photo on top', () => {
    docStore.apply((d) => putOnPage(d, [SQ, LAND], middle().id, 'right'));
    const [a, b] = middle().items;
    expect(b!.z).toBeGreaterThan(a!.z);
  });
});

describe('putInPile', () => {
  it('returns a photo to the desk at pile size, centered on a point', () => {
    docStore.apply((d) => putOnPage(d, [SQ], middle().id, 'right'));
    docStore.apply((d) => putInPile(d, SQ, { x: 10, y: 10 }));
    expect(middle().items).toHaveLength(0);
    expect(doc().pile.find((p) => p.photoId === SQ)).toMatchObject({ x: 9, y: 9, w: 2, h: 2 });
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
    expect(book()[0]!.kind).toBe('first');
    expect(book()[1]!.kind).toBe('middle');
    insertSpread(99);
    expect(book().at(-1)!.kind).toBe('last');
    expect(book()).toHaveLength(6);
  });

  it('never deletes the first or last page', () => {
    deleteSpread(doc().firstSpread.id);
    deleteSpread(doc().lastSpread.id);
    expect(book()).toHaveLength(4);
  });

  it('returns photos to the desk when their spread is deleted', () => {
    docStore.apply((d) => putOnPage(d, [SQ, LAND], middle().id, 'right'));
    deleteSpread(middle().id);
    expect(book()).toHaveLength(3);
    expect(
      doc()
        .pile.map((p) => p.photoId)
        .sort(),
    ).toEqual([LAND, PORT, SQ]);
  });

  it('reorders middle spreads but keeps first and last in place', () => {
    const [first, a, b, last] = book().map((s) => s.id);
    moveSpread(a!, 2);
    expect(book().map((s) => s.id)).toEqual([first, b, a, last]);
    moveSpread(a!, 0);
    expect(book()[0]!.id).toBe(first);
    moveSpread(first!, 2);
    expect(book()[0]!.id).toBe(first);
  });
});

describe('deleteFromProject', () => {
  it('removes photos everywhere, undoably', () => {
    docStore.apply((d) => putOnPage(d, [SQ], middle().id, 'right'));
    deleteFromProject([SQ, LAND]);
    expect(Object.keys(doc().photos)).toEqual([PORT]);
    expect(middle().items).toHaveLength(0);
    docStore.undo();
    expect(Object.keys(doc().photos)).toHaveLength(3);
  });
});

describe('tidyPile', () => {
  const place = (id: PhotoMeta['id'], x: number, y: number) =>
    docStore.apply((d) => {
      const p = d.pile.find((q) => q.photoId === id)!;
      p.x = x;
      p.y = y;
    });

  it('lines photos up on a grid, keeping their reading order', () => {
    place(LAND, 5.2, 0.9);
    place(PORT, 0.3, 1.2);
    place(SQ, 2.6, 4.4);
    tidyPile();
    const byId = Object.fromEntries(doc().pile.map((p) => [p.photoId, p]));
    // Row 1: port, land (left to right); row 2: sq.
    expect(byId.port!.y).toBeLessThan(byId.sq!.y);
    expect(byId.port!.x).toBeLessThan(byId.land!.x);
    const centerY = (id: string) => byId[id]!.y + byId[id]!.h / 2;
    expect(centerY(PORT)).toBeCloseTo(centerY(LAND));
    // Grid cells are the largest photo plus a small gap.
    const centerX = (id: string) => byId[id]!.x + byId[id]!.w / 2;
    expect(centerX(LAND) - centerX(PORT)).toBeCloseTo(2.3);
    expect(centerX(SQ)).toBeCloseTo(centerX(PORT));
  });

  it('wraps rows that are wider than the visible desk', () => {
    const extra = Array.from({ length: 12 }, (_, i) => ({
      id: toPhotoId(`x${i}`),
      name: `x${i}.jpg`,
      pxW: 1000,
      pxH: 1000,
    }));
    addPhotosToPile(extra);
    doc().pile.forEach((p, i) => place(p.photoId, i * 2.5, 1));
    tidyPile();
    // The default visible desk is 20" wide: 8 columns of 2.3" cells.
    const rows = new Set(doc().pile.map((p) => Math.round(p.y + p.h / 2)));
    expect(rows.size).toBe(2);
  });

  it('only tidies the selection when several photos are selected', () => {
    const before = doc().pile.find((p) => p.photoId === SQ);
    tidyPile([LAND, PORT]);
    expect(doc().pile.find((p) => p.photoId === SQ)).toEqual(before);
  });

  it('is one undoable step', () => {
    const before = doc().pile;
    tidyPile();
    docStore.undo();
    expect(doc().pile).toEqual(before);
  });
});

describe('locate', () => {
  it('finds photos on the desk or on a spread', () => {
    docStore.apply((d) => putOnPage(d, [SQ], middle().id, 'right'));
    expect(locate(doc(), LAND)?.where).toBe('desk');
    const onSpread = locate(doc(), SQ);
    expect(onSpread?.where === 'spread' && onSpread.spread.id).toBe(middle().id);
    expect(locate(doc(), toPhotoId('nope'))).toBeNull();
  });
});

describe('dropPhotos', () => {
  it('places photos on pages, in new spreads, or back on the desk', () => {
    docStore.apply((d) => void dropPhotos(d, { kind: 'page', spreadId: middle().id, side: 'left' }, [SQ]));
    expect(locate(doc(), SQ)?.where).toBe('spread');
    docStore.apply((d) => void dropPhotos(d, { kind: 'insert', index: 1 }, [LAND]));
    expect(book()).toHaveLength(5);
    expect(book()[1]!.items.map((i) => i.photoId)).toEqual([LAND]);
    docStore.apply((d) => void dropPhotos(d, { kind: 'desk' }, [SQ], { x: 10, y: 10 }));
    expect(doc().pile.find((p) => p.photoId === SQ)).toMatchObject({ x: 9, y: 9 });
  });

  it('does nothing without a target', () => {
    const before = doc();
    docStore.apply((d) => void dropPhotos(d, null, [SQ]));
    expect(doc()).toBe(before);
  });
});

describe('raise', () => {
  it('brings a photo to the front, and leaves the one already there alone', () => {
    const doc = produce(sampleDocForRaise(), (d) => {
      raise(d, d.pile, d.pile[0]!);
    });
    expect(doc.pile[0]!.z).toBe(3);
    const again = produce(doc, (d) => {
      raise(d, d.pile, d.pile[0]!);
    });
    // Unchanged, so a click on the front photo isn't an edit.
    expect(again).toBe(doc);
  });
});

function sampleDocForRaise() {
  const doc = emptyDoc();
  doc.pile = [
    { photoId: toPhotoId('a'), x: 0, y: 0, w: 1, h: 1, z: 1 },
    { photoId: toPhotoId('b'), x: 0, y: 0, w: 1, h: 1, z: 2 },
  ];
  doc.nextZ = 3;
  return doc;
}
