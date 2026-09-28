import { emptyDoc, newId } from './store';
import { CURRENT_SCHEMA, type Doc } from './types';

/**
 * Upgrading saved projects. Projects are saved in the browser and in exported
 * files, so the app must read every shape it has ever saved.
 *
 * When what gets saved changes: bump CURRENT_SCHEMA (types.ts), add a step here
 * that turns the previous version into the new one, and add a sample of the
 * previous version to schema.test.ts. Each step only needs to know its neighbors.
 */

/** Loosely typed: older shapes don't match today's Doc type. */
type Raw = Record<string, unknown>;

const migrations: Record<number, (doc: Raw) => Raw> = {
  /** 0 → 1: projects from before versioning. Fill in any missing settings. */
  0: (doc) => {
    const base = emptyDoc();
    // Version 1's defaults: borders were numbers, and there were no line guides.
    const v1 = { ...base.settings, borders: [0.5, 1.25] } as Raw;
    delete v1.lines;
    delete v1.dropBorder;
    return { ...doc, settings: { ...v1, ...(doc.settings as object) } };
  },
  /**
   * 1 → 2: guides get ids, border guides can have a distance per edge (these stay even),
   * line guides arrive, and the guide dropped photos fit is chosen: as before, the largest.
   */
  1: (doc) => {
    const settings = doc.settings as Raw;
    const insets = settings.borders as number[];
    const borders = insets.map((inset) => ({ id: newId(), kind: 'even', inset }));
    const largest = borders.reduce<(typeof borders)[number] | null>((a, b) => (!a || b.inset < a.inset ? b : a), null);
    return { ...doc, settings: { ...settings, borders, lines: [], dropBorder: largest?.id ?? null } };
  },
};

export class NewerProjectError extends Error {
  constructor() {
    super('This project was saved by a newer version of Sequence.');
  }
}

/** The shape version of saved data; projects from before versioning have none (version 0). */
export function schemaVersionOf(doc: unknown): number {
  const v = (doc as Raw | null)?.schemaVersion;
  return typeof v === 'number' ? v : 0;
}

/** Upgrade saved data to the current shape. Throws NewerProjectError if it's from a newer app. */
export function migrateDoc(stored: unknown): Doc {
  let version = schemaVersionOf(stored);
  if (version > CURRENT_SCHEMA) throw new NewerProjectError();
  let doc = stored as Raw;
  while (version < CURRENT_SCHEMA) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from project version ${version}`);
    doc = step(doc);
    version += 1;
  }
  return { ...doc, schemaVersion: CURRENT_SCHEMA } as unknown as Doc;
}
