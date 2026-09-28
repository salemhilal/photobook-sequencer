import { beforeEach, describe, expect, it } from 'vitest';
import { docStore, emptyProject } from './store';

const pageW = () => docStore.doc.settings.pageW;
const setPageW = (n: number, coalesce?: string) =>
  docStore.apply((d) => void (d.settings.pageW = n), coalesce ? { coalesce } : {});

beforeEach(() => docStore.reset(emptyProject()));

describe('undo and redo', () => {
  it('undoes and redoes discrete changes', () => {
    setPageW(11);
    setPageW(12);
    docStore.undo();
    expect(pageW()).toBe(11);
    docStore.undo();
    expect(pageW()).toBe(10);
    docStore.redo();
    expect(pageW()).toBe(11);
  });

  it('clears redo after a new change', () => {
    setPageW(11);
    docStore.undo();
    setPageW(9);
    expect(docStore.getSnapshot().canRedo).toBe(false);
  });

  it('merges rapid changes that share a coalesce key into one step', () => {
    setPageW(11, 'w');
    setPageW(12, 'w');
    docStore.undo();
    expect(pageW()).toBe(10);
  });

  it('ignores changes that change nothing', () => {
    setPageW(10);
    expect(docStore.getSnapshot().canUndo).toBe(false);
  });
});

describe('gestures', () => {
  it('records a whole gesture as a single step, each preview starting from the beginning', () => {
    docStore.begin();
    docStore.preview((d) => void (d.settings.pageW += 1));
    docStore.preview((d) => void (d.settings.pageW += 2));
    docStore.end();
    expect(pageW()).toBe(12);
    docStore.undo();
    expect(pageW()).toBe(10);
  });

  it('restores the starting doc on cancel', () => {
    docStore.begin();
    docStore.preview((d) => void (d.settings.pageW = 20));
    docStore.cancel();
    expect(pageW()).toBe(10);
    expect(docStore.getSnapshot().canUndo).toBe(false);
  });

  it('records nothing for a gesture that changes nothing', () => {
    docStore.begin();
    docStore.end();
    expect(docStore.getSnapshot().canUndo).toBe(false);
  });
});

describe('replace and silent', () => {
  it('replaces the whole doc as one undoable step', () => {
    const other = { ...emptyProject(), nextZ: 99 };
    docStore.replace(other);
    expect(docStore.doc).toBe(other);
    docStore.undo();
    expect(docStore.doc.nextZ).toBe(1);
  });

  it('changes the doc without recording history', () => {
    docStore.silent((d) => void (d.nextZ = 5));
    expect(docStore.doc.nextZ).toBe(5);
    expect(docStore.getSnapshot().canUndo).toBe(false);
  });
});

describe('swap', () => {
  it('shows another doc, then brings back the project with its history', () => {
    setPageW(11);
    setPageW(12);
    docStore.undo();
    const restore = docStore.swap({ ...emptyProject(), nextZ: 42 });
    expect(docStore.doc.nextZ).toBe(42);
    expect(docStore.getSnapshot().canUndo).toBe(false);
    setPageW(3);

    restore();
    expect(pageW()).toBe(11);
    docStore.redo();
    expect(pageW()).toBe(12);
    docStore.undo();
    docStore.undo();
    expect(pageW()).toBe(10);
  });
});
