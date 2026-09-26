import { createStore } from './store';
import type { PageSide } from './types';

export interface DeskView {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Ghost {
  photoId: string;
  count: number;
  clientX: number;
  clientY: number;
  w: number;
  h: number;
}

/** What the pointer is over during a drag, as resolved by `hitTest`. */
export type DropTarget =
  | { kind: 'page'; spreadId: string; side: PageSide }
  | { kind: 'desk' }
  | { kind: 'strip' }
  | null;

export interface UiState {
  selection: string[];
  editingSpreadId: string | null;
  previewOpen: boolean;
  settingsOpen: boolean;
  view: DeskView;
  ghost: Ghost | null;
  /** `page:<spreadId>:<side>`, `desk`, or `strip` — for drop highlighting. */
  hoverKey: string | null;
  importing: { done: number; total: number } | null;
  notice: string | null;
}

export const ui = createStore<UiState>({
  selection: [],
  editingSpreadId: null,
  previewOpen: false,
  settingsOpen: false,
  view: { panX: 40, panY: 40, zoom: 1 },
  ghost: null,
  hoverKey: null,
  importing: null,
  notice: null,
});

/** Screen pixels per inch on the desk at zoom 1. */
export const DESK_PPI = 48;

export function targetKey(t: DropTarget): string | null {
  if (!t) return null;
  return t.kind === 'page' ? `page:${t.spreadId}:${t.side}` : t.kind;
}

/** Resolve the drop target under a client point via `data-drop` attributes. */
export function hitTest(clientX: number, clientY: number): DropTarget {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof HTMLElement)) continue;
    const kind = el.dataset.drop;
    if (kind === 'page') {
      const spreadId = el.dataset.spread;
      const side = el.dataset.side;
      if (spreadId && (side === 'left' || side === 'right')) return { kind: 'page', spreadId, side };
    }
    if (kind === 'desk') return { kind: 'desk' };
    if (kind === 'strip') return { kind: 'strip' };
    // A modal blocks targets beneath it.
    if (el.dataset.modal !== undefined) return null;
  }
  return null;
}

/** Converts client coordinates to desk inches; registered by the Desk component. */
export const deskGeometry = {
  toDesk: (clientX: number, clientY: number): { x: number; y: number } => ({ x: clientX, y: clientY }),
  /** Visible desk area in desk inches. */
  visible: (): { x: number; y: number; w: number; h: number } => ({ x: 0, y: 0, w: 20, h: 12 }),
};

export function isTyping(e: Event): boolean {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}
