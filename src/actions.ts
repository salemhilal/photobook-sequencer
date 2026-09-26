import type { Draft } from 'immer';
import { getImage, putImage } from './db';
import { importFiles, setUrl } from './images';
import { docStore, newId } from './store';
import { fitCentered, inset, largestBorder, pageRect, pileSize, PILE_PHOTO_SIZE } from './geometry';
import type { Doc, PageSide, PhotoMeta, Placement } from './types';
import { DESK_PPI, deskGeometry, ui } from './ui';

const CELL = 1.8;
const JITTER = 0.3;

/** Scatter new photos like prints on a desk: a loose grid with jitter, overlapping slightly. */
export function addPhotosToPile(photos: PhotoMeta[]): void {
  if (!photos.length) return;
  const vis = deskGeometry.visible();
  const cols = Math.max(3, Math.floor((vis.w - 0.5) / CELL));
  let top = vis.y + 0.4;
  const pile = docStore.doc.pile;
  if (pile.length) top = Math.max(...pile.map((p) => p.y + p.h)) + 0.6;
  const left = vis.x + 0.4;

  docStore.apply((d) => {
    photos.forEach((photo, i) => {
      d.photos[photo.id] = photo;
      const { w, h } = pileSize(photo);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = left + col * CELL + CELL / 2 + (Math.random() * 2 - 1) * JITTER;
      const cy = top + row * CELL + CELL / 2 + (Math.random() * 2 - 1) * JITTER;
      d.pile.push({ photoId: photo.id, x: cx - w / 2, y: cy - h / 2, w, h, z: d.nextZ++ });
    });
  });

  // Bring the new batch into view if it landed below the fold.
  const view = ui.get().view;
  const rows = Math.ceil(photos.length / cols);
  if (top > vis.y + vis.h - 1 && rows > 0) {
    ui.set({ view: { ...view, panY: view.panY - (top - vis.y - 0.4) * DESK_PPI * view.zoom } });
  }
}

/** Placement for a photo freshly dropped on a page: fit to the largest border guide, centered. */
export function placementOnPage(d: Draft<Doc> | Doc, photoId: string, side: PageSide): Placement | null {
  const photo = d.photos[photoId];
  if (!photo) return null;
  const page = pageRect(side, d.settings);
  const r = fitCentered(photo, inset(page, largestBorder(d.settings)), page);
  return { photoId, ...r, z: 0 };
}

export function bump(d: Draft<Doc>, p: Placement): void {
  p.z = d.nextZ++;
}

function removeFromSpreads(d: Draft<Doc>, photoId: string): void {
  for (const s of d.spreads) s.items = s.items.filter((i) => i.photoId !== photoId);
}

/** Recipe: put photos onto a page (from anywhere), each centered and fitted. */
export function putOnPage(d: Draft<Doc>, photoIds: string[], spreadId: string, side: PageSide): void {
  const spread = d.spreads.find((s) => s.id === spreadId);
  if (!spread) return;
  for (const id of photoIds) {
    const p = placementOnPage(d, id, side);
    if (!p) continue;
    d.pile = d.pile.filter((i) => i.photoId !== id);
    removeFromSpreads(d, id);
    p.z = d.nextZ++;
    spread.items.push(p);
  }
}

/** Recipe: add a spread before `index` and put photos on its left page. */
export function putOnNewSpread(d: Draft<Doc>, photoIds: string[], index: number): void {
  const i = Math.min(Math.max(1, index), d.spreads.length - 1);
  const id = newId();
  d.spreads.splice(i, 0, { id, kind: 'middle', items: [] });
  putOnPage(d, photoIds, id, 'left');
}

/** Recipe: return a photo to the pile, centered on a desk point (defaults to the visible center). */
export function putInPile(d: Draft<Doc>, photoId: string, at?: { x: number; y: number }): void {
  const photo = d.photos[photoId];
  if (!photo) return;
  removeFromSpreads(d, photoId);
  if (d.pile.some((p) => p.photoId === photoId)) return;
  const { w, h } = pileSize(photo);
  let c = at;
  if (!c) {
    const v = deskGeometry.visible();
    c = {
      x: v.x + v.w / 2 + (Math.random() - 0.5) * PILE_PHOTO_SIZE,
      y: v.y + v.h / 2 + (Math.random() - 0.5) * PILE_PHOTO_SIZE,
    };
  }
  d.pile.push({ photoId, x: c.x - w / 2, y: c.y - h / 2, w, h, z: d.nextZ++ });
}

const TIDY_GAP = 0.3;

/**
 * Arrange desk photos in a tidy grid, keeping their rough reading order
 * (rows top to bottom, then left to right). Tidies `photoIds` if given,
 * otherwise the whole pile. The grid starts at the photos' top-left corner;
 * rows that are wider than the visible desk wrap.
 */
