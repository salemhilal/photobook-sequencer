import { describe, expect, it } from 'vitest';
import { toGuideId, toPhotoId } from './ids';
import { emptyProject } from './store';
import type { Project } from './types';
import { InvalidProjectError, validateProject } from './validate';

const A = toPhotoId('a');
const B = toPhotoId('b');

/** A project with something in every part: photos on the desk and a page, every guide kind. */
function sound(): Project {
  const doc = emptyProject();
  doc.photos = {
    [A]: { id: A, name: 'a.jpg', pxW: 1200, pxH: 800 },
    [B]: { id: B, name: 'b.jpg', pxW: 800, pxH: 1200 },
  };
  doc.pile = [{ photoId: A, x: -3, y: 1, w: 2, h: 1.33, z: 1 }];
  doc.spreads[0]!.items = [{ photoId: B, x: -9, y: 0.5, w: 4, h: 6, z: 2 }];
  doc.settings.borders.push({ id: toGuideId('edges'), kind: 'edges', top: 0.5, bottom: 1, inside: 1.5, outside: 0.75 });
  doc.settings.lines = [
    { id: toGuideId('v'), axis: 'vertical', at: 2 },
    { id: toGuideId('h'), axis: 'horizontal', at: 3 },
  ];
  doc.nextZ = 3;
  return doc;
}

/** A sound project as plain JSON, changed by `damage`, then checked. */
function check(damage: (d: any) => void): () => Project {
  const d = JSON.parse(JSON.stringify(sound()));
  damage(d);
  return () => validateProject(d);
}

describe('validateProject', () => {
  it('accepts sound projects as they are', () => {
    const project = sound();
    expect(validateProject(project)).toEqual(project);
    const empty = emptyProject();
    expect(validateProject(empty)).toEqual(empty);
  });

  it('keeps only what it checked', () => {
    const d = JSON.parse(JSON.stringify(sound()));
    d.extra = 'x';
    d.pile[0].tint = 'red';
    const doc = validateProject(d);
    expect(doc).not.toHaveProperty('extra');
    expect(doc.pile[0]).not.toHaveProperty('tint');
  });

  it('refuses anything that isn’t a project, or is from another version', () => {
    expect(() => validateProject(null)).toThrow(InvalidProjectError);
    expect(() => validateProject([])).toThrow(InvalidProjectError);
    expect(check((d) => (d.schemaVersion = 1))).toThrow(/schemaVersion/);
  });

  it('names where the damage is', () => {
    expect(check((d) => (d.pile[0].w = 'wide'))).toThrow('Damaged project (pile[0].w)');
  });

  describe('photos', () => {
    it('needs each photo filed under its own id', () => {
      expect(check((d) => (d.photos.a.id = 'b'))).toThrow(/photos.a.id/);
    });

    it('needs a name and real pixel sizes', () => {
      expect(check((d) => delete d.photos.a.name)).toThrow(/photos.a.name/);
      expect(check((d) => (d.photos.a.pxW = 0))).toThrow(/photos.a.pxW/);
      expect(check((d) => (d.photos.b.pxH = -5))).toThrow(/photos.b.pxH/);
    });
  });

  describe('placements', () => {
    it('needs numbers, with a size', () => {
      expect(check((d) => (d.pile[0].x = null))).toThrow(/pile\[0\]\.x/);
      expect(check((d) => (d.pile[0].y = Infinity))).toThrow(/pile\[0\]\.y/);
      expect(check((d) => (d.spreads[0].items[0].h = 0))).toThrow(/spreads\[0\]\.items\[0\]\.h/);
    });

    it('allows photos partly off the desk or page (negative positions)', () => {
      expect(check((d) => (d.pile[0].x = -40))).not.toThrow();
    });

    it('refuses a placement of a photo that isn’t in the project', () => {
      expect(check((d) => (d.pile[0].photoId = 'ghost'))).toThrow(/no such photo/);
    });

    it('refuses a photo in two places: the desk and a page, or twice on a page', () => {
      expect(check((d) => d.lastSpread.items.push({ ...d.pile[0] }))).toThrow(
        /lastSpread\.items\[0\]\.photoId: repeated id/,
      );
      expect(check((d) => d.spreads[0].items.push({ ...d.spreads[0].items[0] }))).toThrow(/repeated id/);
    });
  });

  describe('spreads', () => {
    it('needs the first and last spreads in their places', () => {
      expect(check((d) => delete d.firstSpread)).toThrow(/firstSpread/);
      expect(check((d) => (d.lastSpread = d.spreads[1]))).toThrow(/lastSpread.kind/);
    });

    it('refuses a first or last spread among the middle ones', () => {
      expect(check((d) => d.spreads.push({ ...d.firstSpread, id: 'extra' }))).toThrow(/spreads\[2\]\.kind/);
    });

    it('allows a book with no middle spreads', () => {
      expect(check((d) => (d.spreads = []))).not.toThrow();
    });

    it('refuses repeated spread ids', () => {
      expect(check((d) => (d.lastSpread.id = d.firstSpread.id))).toThrow(/lastSpread.id: repeated id/);
    });
  });

  describe('settings', () => {
    it('needs a real page size and yes-or-no switches', () => {
      expect(check((d) => (d.settings.pageW = 0))).toThrow(/settings.pageW/);
      expect(check((d) => (d.settings.centerV = 'yes'))).toThrow(/settings.centerV/);
      expect(check((d) => delete d.settings.keepRelative)).toThrow(/settings.keepRelative/);
    });

    it('checks each kind of border guide', () => {
      expect(check((d) => (d.settings.borders[0].kind = 'round'))).toThrow(/settings.borders\[0\]\.kind/);
      expect(check((d) => (d.settings.borders[0].inset = -1))).toThrow(/settings.borders\[0\]\.inset/);
      expect(check((d) => delete d.settings.borders[2].outside)).toThrow(/settings.borders\[2\]\.outside/);
    });

    it('checks line guides', () => {
      expect(check((d) => (d.settings.lines[0].axis = 'diagonal'))).toThrow(/settings.lines\[0\]\.axis/);
      expect(check((d) => (d.settings.lines[1].at = 'middle'))).toThrow(/settings.lines\[1\]\.at/);
    });

    it('refuses a guide id used twice, even across kinds', () => {
      expect(check((d) => (d.settings.lines[0].id = d.settings.borders[0].id))).toThrow(
        /settings.lines\[0\]\.id: repeated id/,
      );
    });

    it('allows a drop guide that’s gone (the largest is used), but not a malformed one', () => {
      expect(check((d) => (d.settings.dropBorder = 'gone'))).not.toThrow();
      expect(check((d) => (d.settings.dropBorder = null))).not.toThrow();
      expect(check((d) => (d.settings.dropBorder = 3))).toThrow(/settings.dropBorder/);
    });
  });

  it('keeps nextZ above every placement, so new ones go on top', () => {
    expect(validateProject({ ...sound(), nextZ: 1 }).nextZ).toBe(3);
    expect(validateProject({ ...sound(), nextZ: 10 }).nextZ).toBe(10);
  });

  it('returns ids of the right kinds', () => {
    const project = sound();
    const doc = validateProject(project);
    expect(doc.firstSpread.id).toBe(project.firstSpread.id);
    expect(doc.settings.lines.map((l) => l.id)).toEqual([toGuideId('v'), toGuideId('h')]);
    expect(Object.keys(doc.photos)).toEqual([A, B]);
  });
});
