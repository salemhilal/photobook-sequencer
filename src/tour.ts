import { produce } from 'immer';
import { putOnPage } from './actions';
import { DESK_PPI } from './deskGeometry';
import { pileSize } from './geometry';
import { showUrl } from './images';
import { isMac } from './platform';
import { tourSeenPref } from './prefs';
import { docStore, emptyDoc } from './store';
import type { Doc, PhotoMeta } from './types';
import { ui, type Modal, type UiState } from './ui';
import taxi from './tour/taxi.jpg';
import spire from './tour/spire.jpg';
import reflections from './tour/reflections.jpg';
import leaves from './tour/leaves.jpg';
import lily from './tour/lily.jpg';
import door from './tour/door.jpg';

/**
 * The product tour: a few steps that each point at part of the app. While it runs,
 * a sample project stands in for the user's. Nothing is saved (see maySave), and the
 * user's project comes back, history and all, when the tour ends.
 */

export interface TourStep {
  title: string;
  body: string;
  /** CSS selector for what to highlight; none centers the card over everything. */
  target?: string;
  /** Open the spread editor on the sample spread. */
  editor?: boolean;
  modal?: Modal;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Photobook Sequencer',
    body: 'A tool for prototyping photo sequences. Here’s a quick look around, using a few sample photos. Your own work stays in this browser.',
  },
  {
    title: 'The desk',
    body: 'Add photos, or drop them here. Scroll or hold Space and drag to pan, pinch to zoom, and tap Space to see selected photos full-size. Right-click to tidy up.',
    target: '.desk',
  },
  {
    title: 'Spreads',
    body: 'Drag photos from the desk onto a page; they’re sized to fit its guides. Drag a spread’s handle to reorder it, or + to add one.',
    target: '.sidebar',
  },
  {
    title: 'Arrange a spread',
    body: 'Click a spread to open it. Move and resize photos; they snap to the page edges, center lines, and border guides.',
    target: '.modal.editor',
    editor: true,
  },
  {
    title: 'Settings',
    body: 'Set the page size and the border guides photos fit to, and change how the app looks.',
    target: '.modal.settings',
    modal: 'settings',
  },
  {
    title: 'Preview the book',
    body: 'Flip through it page by page, and save a PDF at true size.',
    target: '[data-tour="preview"]',
  },
  {
    title: 'Keep a copy',
    body: `Browsers can clear what sites store, so export your project now and then. It saves the photos and layout in one file. Hold ${isMac ? '⌘' : 'Ctrl'} to see every shortcut.`,
    target: '.toolbar .menu > .btn',
  },
];

const SAMPLES: [string, string][] = [
  ['taxi', taxi],
  ['spire', spire],
  ['reflections', reflections],
  ['door', door],
  ['leaves', leaves],
  ['lily', lily],
];
const SAMPLE_PX = { pxW: 795, pxH: 1200 };

/** The sample project: four photos on the desk, two on the first middle spread. */
export function sampleDoc(): Doc {
  const doc = emptyDoc();
  SAMPLES.forEach(([name], i) => {
    const photo: PhotoMeta = { id: `tour-${name}`, name: `${name}.jpg`, ...SAMPLE_PX };
    doc.photos[photo.id] = photo;
    if (i >= 4) return;
    const { w, h } = pileSize(photo);
    // A loose row, like prints set down by hand.
    doc.pile.push({ photoId: photo.id, x: 0.4 + i * 1.8, y: 0.4 + [0.1, 0, 0.25, 0.05][i]!, w, h, z: doc.nextZ++ });
  });
  return produce(doc, (d) => {
    const spread = d.spreads[1]!;
    putOnPage(d, ['tour-leaves'], spread.id, 'left');
    putOnPage(d, ['tour-lily'], spread.id, 'right');
  });
}

let restoreProject: (() => void) | null = null;
let before: Pick<UiState, 'view' | 'sidebarOpen'> | null = null;

export function startTour(): void {
  if (ui.get().tour !== null) return;
  tourSeenPref.save(true);
  for (const [name, url] of SAMPLES) showUrl(`tour-${name}`, url);
  const s = ui.get();
  before = { view: s.view, sidebarOpen: s.sidebarOpen };
  // Stop saving before the sample project is shown.
  ui.set({
    tour: 0,
    selection: [],
    modal: null,
    editingSpreadId: null,
    quickLook: null,
    contextMenu: null,
    sidebarOpen: true,
    view: frameSamples(),
  });
  restoreProject = docStore.swap(sampleDoc());
}

export function goToStep(index: number): void {
  const step = TOUR_STEPS[index];
  if (!step) return endTour();
  ui.set({
    tour: index,
    modal: step.modal ?? null,
    editingSpreadId: step.editor ? (docStore.doc.spreads[1]?.id ?? null) : null,
  });
}

export function endTour(): void {
  if (ui.get().tour === null) return;
  ui.set({ modal: null, editingSpreadId: null, selection: [], ...before });
  restoreProject?.();
  restoreProject = null;
  // Saving resumes only once the user's project is back.
  ui.set({ tour: null });
}

/** A view that shows the sample photos on the desk, whatever the window size. */
function frameSamples() {
  const desk = document.querySelector('.desk')?.getBoundingClientRect();
  const w = desk?.width ?? 800;
  const h = desk?.height ?? 600;
  const box = { w: 4 * 1.8 + 0.4, h: 2.8 };
  const zoom = Math.min(3, (w * 0.8) / (box.w * DESK_PPI), (h * 0.5) / (box.h * DESK_PPI));
  return { zoom, panX: (w - box.w * DESK_PPI * zoom) / 2, panY: (h - box.h * DESK_PPI * zoom) / 3 };
}