export function tidyPile(photoIds?: string[]): void {
  const ids = photoIds && photoIds.length > 1 ? new Set(photoIds) : null;
  const items = docStore.doc.pile.filter((p) => !ids || ids.has(p.photoId));
  if (items.length < 2) return;

  const cell = Math.max(...items.map((p) => Math.max(p.w, p.h))) + TIDY_GAP;
  const cy = (p: Placement) => p.y + p.h / 2;
  const cx = (p: Placement) => p.x + p.w / 2;

  // Group into rows: a photo joins the current row if its center is within
  // half a cell of the row's first photo.
  const rows: Placement[][] = [];
  for (const p of [...items].sort((a, b) => cy(a) - cy(b))) {
    const row = rows.at(-1);
    if (row && cy(p) - cy(row[0]!) < cell / 2) row.push(p);
    else rows.push([p]);
  }

  const left = Math.min(...items.map((p) => p.x));
  const top = Math.min(...items.map((p) => p.y));
  const vis = deskGeometry.visible();
  const cols = Math.max(1, Math.floor((vis.x + vis.w - left) / cell));

  // Each existing row stays a row, wrapping if it's wider than the view.
  const slot = new Map<string, { col: number; row: number }>();
  let gridRow = 0;
  for (const row of rows) {
    row.sort((a, b) => cx(a) - cx(b)).forEach((p, i) => {
      slot.set(p.photoId, { col: i % cols, row: gridRow + Math.floor(i / cols) });
    });
    gridRow += Math.ceil(row.length / cols);
  }

  docStore.apply((d) => {
    for (const p of d.pile) {
      const at = slot.get(p.photoId);
      if (!at) continue;
      p.x = left + at.col * cell + (cell - TIDY_GAP - p.w) / 2;
      p.y = top + at.row * cell + (cell - TIDY_GAP - p.h) / 2;
    }
  });
}

/** "IMG_2103.jpg" → "IMG_2103 copy.jpg". */
export function copyName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
}

const DUPLICATE_OFFSET = 0.25;

/**
 * Duplicate a photo as a new, independent photo (with its own copy of the image data),
 * placed slightly offset from the original: on the desk, or on the same spread.
 */
export async function duplicatePhoto(photoId: string): Promise<string | null> {
  const img = await getImage(photoId);
  const meta = docStore.doc.photos[photoId];
  if (!img || !meta) return null;
  const id = newId();
  setUrl(id, img.thumb);
  // Reference the new photo before storing its image, so a background cleanup
  // of unreferenced images can't remove it in between.
  docStore.apply((d) => {
    d.photos[id] = { ...meta, id, name: copyName(meta.name) };
    const onDesk = d.pile.find((p) => p.photoId === photoId);
    if (onDesk) {
      d.pile.push({ ...onDesk, photoId: id, x: onDesk.x + DUPLICATE_OFFSET, y: onDesk.y + DUPLICATE_OFFSET, z: d.nextZ++ });
      return;
    }
    for (const s of d.spreads) {
      const onPage = s.items.find((p) => p.photoId === photoId);
      if (onPage) {
        s.items.push({ ...onPage, photoId: id, x: onPage.x + DUPLICATE_OFFSET, y: onPage.y + DUPLICATE_OFFSET, z: d.nextZ++ });
        return;
      }
    }
    putInPile(d, id);
  });
  await putImage(id, img);
  return id;
}

export function deleteFromProject(photoIds: string[]): void {
  const ids = new Set(photoIds);
  docStore.apply((d) => {
    d.pile = d.pile.filter((p) => !ids.has(p.photoId));
    for (const s of d.spreads) s.items = s.items.filter((p) => !ids.has(p.photoId));
    for (const id of ids) delete d.photos[id];
  });
  ui.set((s) => ({ selection: s.selection.filter((id) => !ids.has(id)) }));
}

/** Insert a new middle spread before `index`. First and last spreads stay put. */
export function insertSpread(index: number): void {
  docStore.apply((d) => {
    const i = Math.min(Math.max(1, index), d.spreads.length - 1);
    d.spreads.splice(i, 0, { id: newId(), kind: 'middle', items: [] });
  });
}

export function deleteSpread(spreadId: string): void {
  docStore.apply((d) => {
    const idx = d.spreads.findIndex((s) => s.id === spreadId);
    const spread = d.spreads[idx];
    if (!spread || spread.kind !== 'middle') return;
    const ids = spread.items.map((i) => i.photoId);
    d.spreads.splice(idx, 1);
    const v = deskGeometry.visible();
    ids.forEach((id, n) => {
      putInPile(d, id, {
        x: v.x + v.w / 2 + ((n % 4) - 1.5) * CELL + (Math.random() - 0.5) * JITTER,
        y: v.y + v.h / 2 + (Math.floor(n / 4) - 0.5) * CELL + (Math.random() - 0.5) * JITTER,
      });
    });
  });
  if (ui.get().editingSpreadId === spreadId) ui.set({ editingSpreadId: null });
}

/** Move a middle spread so it sits at `toIndex` (among all spreads) after removal. */
export function moveSpread(spreadId: string, toIndex: number): void {
  docStore.apply((d) => {
    const from = d.spreads.findIndex((s) => s.id === spreadId);
    const spread = d.spreads[from];
    if (!spread || spread.kind !== 'middle') return;
    d.spreads.splice(from, 1);
    const i = Math.min(Math.max(1, toIndex), d.spreads.length - 1);
    d.spreads.splice(i, 0, spread);
  });
}

/** Folio-style page labels, zero-padded like a book's: "01", "02–03", "08". */
export function folioLabel(index: number, total: number): string {
  const width = Math.max(2, String(total * 2).length);
  return spreadLabel(index, total)
    .split('–')
    .map((n) => n.padStart(width, '0'))
    .join('–');
}

/** Page labels, e.g. "1", "2–3", counting single first/last pages. */
export function spreadLabel(index: number, total: number): string {
  if (index === 0) return '1';
  const left = index * 2;
  if (index === total - 1) return String(left);
  return `${left}–${left + 1}`;
}

export async function importPhotos(files: File[]): Promise<void> {
  if (ui.get().importing) return;
  try {
    const { photos, failed } = await importFiles(files, (done, total) => ui.set({ importing: { done, total } }));
    addPhotosToPile(photos);
    if (failed.length) {
      ui.set({ notice: `Couldn't read ${failed.length} file${failed.length > 1 ? 's' : ''}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}` });
    }
  } finally {
    ui.set({ importing: null });
  }
}
