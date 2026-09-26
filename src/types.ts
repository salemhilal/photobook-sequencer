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

export interface Settings {
  pageW: number;
  pageH: number;
  centerV: boolean;
  centerH: boolean;
  /** When the page size changes, move photos with the guides instead of keeping absolute positions. */
  keepRelative: boolean;
  /** Border guide insets, in inches from each page's outside edges. */
  borders: number[];
}

/**
 * The version of the saved project's shape. Bump it (and add a migration and a
 * test sample in schema.ts / schema.test.ts) whenever what gets saved changes.
 */
export const CURRENT_SCHEMA = 1;

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
