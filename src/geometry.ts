import type { PageSide, PhotoMeta, Settings, Spread, SpreadKind } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Longest edge of a photo when it lands on the desk. */
export const PILE_PHOTO_SIZE = 2;

export function pageSides(kind: SpreadKind): PageSide[] {
  if (kind === 'first') return ['right'];
  if (kind === 'last') return ['left'];
  return ['left', 'right'];
}

/** Page rectangle in gutter-relative spread coordinates. */
export function pageRect(side: PageSide, s: Settings): Rect {
  return { x: side === 'left' ? -s.pageW : 0, y: 0, w: s.pageW, h: s.pageH };
}

export function sideAt(x: number): PageSide {
  return x < 0 ? 'left' : 'right';
}

export function largestBorder(s: Settings): number {
  return s.borders.length ? Math.min(...s.borders) : 0;
}

export function inset(r: Rect, by: number): Rect {
  return { x: r.x + by, y: r.y + by, w: Math.max(0.1, r.w - 2 * by), h: Math.max(0.1, r.h - 2 * by) };
}

/** Largest rect with the photo's aspect ratio that fits in `box`, centered in `center`. */
export function fitCentered(photo: PhotoMeta, box: Rect, center: Rect = box): Rect {
  const aspect = photo.pxW / photo.pxH;
  let w = box.w;
  let h = w / aspect;
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  return { x: center.x + (center.w - w) / 2, y: center.y + (center.h - h) / 2, w, h };
}

export function pileSize(photo: PhotoMeta): { w: number; h: number } {
  const aspect = photo.pxW / photo.pxH;
  return aspect >= 1
    ? { w: PILE_PHOTO_SIZE, h: PILE_PHOTO_SIZE / aspect }
    : { w: PILE_PHOTO_SIZE * aspect, h: PILE_PHOTO_SIZE };
}

export interface GuideLines {
  xs: number[];
  ys: number[];
}

/** Visible guides for a spread: center lines and border boxes, per page. */
export function spreadGuides(spread: Spread, s: Settings): GuideLines {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const side of pageSides(spread.kind)) {
    const p = pageRect(side, s);
    if (s.centerV) xs.push(p.x + p.w / 2);
    for (const b of s.borders) xs.push(p.x + b, p.x + p.w - b);
  }
  if (s.centerH) ys.push(s.pageH / 2);
  for (const b of s.borders) ys.push(b, s.pageH - b);
  return { xs, ys };
}

/** Everything a photo can snap to: guides plus page edges (including the gutter). */
export function snapLines(spread: Spread, s: Settings): GuideLines {
  const g = spreadGuides(spread, s);
  const xs = [...g.xs];
  for (const side of pageSides(spread.kind)) {
    const p = pageRect(side, s);
    xs.push(p.x, p.x + p.w);
  }
  return { xs: unique(xs), ys: unique([...g.ys, 0, s.pageH]) };
}

function unique(v: number[]): number[] {
  return [...new Set(v.map((n) => Math.round(n * 1e6) / 1e6))];
}

interface SnapResult {
  delta: number;
  line: number | null;
}

/** Find the smallest adjustment that lands one of `points` on one of `lines`. */
export function snapPoints(points: number[], lines: number[], threshold: number): SnapResult {
  let best: SnapResult = { delta: 0, line: null };
  let bestDist = threshold;
  for (const p of points) {
    for (const l of lines) {
      const d = Math.abs(l - p);
      if (d <= bestDist) {
        bestDist = d;
        best = { delta: l - p, line: l };
      }
    }
  }
  return best;
}

export interface SnapFeedback {
  xs: number[];
  ys: number[];
}

