import { getImage, putImage } from './db';
import { setUrl, thumbFromBlob } from './images';
import { docStore, migrateDoc } from './store';
import type { Doc } from './types';
import { ask, MOD_LABEL, ui } from './ui';
import { createZip, readZip, type ZipInput } from './zip';

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

export async function exportProject(): Promise<void> {
  const doc = docStore.doc;
  const ids = Object.keys(doc.photos);
  const entries: ZipInput[] = [];
  const files: Manifest['files'] = {};
  const usedNames = new Set<string>();

  const setBusy = (busy: string | null) => ui.set({ busy });
  try {
    setBusy('Preparing export…');
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
      setBusy(`Exporting ${Math.min(photoCount, Math.floor(done / 2))} of ${photoCount}…`),
    );
    download(zip, `photo-book-${new Date().toISOString().slice(0, 10)}.zip`);
  } finally {
    setBusy(null);
  }
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
    if (manifest.version > VERSION) {
      throw new ProjectFileError('This project was made by a newer version of Photo Sequencer.');
    }

    const doc = migrateDoc(manifest.doc);
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

export function isProjectFile(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
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

function uniqueName(name: string, id: string, used: Set<string>): string {
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

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Import with confirmation and user-facing errors. */
export async function openProjectFile(file: File): Promise<void> {
  const photoCount = Object.keys(docStore.doc.photos).length;
  if (photoCount > 0) {
    const choice = await ask({
      title: 'Replace your current project?',
      message:
        `“${file.name}” will replace the project you're working on (${photoCount} photo${photoCount === 1 ? '' : 's'}). ` +
        `You can bring it back with ${MOD_LABEL}Z, but not after you reload or close the page. ` +
        'To keep a copy, export it first.',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Export current first', value: 'export' },
        { label: 'Replace', value: 'replace', primary: true },
      ],
    });
    if (choice === 'export') {
      if (!(await saveProjectFile())) return;
    } else if (choice !== 'replace') {
      return;
    }
  }
  try {
    await importProject(file);
  } catch (e) {
    ui.set({ notice: e instanceof ProjectFileError ? e.message : `Couldn't open “${file.name}”.` });
  }
}

/** Export with user-facing errors. Resolves to whether the export succeeded. */
export async function saveProjectFile(): Promise<boolean> {
  if (ui.get().busy || ui.get().importing) return false;
  if (!Object.keys(docStore.doc.photos).length) {
    ui.set({ notice: 'Add some photos before exporting.' });
    return false;
  }
  try {
    await exportProject();
    return true;
  } catch (e) {
    ui.set({ notice: e instanceof Error && e.name === 'Error' ? e.message : "Couldn't export the project." });
    return false;
  }
}
