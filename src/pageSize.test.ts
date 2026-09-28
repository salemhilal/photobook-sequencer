import { beforeEach, describe, expect, it } from 'vitest';
import { addPhotosToPile, putOnPage } from './actions';
import { setPageSize } from './pageSize';
import { newGuideId, toPhotoId } from './ids';
import { projectStore, emptyProject } from './store';

const P = toPhotoId('p');
const placed = () => projectStore.project.spreads[0]!.items[0]!;

beforeEach(() => {
  projectStore.reset(emptyProject());
  addPhotosToPile([{ id: P, name: 'p.jpg', pxW: 1500, pxH: 1000 }]);
  projectStore.apply((d) => putOnPage(d, [P], d.spreads[0]!.id, 'right'));
});

describe('setPageSize', () => {
  it('puts photos back exactly when a size goes back', () => {
    const before = { ...placed() };
    setPageSize('pageW', 8);
    expect(placed()).not.toEqual(before);
    setPageSize('pageW', 10);
    expect(placed()).toEqual(before);
  });

  it('gives the same layout whatever order the edits come in', () => {
    const before = { ...placed() };
    setPageSize('pageW', 7);
    setPageSize('pageH', 6);
    setPageSize('pageW', 10);
    setPageSize('pageH', 8);
    expect(placed()).toEqual(before);
  });

  it('keeps border guides on a page that shrinks, and restores them when it grows back', () => {
    const id = newGuideId();
    projectStore.apply((d) => void d.settings.borders.push({ id, kind: 'even', inset: 3 }));
    setPageSize('pageH', 4);
    const shrunk = projectStore.project.settings.borders.find((b) => b.id === id)!;
    expect(shrunk.kind === 'even' && shrunk.inset).toBeLessThan(2);
    setPageSize('pageH', 8);
    expect(projectStore.project.settings.borders.find((b) => b.id === id)).toEqual({ id, kind: 'even', inset: 3 });
  });

  it('is one undo step per edit', () => {
    const before = projectStore.project;
    setPageSize('pageW', 8);
    projectStore.undo();
    expect(projectStore.project).toBe(before);
  });

  it('starts over from the current layout after any other change', () => {
    setPageSize('pageW', 8);
    projectStore.apply((d) => void (d.spreads[0]!.items[0]!.x += 0.5));
    const moved = { ...placed() };
    setPageSize('pageW', 8.5);
    setPageSize('pageW', 8);
    expect(placed()).toEqual(moved);
  });
});
