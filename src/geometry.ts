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
