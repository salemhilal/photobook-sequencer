import { describe, expect, it } from 'vitest';
import { migrateDoc, NewerProjectError } from './schema';
import { CURRENT_SCHEMA, type Doc } from './types';

/**
 * A saved project in each past shape. When you bump CURRENT_SCHEMA, add a sample
 * of the previous version here (copy one from a real save) and extend `expected`.
 */
const samples: Record<number, unknown> = {
  // Before versioning: no schemaVersion, and no keepRelative setting.
  0: {
    photos: { a: { id: 'a', name: 'a.jpg', pxW: 1200, pxH: 800 } },
    pile: [{ photoId: 'a', x: 1, y: 1, w: 2, h: 1.33, z: 1 }],
    spreads: [
      { id: 's1', kind: 'first', items: [] },
      { id: 's2', kind: 'last', items: [] },
    ],
    settings: { pageW: 10, pageH: 8, centerV: true, centerH: false, borders: [0.5] },
    nextZ: 2,
  },
  // Border guides as one distance from every edge, and no line guides.
  1: {
    schemaVersion: 1,
    photos: { a: { id: 'a', name: 'a.jpg', pxW: 1200, pxH: 800 } },
    pile: [{ photoId: 'a', x: 1, y: 1, w: 2, h: 1.33, z: 1 }],
    spreads: [
      { id: 's1', kind: 'first', items: [] },
      { id: 's2', kind: 'last', items: [] },
    ],
    settings: { pageW: 10, pageH: 8, centerV: true, centerH: false, keepRelative: true, borders: [0.5] },
    nextZ: 2,
  },
};

/**
 * What every sample should become. Upgrading gives guides new ids, so they're compared
 * with the ids set aside (see `withoutIds`), and checked to line up separately.
 */
const expected = {
  schemaVersion: CURRENT_SCHEMA,
  photos: { a: { id: 'a', name: 'a.jpg', pxW: 1200, pxH: 800 } },
  pile: [{ photoId: 'a', x: 1, y: 1, w: 2, h: 1.33, z: 1 }],
  spreads: [
    { id: 's1', kind: 'first', items: [] },
    { id: 's2', kind: 'last', items: [] },
  ],
  settings: {
    pageW: 10,
    pageH: 8,
    centerV: true,
    centerH: false,
    keepRelative: true,
    borders: [{ id: 'm', kind: 'even', inset: 0.5 }],
    lines: [],
    dropBorder: 'm',
  },
  nextZ: 2,
};

/** A doc with its guides' ids replaced by their position, and the drop guide's by its. */
function withoutIds(doc: Doc): unknown {
  const ids = doc.settings.borders.map((b) => b.id);
  return {
    ...doc,
    settings: {
      ...doc.settings,
      borders: doc.settings.borders.map((b, i) => ({ ...b, id: i })),
      dropBorder: doc.settings.dropBorder === null ? null : ids.indexOf(doc.settings.dropBorder),
    },
  };
}

describe('migrateDoc', () => {
  it('has a sample for every past version', () => {
    for (let v = 0; v < CURRENT_SCHEMA; v++) expect(samples[v], `missing sample for version ${v}`).toBeDefined();
  });

  it.each(Object.entries(samples))('upgrades version %s to the current shape', (_, sample) => {
    expect(withoutIds(migrateDoc(structuredClone(sample)))).toEqual(withoutIds(expected as Doc));
  });

  it('leaves current projects as they are', () => {
    expect(migrateDoc(structuredClone(expected))).toEqual(expected);
  });

  it('refuses projects from a newer version', () => {
    expect(() => migrateDoc({ ...expected, schemaVersion: CURRENT_SCHEMA + 1 })).toThrow(NewerProjectError);
  });
});

describe('migrating version 0 without border guides', () => {
  it('gives it version 1’s default guides, then upgrades them', () => {
    const doc = migrateDoc({ ...(samples[0] as object), settings: { pageW: 10, pageH: 8 } });
    expect(doc.settings.borders.map(({ kind, ...b }) => kind === 'even' && 'inset' in b && b.inset)).toEqual([
      0.5, 1.25,
    ]);
    expect(doc.settings.lines).toEqual([]);
    // Dropped photos fit the largest box, as before: the 0.5 in guide.
    expect(doc.settings.dropBorder).toBe(doc.settings.borders[0]!.id);
  });
});
