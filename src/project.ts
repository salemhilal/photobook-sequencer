import { getImage, putImage } from './db';
import { setUrl, thumbFromBlob } from './images';
import { migrateDoc, NewerProjectError } from './schema';
import { docStore, emptyDoc } from './store';
import type { Doc } from './types';
import { MOD_LABEL } from './platform';
import { ask, ui } from './ui';
import { createZip, readZip, ZipTooLargeError, type ZipInput } from './zip';
import { download } from './download';

/**
 * Project files are ZIP archives:
 *   project.json      — the document (layout, settings) plus where each photo's files live
 *   images/<name>     — original files, as imported
 *   thumbs/<id>.jpg   — display copies (optional; regenerated on import if missing)
 */
const FORMAT = 'photo-sequencer-project';
const VERSION = 1;
const MANIFEST = 'project.json';

interface Manifest {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  doc: Doc;
  files: Record<string, { image: string; thumb?: string }>;
}

export class ProjectFileError extends Error {}

/** The project as a .photo-sequence file (a ZIP), reporting progress in the UI. */
export async function buildProjectFile(verb = 'Exporting'): Promise<Blob> {
  const doc = docStore.doc;
  const ids = Object.keys(doc.photos);
  const entries: ZipInput[] = [];
  const files: Manifest['files'] = {};
  const usedNames = new Set<string>();

  const setBusy = (busy: string | null) => ui.set({ busy });
  try {
    setBusy(`${verb}…`);
    for (const id of ids) {
      const img = await getImage(id);
      const meta = doc.photos[id];
      if (!img || !meta) continue;
      const image = `images/${uniqueName(meta.name, id, usedNames)}`;
      const thumb = `thumbs/${id}.jpg`;
      entries.push({ name: image, data: img.full }, { name: thumb, data: img.thumb });
      files[id] = { image, thumb };
    }
    const manifest: Manifest = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), doc, files };
    entries.unshift({
      name: MANIFEST,
      data: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
    });

    const photoCount = Object.keys(files).length;
    const zip = await createZip(entries, (done) =>
      setBusy(`${verb} ${Math.min(photoCount, Math.floor(done / 2))} of ${photoCount}…`),
    );
    // A .photo-sequence file is a ZIP; the octet-stream type keeps browsers from renaming it to .zip.
    return new Blob([zip], { type: 'application/octet-stream' });
  } finally {
    setBusy(null);
  }
}

/** Export the project to a file; resolves to whether it was saved. */
export async function exportProject(): Promise<boolean> {
  const file = await buildProjectFile();
  return download(file, `photo-book-${new Date().toISOString().slice(0, 10)}${PROJECT_EXTENSION}`);
}

/** Replace the current project with one from a file. Undoable. */
export async function importProject(file: File): Promise<void> {
  if (ui.get().importing) return;
  ui.set({ busy: 'Opening project…', importing: { done: 0, total: 0 } });
  try {
    const zip = await readZip(file).catch(() => {
      throw new ProjectFileError(`“${file.name}” isn't a Photo Sequencer project.`);
    });
    const manifestEntry = zip.get(MANIFEST);
    if (!manifestEntry) throw new ProjectFileError(`“${file.name}” isn't a Photo Sequencer project.`);
    const manifest = parseManifest(await (await manifestEntry.blob()).text());
    const newer = new ProjectFileError(
      'This project was made by a newer version of Photobook Sequencer. Reload to update, then try again.',
    );
    // `version` is the file's layout; the project inside has its own schema version.
    if (manifest.version > VERSION) throw newer;
    let doc;
    try {
      doc = migrateDoc(manifest.doc);
    } catch (e) {
      throw e instanceof NewerProjectError ? newer : e;
    }
    const ids = Object.keys(doc.photos);
    const missing = new Set<string>();
    let done = 0;
    ui.set({ importing: { done, total: ids.length } });

    for (const id of ids) {
      const paths = manifest.files[id];
      const imageEntry = paths && zip.get(paths.image);
      if (!paths || !imageEntry) {
        missing.add(id);
        continue;
      }
      const full = await imageEntry.blob(mimeFor(paths.image));
      const thumbEntry = paths.thumb ? zip.get(paths.thumb) : undefined;
      const thumb = thumbEntry ? await thumbEntry.blob('image/jpeg') : await thumbFromBlob(full);
      await putImage(id, { full, thumb });
      setUrl(id, thumb);
      ui.set({ importing: { done: ++done, total: ids.length } });
    }

    for (const id of missing) {
      delete doc.photos[id];
      doc.pile = doc.pile.filter((p) => p.photoId !== id);
      for (const s of doc.spreads) s.items = s.items.filter((p) => p.photoId !== id);
    }

    docStore.replace(doc);
    ui.set({
      selection: [],
      editingSpreadId: null,
      notice:
        `Opened “${file.name}” · ${ids.length - missing.size} photos. Undo to go back.` +
        (missing.size ? ` ${missing.size} photo${missing.size > 1 ? 's were' : ' was'} missing from the file.` : ''),
    });
  } finally {
    ui.set({ busy: null, importing: null });
  }
}

