import type { Draft } from 'immer';
import { importFiles } from './images';
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
