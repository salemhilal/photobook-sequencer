import { describe, expect, it } from 'vitest';
import { migrateDoc, NewerProjectError } from './schema';
import { CURRENT_SCHEMA } from './types';

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
};

/** What every sample should become. */
const expected = {
  schemaVersion: CURRENT_SCHEMA,
  photos: { a: { id: 'a', name: 'a.jpg', pxW: 1200, pxH: 800 } },
  pile: [{ photoId: 'a', x: 1, y: 1, w: 2, h: 1.33, z: 1 }],
  spreads: [
    { id: 's1', kind: 'first', items: [] },
    { id: 's2', kind: 'last', items: [] },
  ],
  settings: { pageW: 10, pageH: 8, centerV: true, centerH: false, keepRelative: true, borders: [0.5] },
  nextZ: 2,
};

describe('migrateDoc', () => {
  it('has a sample for every past version', () => {
    for (let v = 0; v < CURRENT_SCHEMA; v++) expect(samples[v], `missing sample for version ${v}`).toBeDefined();
  });

  it.each(Object.entries(samples))('upgrades version %s to the current shape', (_, sample) => {
    expect(migrateDoc(structuredClone(sample))).toEqual(expected);
  });

  it('leaves current projects as they are', () => {
    expect(migrateDoc(structuredClone(expected))).toEqual(expected);
  });

  it('refuses projects from a newer version', () => {
    expect(() => migrateDoc({ ...expected, schemaVersion: CURRENT_SCHEMA + 1 })).toThrow(NewerProjectError);
  });
});
