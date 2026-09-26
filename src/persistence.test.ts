import { beforeEach, describe, expect, it, vi } from 'vitest';

let stored: unknown;
const saves: unknown[] = [];
vi.mock('./db', () => ({
  loadDoc: async () => stored,
  saveDoc: async (doc: unknown) => void saves.push(doc),
  imageIds: async () => [],
  deleteImage: async () => {},
  getImage: async () => undefined,
  putImage: async () => {},
}));

const { saveUnlessNewer } = await import('./persistence');
const { emptyDoc } = await import('./store');
const { CURRENT_SCHEMA } = await import('./types');
const { ui } = await import('./ui');

beforeEach(() => {
  stored = undefined;
  saves.length = 0;
  ui.set({ outdated: false });
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