/** Snap a moving rect's edges and center to guides. */
export function snapMove(r: Rect, lines: GuideLines, threshold: number): { rect: Rect; hit: SnapFeedback } {
  const sx = snapPoints([r.x, r.x + r.w / 2, r.x + r.w], lines.xs, threshold);
  const sy = snapPoints([r.y, r.y + r.h / 2, r.y + r.h], lines.ys, threshold);
  return {
    rect: { ...r, x: r.x + sx.delta, y: r.y + sy.delta },
    hit: { xs: sx.line === null ? [] : [sx.line], ys: sy.line === null ? [] : [sy.line] },
  };
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Resize `start` by dragging `corner` by (dx, dy), anchored at the opposite corner.
 * With `lockAspect`, the aspect ratio of `start` is preserved.
 */
export function resizeRect(
  start: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  lockAspect: boolean,
  lines: GuideLines | null,
  threshold: number,
): { rect: Rect; hit: SnapFeedback } {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const ax = west ? start.x + start.w : start.x;
  const ay = north ? start.y + start.h : start.y;
  let mx = (west ? start.x : start.x + start.w) + dx;
  let my = (north ? start.y : start.y + start.h) + dy;
  const hit: SnapFeedback = { xs: [], ys: [] };
  const min = 0.1;
  const aspect = start.w / start.h;

  const sx = lines ? snapPoints([mx], lines.xs, threshold) : { delta: 0, line: null };
  const sy = lines ? snapPoints([my], lines.ys, threshold) : { delta: 0, line: null };

  if (!lockAspect) {
    mx += sx.delta;
    my += sy.delta;
    if (sx.line !== null) hit.xs.push(sx.line);
    if (sy.line !== null) hit.ys.push(sy.line);
  } else {
    // Size follows whichever axis the pointer moved further along, or the axis that snapped.
    let w = Math.abs(mx - ax);
    let h = Math.abs(my - ay);
    const useX =
      sx.line !== null && (sy.line === null || Math.abs(sx.delta) <= Math.abs(sy.delta))
        ? true
        : sy.line !== null
          ? false
          : w / aspect >= h;
    if (useX) {
      if (sx.line !== null) {
        mx += sx.delta;
        hit.xs.push(sx.line);
      }
      w = Math.max(min, Math.abs(mx - ax));
      h = w / aspect;
    } else {
      if (sy.line !== null) {
        my += sy.delta;
        hit.ys.push(sy.line);
      }
      h = Math.max(min, Math.abs(my - ay));
      w = h * aspect;
    }
    mx = west ? ax - w : ax + w;
    my = north ? ay - h : ay + h;
  }

  const x1 = Math.min(ax, mx);
  const y1 = Math.min(ay, my);
  return {
    rect: {
      x: x1,
      y: y1,
      w: Math.max(min, Math.abs(mx - ax)),
      h: Math.max(min, Math.abs(my - ay)),
    },
    hit,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

type Knots = [old: number, next: number][];

/**
 * Guide positions along one axis for a run of pages, paired old → new:
 * page edges, border guides, and the page center.
 */
function axisKnots(pages: number[], oldSize: number, newSize: number, borders: number[]): Knots {
  const limit = Math.min(oldSize, newSize) / 2;
  const knots: Knots = [];
  for (const p of pages) {
    const o0 = p * oldSize;
    const n0 = p * newSize;
    knots.push([o0, n0], [o0 + oldSize / 2, n0 + newSize / 2], [o0 + oldSize, n0 + newSize]);
    for (const b of borders) {
      if (b <= 0 || b >= limit) continue;
      knots.push([o0 + b, n0 + b], [o0 + oldSize - b, n0 + newSize - b]);
    }
  }
  knots.sort((a, b) => a[0] - b[0]);
  return knots.filter((k, i) => i === 0 || k[0] - (knots[i - 1]?.[0] ?? -Infinity) > 1e-9);
}

/**
 * Piecewise-linear map through the knots. Guides land on guides; space between
 * them stretches proportionally. Beyond the outer page edges, offsets are kept.
 */
function mapAxis(v: number, knots: Knots): number {
  const first = knots[0];
  const last = knots[knots.length - 1];
  if (!first || !last) return v;
  if (v <= first[0]) return first[1] + (v - first[0]);
  if (v >= last[0]) return last[1] + (v - last[0]);
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1];
    const b = knots[i];
    if (!a || !b || v > b[0]) continue;
    const t = (v - a[0]) / (b[0] - a[0]);
    return a[1] + t * (b[1] - a[1]);
  }
  return v;
}

/**
 * Move a spread item (gutter-relative coordinates) so it keeps its relationship to the
 * page's guides after a page-size change. Its edges are mapped through the guides, and
 * the photo is refit into that box, keeping its proportions, around the box's center.
 */
export function relayoutRect(r: Rect, from: Settings, to: Settings): Rect {
  const borders = from.borders;
  const xs = axisKnots([-1, 0], from.pageW, to.pageW, borders);
  const ys = axisKnots([0], from.pageH, to.pageH, borders);
  const x1 = mapAxis(r.x, xs);
  const x2 = mapAxis(r.x + r.w, xs);
  const y1 = mapAxis(r.y, ys);
  const y2 = mapAxis(r.y + r.h, ys);
  const boxW = Math.max(0.1, x2 - x1);
  const boxH = Math.max(0.1, y2 - y1);
  const aspect = r.w / r.h;
  const w = Math.min(boxW, boxH * aspect);
  const h = w / aspect;
  return { x: (x1 + x2) / 2 - w / 2, y: (y1 + y2) / 2 - h / 2, w, h };
}
