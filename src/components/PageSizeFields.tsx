import { current } from 'immer';
import { clampBorder, relayoutRect } from '../geometry';
import { projectStore, useProject } from '../store';
import { NumberField } from './NumberField';
import { allSpreads } from '../spreads';

/**
 * Change the page size: one undo step, applied when the field is done (blur or Enter),
 * not as you type, so a half-typed size never moves photos or cuts guides down. Photos
 * keep their place relative to the guides (if chosen), and border guides stay on the page.
 */
function setPageSize(dim: 'pageW' | 'pageH', n: number): void {
  projectStore.apply((d) => {
    const from = current(d.settings);
    if (from[dim] === n) return;
    d.settings[dim] = n;
    const to = current(d.settings);
    if (to.keepRelative) {
      for (const item of allSpreads(d).flatMap((s) => s.items)) Object.assign(item, relayoutRect(item, from, to));
    }
    for (const b of d.settings.borders) clampBorder(b, to);
  });
}

/** Page width × height in inches. Used in Settings and on a new project's empty desk. */
export function PageSizeFields() {
  const { project } = useProject();
  return (
    <div className="inline">
      <NumberField
        label="W"
        min={1}
        suffix=""
        commitOnBlur
        value={project.settings.pageW}
        onCommit={(n) => setPageSize('pageW', n)}
      />
      <NumberField
        label="H"
        min={1}
        suffix=""
        commitOnBlur
        value={project.settings.pageH}
        onCommit={(n) => setPageSize('pageH', n)}
      />
      <span className="muted data">in</span>
    </div>
  );
}