/** Project files are saved as .photo-sequence (a ZIP inside); plain .zip files are accepted too. */
export const PROJECT_EXTENSION = '.photo-sequence';
export const PROJECT_ACCEPT = `${PROJECT_EXTENSION},.zip,application/zip`;

export function isProjectFile(file: File): boolean {
  return (
    /\.(photo-sequence|zip)$/i.test(file.name) ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

function parseManifest(text: string): Manifest {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    throw new ProjectFileError('The project file is damaged.');
  }
  if (!isRecord(m) || m.format !== FORMAT || typeof m.version !== 'number' || !isRecord(m.files)) {
    throw new ProjectFileError("This file isn't a Photo Sequencer project.");
  }
  const d = m.doc;
  if (
    !isRecord(d) ||
    !isRecord(d.photos) ||
    !Array.isArray(d.pile) ||
    !Array.isArray(d.spreads) ||
    d.spreads.length < 2 ||
    !isRecord(d.settings)
  ) {
    throw new ProjectFileError('The project file is damaged.');
  }
  return m as unknown as Manifest;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A filename not yet in `used` (case-insensitively), made safe for any file system. */
export function uniqueName(name: string, id: string, used: Set<string>): string {
  const clean = name.replace(/[/\\:*?"<>|]/g, '_') || `${id}.jpg`;
  let result = clean;
  for (let n = 2; used.has(result.toLowerCase()); n++) {
    const dot = clean.lastIndexOf('.');
    result = dot > 0 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`;
  }
  used.add(result.toLowerCase());
  return result;
}

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    heic: 'image/heic',
  };
  return types[ext] ?? '';
}

/**
 * Before replacing the current project, confirm (offering to keep a copy first).
 * Resolves to whether to go ahead. `what` finishes "…will replace the project you're working on".
 */
export async function confirmReplace(title: string, what: string, confirmLabel: string): Promise<boolean> {
  // In the Mac app, a project saved to its file can't be lost.
  if (__NATIVE_APP__ && (await import('./document')).isSaved()) return true;
  const photoCount = Object.keys(docStore.doc.photos).length;
  const choice = await ask({
    title,
    message:
      `${what} will replace the project you're working on` +
      (photoCount ? ` (${photoCount} photo${photoCount === 1 ? '' : 's'}). ` : '. ') +
      (__NATIVE_APP__
        ? 'Changes that aren’t saved to its file will be lost. To keep them, save first.'
        : `You can bring it back with ${MOD_LABEL}Z, but not after you reload or close the page. ` +
          'To keep a copy, export it first.'),
    actions: [
      { label: 'Cancel', value: 'cancel' },
      ...(photoCount ? [{ label: __NATIVE_APP__ ? 'Save first' : 'Export current first', value: 'export' }] : []),
      { label: confirmLabel, value: 'replace', primary: true },
    ],
  });
  if (choice === 'export') return saveProjectFile();
  return choice === 'replace';
}

export async function openProjectFile(file: File): Promise<void> {
  const hasWork = Object.keys(docStore.doc.photos).length > 0;
  if (hasWork && !(await confirmReplace('Replace your current project?', `“${file.name}”`, 'Replace'))) return;
  try {
    await importProject(file);
    // Dropped or picked in the page, it has no place on disk to save back to.
    if (__NATIVE_APP__) (await import('./document')).forgetFile();
  } catch (e) {
    ui.set({ notice: e instanceof ProjectFileError ? e.message : `Couldn't open “${file.name}”.` });
  }
}

/** Start over with an empty project, after confirming. Undoable on the website. */
export async function newProject(): Promise<void> {
  if (!(await confirmReplace('Start a new project?', 'A new, empty project', 'New project'))) return;
  docStore.replace(emptyDoc());
  ui.set({ selection: [], editingSpreadId: null, modal: null });
  if (__NATIVE_APP__) (await import('./document')).forgetFile();
}

/**
 * Keep the project: in the Mac app, save it to its file; on the website, export a copy.
 * Resolves to whether it was saved.
 */
export async function saveProjectFile(): Promise<boolean> {
  if (__NATIVE_APP__) return (await import('./document')).save();
  if (ui.get().busy || ui.get().importing) return false;
  if (!Object.keys(docStore.doc.photos).length) {
    ui.set({ notice: 'Add some photos before exporting.' });
    return false;
  }
  try {
    return await exportProject();
  } catch (e) {
    ui.set({ notice: e instanceof ZipTooLargeError ? e.message : "Couldn't export the project." });
    return false;
  }
}

/** Save to a new file (Save As) in the Mac app; export a copy on the website. */
export async function saveProjectFileAs(): Promise<boolean> {
  if (__NATIVE_APP__) return (await import('./document')).saveAs();
  return saveProjectFile();
}
