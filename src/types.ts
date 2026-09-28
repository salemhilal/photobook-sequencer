/** All positions and sizes are in inches. */

export interface PhotoMeta {
  id: string;
  name: string;
  /** Pixel dimensions of the original, after EXIF orientation. */
  pxW: number;
  pxH: number;
}

export interface Placement {
  photoId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order; the most recently touched photo has the highest z. */
  z: number;
}

export type SpreadKind = 'first' | 'middle' | 'last';

/**
 * A spread's items use coordinates where x = 0 is the gutter
 * (left page spans -pageW..0, right page spans 0..pageW) and y = 0 is the top edge.
 * Anchoring to the gutter keeps layouts stable when the page size changes.
 */
export interface Spread {
  id: string;
  kind: SpreadKind;
  items: Placement[];
}

export type PageSide = 'left' | 'right';

/**
 * A border guide: a box inset from every page's edges, in inches. Inside is the edge at
 * the gutter, outside the one opposite, so the box mirrors on facing pages.
 */
export interface BorderGuide {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
}

/**
 * A straight guide across every page, mirrored on facing pages. A vertical guide's `at`
 * is inches from the page's outside edge; a horizontal guide's, from its top.
 */
export interface LineGuide {
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
}

/**
 * The version of the saved project's shape. Bump it (and add a migration and a
 * test sample in schema.ts / schema.test.ts) whenever what gets saved changes.
 */
export const CURRENT_SCHEMA = 2;

export interface Doc {
  /** Which shape this project was saved in; see CURRENT_SCHEMA. */
  schemaVersion: number;
  photos: Record<string, PhotoMeta>;
  /** Photos on the desktop; x/y are desk coordinates. */
  pile: Placement[];
  spreads: Spread[];
  settings: Settings;
  nextZ: number;
}
