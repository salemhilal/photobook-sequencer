import { emptyDoc } from './store';
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
    return { ...doc, settings: { ...base.settings, ...(doc.settings as object) } };
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
