import type { GuideId, PhotoId, SpreadId } from './ids';

/** All positions and sizes are in inches. */

export interface PhotoMeta {
  id: PhotoId;
  name: string;
  /** Pixel dimensions of the original, after EXIF orientation. */
  pxW: number;
  pxH: number;
}

export interface Placement {
  photoId: PhotoId;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order; the most recently touched photo has the highest z. */
  z: number;
}

/**
 * A spread's items use coordinates where x = 0 is the gutter
 * (left page spans -pageW..0, right page spans 0..pageW) and y = 0 is the top edge.
 * Anchoring to the gutter keeps layouts stable when the page size changes.
 *
 * The book opens on a single right page (the first spread) and closes on a single left
 * page (the last); every spread between is a pair. Each kind has its own type, and its
 * own place in the Project, so one can't end up in another's.
 */
interface SpreadOf<K extends string> {
  kind: K;
  id: SpreadId;
  items: Placement[];
}
export type FirstSpread = SpreadOf<'first'>;
export type MiddleSpread = SpreadOf<'middle'>;
export type LastSpread = SpreadOf<'last'>;
export type Spread = FirstSpread | MiddleSpread | LastSpread;
export type SpreadKind = Spread['kind'];

export type PageSide = 'left' | 'right';

/**
 * Distances in inches from a page's edges. Inside is the edge at the gutter and outside
 * the one opposite, so they mirror on facing pages.
 */
export interface Edges {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
}

/**
 * A border guide: a box inset from every page's edges, either the same distance from
 * each (`even`, shown as linked) or its own distance per edge.
 */
export type BorderGuide = { id: GuideId } & ({ kind: 'even'; inset: number } | ({ kind: 'edges' } & Edges));

/**
 * A straight guide across every page, mirrored on facing pages. A vertical guide's `at`
 * is inches from the page's outside edge; a horizontal guide's, from its top.
 */
export interface LineGuide {
  id: GuideId;
  axis: 'vertical' | 'horizontal';
  at: number;
}

export interface Settings {
  pageW: number;
  pageH: number;
  centerV: boolean;
  centerH: boolean;
  /** When the page size changes, move photos with the guides instead of keeping absolute positions. */
  keepRelative: boolean;
  borders: BorderGuide[];
  lines: LineGuide[];
  /**
   * The border guide photos dropped on a page fit inside, by id. Null (or a guide that's
   * gone) means the one with the largest box; with no border guides, the page.
   */
  dropBorder: GuideId | null;
}

/**
 * The version of the saved project's shape. Bump it (and add a migration and a
 * test sample in schema.ts / schema.test.ts) whenever what gets saved changes.
 */
export const CURRENT_SCHEMA = 2;

export interface Project {
  /** Always the current shape: older ones are upgraded on load (see schema.ts). */
  schemaVersion: typeof CURRENT_SCHEMA;
  photos: Record<PhotoId, PhotoMeta>;
  /** Photos on the desktop; x/y are desk coordinates. */
  pile: Placement[];
  /** The book, in order: the first spread, the ones between, and the last (see `allSpreads`). */
  firstSpread: FirstSpread;
  spreads: MiddleSpread[];
  lastSpread: LastSpread;
  settings: Settings;
  nextZ: number;
}
