import { describe, expect, it } from 'vitest';
import { toGuideId, toPhotoId, toSpreadId } from './ids';
import { migrateDoc, NewerProjectError } from './schema';
import { CURRENT_SCHEMA, type Doc } from './types';
import { InvalidProjectError } from './validate';

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
const a = toPhotoId('a');
const expected: Doc = {
  schemaVersion: CURRENT_SCHEMA,
  photos: { [a]: { id: a, name: 'a.jpg', pxW: 1200, pxH: 800 } },
  pile: [{ photoId: a, x: 1, y: 1, w: 2, h: 1.33, z: 1 }],
  // The first and last spreads, each in its place, and none between.
  firstSpread: { kind: 'first', id: toSpreadId('s1'), items: [] },
  spreads: [],
  lastSpread: { kind: 'last', id: toSpreadId('s2'), items: [] },
  settings: {
    pageW: 10,
    pageH: 8,
    centerV: true,
    centerH: false,
    keepRelative: true,
    borders: [{ id: toGuideId('m'), kind: 'even', inset: 0.5 }],
    lines: [],
    dropBorder: toGuideId('m'),
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
    expect(withoutIds(migrateDoc(structuredClone(sample)))).toEqual(withoutIds(expected));
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

describe('checking projects', () => {
  const broken = (change: (d: Record<string, unknown>) => void) => {
    const d = structuredClone(expected) as unknown as Record<string, unknown>;
    change(d);
    return () => migrateDoc(d);
  };

  it('accepts a sound project as it is', () => {
    expect(migrateDoc(structuredClone(expected))).toEqual(expected);
  });

  it('refuses damage anywhere in it, naming where', () => {
    expect(broken((d) => delete d.lastSpread)).toThrow(/lastSpread/);
    expect(broken((d) => ((d.settings as Record<string, unknown>).borders = 'wide'))).toThrow(/settings.borders/);
    expect(broken((d) => ((d.pile as { w: unknown }[])[0]!.w = -1))).toThrow(/pile\[0\]\.w/);
    expect(broken((d) => ((d.firstSpread as { kind: string }).kind = 'middle'))).toThrow(/firstSpread.kind/);
    expect(broken((d) => (d.spreads = [{ kind: 'first', id: 's9', items: [] }]))).toThrow(InvalidProjectError);
  });

  it('refuses a photo in two places, or one that isn’t there', () => {
    const twice = { photoId: 'a', x: 0, y: 0, w: 1, h: 1, z: 1 };
    expect(broken((d) => ((d.firstSpread as { items: unknown[] }).items = [twice]))).toThrow(/repeated id/);
    expect(broken((d) => ((d.pile as { photoId: string }[])[0]!.photoId = 'ghost'))).toThrow(/no such photo/);
  });

  it('refuses repeated spread or guide ids', () => {
    expect(broken((d) => ((d.lastSpread as { id: string }).id = 's1'))).toThrow(/repeated id/);
  });

  it('turns a damaged old project into the same error', () => {
    expect(() => migrateDoc({ ...(samples[1] as object), spreads: 'none' })).toThrow(InvalidProjectError);
  });
});
