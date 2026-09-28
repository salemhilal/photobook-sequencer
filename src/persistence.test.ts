import { beforeEach, describe, expect, it, vi } from 'vitest';

let stored: unknown;
const saves: unknown[] = [];
let saveError: Error | null = null;
vi.mock('./db', () => ({
  loadSavedProject: async () => stored,
  storeProject: async (project: unknown) => {
    if (saveError) throw saveError;
    saves.push(project);
  },
  imageIds: async () => [],
  deleteImage: async () => {},
  getImage: async () => undefined,
  putImage: async () => {},
}));

const { saveProject, saveUnlessNewer } = await import('./persistence');
const { emptyProject } = await import('./store');
const { CURRENT_SCHEMA } = await import('./types');
const { ui } = await import('./ui');

beforeEach(() => {
  stored = undefined;
  saves.length = 0;
  saveError = null;
  ui.set({ blocked: null, saveFailed: false });
});

describe('saveUnlessNewer', () => {
  it('saves over older or current projects', async () => {
    stored = { ...emptyProject(), schemaVersion: 0 };
    expect(await saveUnlessNewer(emptyProject())).toBe('saved');
    expect(saves).toHaveLength(1);
  });

  it('refuses to overwrite a project saved by a newer version, and asks for a reload', async () => {
    stored = { ...emptyProject(), schemaVersion: CURRENT_SCHEMA + 1 };
    expect(await saveUnlessNewer(emptyProject())).toBe('newer');
    expect(saves).toHaveLength(0);
    expect(ui.get().blocked).toBe('outdated');
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
    ui.set({ blocked: 'elsewhere' });
    expect(await saveProject()).toBe('skipped');
    expect(saves).toHaveLength(0);
  });
});
