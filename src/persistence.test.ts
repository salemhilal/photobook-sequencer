import { beforeEach, describe, expect, it, vi } from 'vitest';

let stored: unknown;
const saves: unknown[] = [];
let saveError: Error | null = null;
vi.mock('./db', () => ({
  loadDoc: async () => stored,
  saveDoc: async (doc: unknown) => {
    if (saveError) throw saveError;
    saves.push(doc);
  },
  imageIds: async () => [],
  deleteImage: async () => {},
  getImage: async () => undefined,
  putImage: async () => {},
}));

const { saveProject, saveUnlessNewer } = await import('./persistence');
const { emptyDoc } = await import('./store');
const { CURRENT_SCHEMA } = await import('./types');
const { ui } = await import('./ui');

beforeEach(() => {
  stored = undefined;
  saves.length = 0;
  saveError = null;
  ui.set({ outdated: false, elsewhere: false, saveFailed: false });
});

describe('saveUnlessNewer', () => {
  it('saves over older or current projects', async () => {
    stored = { ...emptyDoc(), schemaVersion: 0 };
    expect(await saveUnlessNewer(emptyDoc())).toBe('saved');
    expect(saves).toHaveLength(1);
  });

  it('refuses to overwrite a project saved by a newer version, and asks for a reload', async () => {
    stored = { ...emptyDoc(), schemaVersion: CURRENT_SCHEMA + 1 };
    expect(await saveUnlessNewer(emptyDoc())).toBe('newer');
    expect(saves).toHaveLength(0);
    expect(ui.get().outdated).toBe(true);
  });
});

describe('saveProject', () => {
  it('warns when a save fails, and clears the warning once saving works again', async () => {
    saveError = new DOMException('full', 'QuotaExceededError');
    expect(await saveProject()).toBe('failed');
    expect(ui.get().saveFailed).toBe(true);
    saveError = null;
    expect(await saveProject()).toBe('saved');
    expect(ui.get().saveFailed).toBe(false);
  });

  it("doesn't save from a tab that isn't the one editing", async () => {
    ui.set({ elsewhere: true });
    expect(await saveProject()).toBe('skipped');
    expect(saves).toHaveLength(0);
  });
});
