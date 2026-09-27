import { current } from 'immer';
import { relayoutRect } from '../geometry';
import { docStore, useDoc } from '../store';
import type { Doc, Spread } from '../types';
import { NumberField } from './NumberField';

/**
 * The layout that a run of page-size edits is computed from. Relaying out from
 * this fixed starting point (rather than from the previous size) keeps edits order-independent
 * and exactly reversible. It resets when anything else changes the spreads.
 */
let resizeSession: { base: Doc; out: Spread[] } | null = null;

// Each field edit is one undo step (a gesture from focus to blur), and every
// value typed is computed from the session base, so intermediate values don't distort photos.
function setPageSize(dim: 'pageW' | 'pageH', n: number): void {
  const start = docStore.gestureStart;
  if (!resizeSession || (start.spreads !== resizeSession.out && start.spreads !== resizeSession.base.spreads)) {
    resizeSession = { base: start, out: start.spreads };
  }
  const base = resizeSession.base;
  docStore.preview((d) => {
    d.settings[dim] = n;
    if (!d.settings.keepRelative) return;
    const to = current(d.settings);
    for (const spread of d.spreads) {
      const baseItems = base.spreads.find((s) => s.id === spread.id)?.items;
      for (const item of spread.items) {
        const from = baseItems?.find((i) => i.photoId === item.photoId);
        if (from) Object.assign(item, relayoutRect(from, base.settings, to));
      }
    }
  });
  resizeSession.out = docStore.doc.spreads;
}

const fieldProps = {
  min: 1,
  suffix: '',
  onBegin: () => docStore.begin(),
  onEnd: () => docStore.end(),
};

/** Page width × height in inches. Used in Settings and on a new project's empty desk. */
export function PageSizeFields() {
  const { doc } = useDoc();
  return (
    <div className="inline">
      <NumberField label="W" {...fieldProps} value={doc.settings.pageW} onCommit={(n) => setPageSize('pageW', n)} />
      <NumberField label="H" {...fieldProps} value={doc.settings.pageH} onCommit={(n) => setPageSize('pageH', n)} />
      <span className="muted data">in</span>
    </div>
  );
}
