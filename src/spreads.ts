import type { Draft } from 'immer';
import type { SpreadId } from './ids';
import type { Project } from './types';

/**
 * The book's spreads in order. The Project keeps the first, middle, and last spreads apart
 * (so each stays in its place); these read them as one book. Indexes elsewhere (spread
 * labels, the sidebar, the editor's back and forth) count through this order.
 */

type AnySpread<D extends Project | Draft<Project>> = D['firstSpread'] | D['spreads'][number] | D['lastSpread'];

/** Every spread, first to last. */
export function allSpreads<D extends Project | Draft<Project>>(d: D): AnySpread<D>[] {
  return [d.firstSpread, ...d.spreads, d.lastSpread];
}

export function findSpread<D extends Project | Draft<Project>>(d: D, id: SpreadId): AnySpread<D> | undefined {
  return allSpreads(d).find((s) => s.id === id);
}

/**
 * Where a spread inserted before book position `index` goes among the middle spreads:
 * never before the first spread or after the last.
 */
export function middleIndex(d: Project | Draft<Project>, index: number): number {
  return Math.min(Math.max(0, index - 1), d.spreads.length);
}
