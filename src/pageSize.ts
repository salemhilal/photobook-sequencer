import { clampBorder, relayoutRect } from './geometry';
import { allSpreads, findSpread } from './spreads';
import { projectStore } from './store';
import type { Project } from './types';

/**
 * The project a run of page-size edits is computed from. Relaying out from this fixed
 * starting point (not from the previous size) keeps a run of edits order-independent and
 * exactly reversible: 10 → 8 → 10 puts every photo, and every border guide, back where it
 * was. The run ends when anything else changes the project.
 */
let resizeRun: { base: Project; out: Project } | null = null;

/**
 * Change the page size: one undo step, applied when the field is done (blur or Enter),
 * not as you type, so a half-typed size never moves photos or cuts guides down. Photos
 * keep their place relative to the guides (if chosen), and border guides stay on the page.
 */
export function setPageSize(dim: 'pageW' | 'pageH', n: number): void {
  const now = projectStore.project;
  if (now.settings[dim] === n) return;
  if (resizeRun?.out !== now) resizeRun = { base: now, out: now };
  const { base } = resizeRun;
  projectStore.apply((d) => {
    const to = { ...base.settings, pageW: d.settings.pageW, pageH: d.settings.pageH, [dim]: n };
    d.settings.pageW = to.pageW;
    d.settings.pageH = to.pageH;
    // From the run's start, not from now: each guide and photo as it was before the run.
    d.settings.borders = base.settings.borders.map((b) => {
      const g = { ...b };
      clampBorder(g, to);
      return g;
    });
    if (!to.keepRelative) return;
    for (const spread of allSpreads(d)) {
      const was = findSpread(base, spread.id);
      for (const item of spread.items) {
        const from = was?.items.find((i) => i.photoId === item.photoId);
        if (from) Object.assign(item, relayoutRect(from, base.settings, to));
      }
    }
  });
  resizeRun.out = projectStore.project;
}
