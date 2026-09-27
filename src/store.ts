import { useSyncExternalStore } from 'react';
import { produce, type Draft } from 'immer';
import { CURRENT_SCHEMA, type Doc } from './types';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1000;

type Recipe = (d: Draft<Doc>) => void;

export interface HistoryState {
  doc: Doc;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Document store with undo/redo.
 * - `apply` records a discrete change.
 * - `begin` / `preview` / `end` wrap a gesture (like a drag) so it records a single step.
 */
class DocStore {
  private past: Doc[] = [];
  private future: Doc[] = [];
  private present: Doc;
  private gestureBase: Doc | null = null;
  private lastCoalesce: { key: string; at: number } | null = null;
  private snapshot: HistoryState;
  private listeners = new Set<() => void>();

  constructor(initial: Doc) {
    this.present = initial;
    this.snapshot = this.makeSnapshot();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): HistoryState => this.snapshot;

  get doc(): Doc {
    return this.present;
  }

  /** The doc a gesture started from (or the present, outside a gesture). */
  get gestureStart(): Doc {
    return this.gestureBase ?? this.present;
  }

  /** Every doc still reachable through undo/redo. */
  allDocs(): Doc[] {
    return [...this.past, this.present, ...this.future, ...(this.gestureBase ? [this.gestureBase] : [])];
  }

  /**
   * Show `doc` in place of the project for a while (e.g. a demo), with its own history.
   * Returns a function that brings back the project exactly as it was, history included.
   */
  swap(doc: Doc): () => void {
    this.cancel();
    const { past, future, present } = this;
    this.reset(doc);
    return () => {
      this.cancel();
      this.past = past;
      this.future = future;
      this.present = present;
      this.lastCoalesce = null;
      this.emit();
    };
  }

  reset(doc: Doc): void {
    this.past = [];
    this.future = [];
    this.gestureBase = null;
    this.present = doc;
    this.emit();
  }

  apply(recipe: Recipe, opts: { coalesce?: string } = {}): void {
    const next = produce(this.present, recipe);
    if (next === this.present) return;
    const now = Date.now();
    const coalesce =
      opts.coalesce !== undefined &&
      this.lastCoalesce?.key === opts.coalesce &&
      now - this.lastCoalesce.at < COALESCE_MS;
    if (!coalesce) this.push(this.present);
    this.lastCoalesce = opts.coalesce !== undefined ? { key: opts.coalesce, at: now } : null;
    this.future = [];
    this.present = next;
    this.emit();
  }

  /** Replace the whole document as one undoable step (e.g. importing a project). */
  replace(doc: Doc): void {
    this.push(this.present);
    this.future = [];
    this.lastCoalesce = null;
    this.present = doc;
    this.emit();
  }

  /** Change the present without recording history (e.g. raising a clicked photo). */
  silent(recipe: Recipe): void {
    const next = produce(this.present, recipe);
    if (next === this.present) return;
    this.present = next;
    this.emit();
  }

  begin(): void {
    this.gestureBase = this.present;
  }

  /** Replace the gesture's result, starting over from the doc as it was at `begin`. */
  preview(recipe: Recipe): void {
    const base = this.gestureBase ?? this.present;
    this.present = produce(base, recipe);
    this.emit();
  }

  end(): void {
    const base = this.gestureBase;
    this.gestureBase = null;
    if (base && base !== this.present) {
      this.push(base);
      this.future = [];
      this.lastCoalesce = null;
    }
    this.emit();
  }

  cancel(): void {
    if (this.gestureBase) this.present = this.gestureBase;
    this.gestureBase = null;
    this.emit();
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.present);
    this.present = prev;
    this.lastCoalesce = null;
    this.emit();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.present);
    this.present = next;
    this.lastCoalesce = null;
    this.emit();
  }

  private push(doc: Doc): void {
    this.past.push(doc);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
  }

  private makeSnapshot(): HistoryState {
    return { doc: this.present, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
  }

  private emit(): void {
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) fn();
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyDoc(): Doc {
  return {
    schemaVersion: CURRENT_SCHEMA,
    photos: {},
    pile: [],
    spreads: [
      { id: newId(), kind: 'first', items: [] },
      { id: newId(), kind: 'middle', items: [] },
      { id: newId(), kind: 'middle', items: [] },
      { id: newId(), kind: 'last', items: [] },
    ],
    settings: { pageW: 10, pageH: 8, centerV: true, centerH: true, keepRelative: true, borders: [0.5, 1.25] },
    nextZ: 1,
  };
}

export const docStore = new DocStore(emptyDoc());

export function useDoc(): HistoryState {
  return useSyncExternalStore(docStore.subscribe, docStore.getSnapshot);
}

/** Tiny observable store for UI state that is not part of undo history. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    get: () => state,
    subscribe,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      for (const fn of listeners) fn();
    },
    use<U>(select: (s: T) => U): U {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(subscribe, () => select(state));
    },
  };
}
