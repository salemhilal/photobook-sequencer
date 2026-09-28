import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, X } from 'lucide-react';
import { bump, dropPhotos, folioLabel, putInPile, putOnPage, raise } from '../actions';
import { clearGhost, startDrag, trackGhost } from '../drag';
import {
  borderBox,
  edgesOf,
  fitCentered,
  fmt,
  pageRect,
  resizeRect,
  sideAt,
  snapLines,
  snapMove,
  type Corner,
  type Rect,
  type SnapFeedback,
} from '../geometry';
import type { Draft } from 'immer';
import type { PhotoId, SpreadId } from '../ids';
import { allSpreads, findSpread } from '../spreads';
import { projectStore, useProject } from '../store';
import type { BorderGuide, Project, Placement } from '../types';
import { isTyping } from '../input';
import { openPhotoMenu, toggleGuides, ui } from '../ui';
import { shortcutLabel } from '../commands';
import { useWindowEvent } from '../hooks';
import { NumberField } from './NumberField';
import { PhotoImg } from './PhotoImg';
import { SpreadCanvas } from './SpreadCanvas';

const PAD = 0.75;
const SNAP_PX = 8;
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const NUDGE = 1 / 16;
const NUDGE_BIG = 1 / 2;

export function SpreadEditor({ spreadId }: { spreadId: SpreadId }) {
  const { project } = useProject();
  const book = allSpreads(project);
  const index = book.findIndex((s) => s.id === spreadId);
  const spread = book[index];
  const { settings } = project;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 500 });
  const [selected, setSelected] = useState<PhotoId | null>(null);
  const [snapHit, setSnapHit] = useState<SnapFeedback | null>(null);
  /**
   * A guide box to glow while a Fit button is hovered, for the photo it was for: the
   * button can vanish under the pointer (the photo deselected) without a pointerleave.
   */
  const [hovered, setHovered] = useState<{ photoId: PhotoId; box: Rect } | null>(null);
  const glow = hovered && hovered.photoId === selected ? hovered.box : null;
  const guidesHidden = ui.use((s) => s.guidesHidden);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setStage({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.max(4, Math.min(stage.w / (2 * settings.pageW + 2 * PAD), stage.h / (settings.pageH + 2 * PAD)));

  const selectedItem = spread?.items.find((i) => i.photoId === selected) ?? null;

  const close = () => ui.set({ editingSpreadId: null });
  const go = (delta: number) => {
    const next = book[index + delta];
    if (next) {
      setSelected(null);
      ui.set({ editingSpreadId: next.id });
    }
  };

  const updateItem = (photoId: PhotoId, patch: Partial<Placement>, coalesce?: string) =>
    projectStore.apply(
      (d) => {
        const item = findItem(d, spreadId, photoId);
        if (item) Object.assign(item, patch);
      },
      coalesce ? { coalesce } : {},
    );

  const toPile = (photoId: PhotoId) => {
    projectStore.apply((d) => putInPile(d, photoId));
    setSelected(null);
  };

  // The editor's own keys; the desk's shortcuts are paused while it's open.
  useWindowEvent('keydown', (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    if (ui.get().modal) return;
    const d = projectStore.project;
    const item = selected ? findItem(d, spreadId, selected) : null;
    if (e.key === 'Escape') {
      if (selected) setSelected(null);
      else close();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
      e.preventDefault();
      toPile(item.photoId);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (!item) {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
        return;
      }
      const n = e.shiftKey ? NUDGE_BIG : NUDGE;
      const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
      const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
      updateItem(item.photoId, { x: item.x + dx, y: item.y + dy }, `nudge:${item.photoId}`);
    }
  });

  if (!spread) return null;
  // Hidden guides aren't snapped to either: only the page edges are.
  const lines = snapLines(
    spread,
    guidesHidden ? { ...settings, centerV: false, centerH: false, borders: [], lines: [] } : settings,
  );
  const threshold = SNAP_PX / scale;

  const onItemDown = (e: React.PointerEvent, p: Placement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(p.photoId);
    const start: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    startDrag(e, {
      onStart: () => projectStore.begin(),
      onMove: ({ e: ev, dx, dy }) => {
        trackGhost(ev, null);
        const moved = { ...start, x: start.x + dx / scale, y: start.y + dy / scale };
        const { rect, hit } = ev.altKey ? { rect: moved, hit: null } : snapMove(moved, lines, threshold);
        setSnapHit(hit);
        projectStore.preview((d) => {
          const item = findItem(d, spreadId, p.photoId);
          if (!item) return;
          item.x = rect.x;
          item.y = rect.y;
          bump(d, item);
        });
      },
      onEnd: ({ e: ev }, moved) => {
        setSnapHit(null);
        if (!moved) {
          projectStore.silent((d) => {
            const spread = findSpread(d, spreadId);
            const item = spread?.items.find((i) => i.photoId === p.photoId);
            if (spread && item) raise(d, spread.items, item);
          });
          return;
        }
        const target = trackGhost(ev, null);
        clearGhost();
        // Moves within the spread stay put; dropping on the desk strip returns the photo to the desk.
        if (target?.kind === 'strip') {
          projectStore.preview((d) => void dropPhotos(d, target, [p.photoId]));
          setSelected(null);
        }
        projectStore.end();
      },
      onCancel: () => {
        setSnapHit(null);
        clearGhost();
        projectStore.cancel();
      },
    });
  };

  const onHandleDown = (e: React.PointerEvent, p: Placement, corner: Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    startDrag(e, {
      onStart: () => projectStore.begin(),
      onMove: ({ e: ev, dx, dy }) => {
        const { rect, hit } = resizeRect(
          p,
          corner,
          dx / scale,
          dy / scale,
          !ev.shiftKey,
          ev.altKey ? null : lines,
          threshold,
        );
        setSnapHit(hit);
        projectStore.preview((d) => {
          const item = findItem(d, spreadId, p.photoId);
          if (item) Object.assign(item, rect);
        });
      },
      onEnd: (_, moved) => {
        setSnapHit(null);
        if (moved) projectStore.end();
      },
      onCancel: () => {
        setSnapHit(null);
        projectStore.cancel();
      },
    });
  };

  const renderItem = (p: Placement, style: CSSProperties) => (
    <div
      key={p.photoId}
      className={`item${p.photoId === selected ? ' selected' : ''}`}
      style={style}
      onPointerDown={(e) => onItemDown(e, p)}
      onContextMenu={(e) => openPhotoMenu(e, p.photoId)}
    >
      <PhotoImg id={p.photoId} />
      {p.photoId === selected &&
        CORNERS.map((c) => (
          <div key={c} className={`handle handle-${c}`} onPointerDown={(e) => onHandleDown(e, p, c)} />
        ))}
    </div>
  );

  const label = folioLabel(index, book.length);

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal editor" data-modal>
        <header className="modal-head">
          <button className="btn ghost icon" aria-label="Previous spread" disabled={index === 0} onClick={() => go(-1)}>
            <ChevronLeft />
          </button>
          <div className="modal-title">
            <span className="folio">{label}</span>
            <span className="muted data">
              {fmt(settings.pageW)} × {fmt(settings.pageH)} in
            </span>
          </div>
          <button
            className="btn ghost icon"
            aria-label="Next spread"
            disabled={index === book.length - 1}
            onClick={() => go(1)}
          >
            <ChevronRight />
          </button>
          <span className="spacer" />
          <span className="hint">Shift: free resize · Alt: no snapping · Arrows nudge</span>
          <button
            className={`btn ghost icon${guidesHidden ? ' active' : ''}`}
            aria-label={guidesHidden ? 'Show guides' : 'Hide guides'}
            aria-pressed={guidesHidden}
            title={`${guidesHidden ? 'Show' : 'Hide'} guides (${shortcutLabel('toggleGuides')})`}
            onClick={toggleGuides}
          >
            {guidesHidden ? <EyeOff /> : <Eye />}
          </button>
          <button className="btn ghost icon" aria-label="Close" onClick={close}>
            <X />
          </button>
        </header>
        <div className="editor-body">
          <div className="editor-stage" ref={stageRef}>
            <div className="stage-center">
              <SpreadCanvas
                spread={spread}
                settings={settings}
                scale={scale}
                pad={PAD}
                guides={!guidesHidden}
                droppable
                snapHit={snapHit}
                renderItem={renderItem}
                overlay={
                  glow && (
                    <div
                      className="guide-glow"
                      style={{
                        left: (PAD + settings.pageW + glow.x) * scale,
                        top: (PAD + glow.y) * scale,
                        width: glow.w * scale,
                        height: glow.h * scale,
                      }}
                    />
                  )
                }
                onPointerDown={() => setSelected(null)}
              />
            </div>
          </div>
          <Inspector
            project={project}
            item={selectedItem}
            onChange={(patch, key) => selectedItem && updateItem(selectedItem.photoId, patch, key)}
            onToPile={() => selectedItem && toPile(selectedItem.photoId)}
            onHoverBox={(box) => setHovered(box && selectedItem ? { photoId: selectedItem.photoId, box } : null)}
          />
        </div>
        <PileStrip spreadId={spreadId} />
      </div>
    </div>
  );
}

/** A Fit button's name for a border guide: its distance, or the range of its distances. */
function guideLabel(g: BorderGuide): string {
  if (g.kind === 'even') return `Fit ${fmt(g.inset)} in guide`;
  const d = Object.values(edgesOf(g));
  return `Fit ${fmt(Math.min(...d))}–${fmt(Math.max(...d))} in guide`;
}

/** A border guide's distances, for a tooltip: top, outside, bottom, inside. */
function guideSummary(g: BorderGuide): string {
  const e = edgesOf(g);
  return `Top ${fmt(e.top)} · Outside ${fmt(e.outside)} · Bottom ${fmt(e.bottom)} · Inside ${fmt(e.inside)} in`;
}

function findItem(d: Project | Draft<Project>, spreadId: SpreadId, photoId: PhotoId): Placement | undefined {
  return findSpread(d, spreadId)?.items.find((i) => i.photoId === photoId);
}

interface InspectorProps {
  project: Project;
  item: Placement | null;
  onChange: (patch: Partial<Placement>, coalesce?: string) => void;
  onToPile: () => void;
  /** A Fit button's box while it's hovered (null when it isn't), to show which guide it means. */
  onHoverBox: (box: Rect | null) => void;
}

function Inspector({ project, item, onChange, onToPile, onHoverBox }: InspectorProps) {
  const [lock, setLock] = useState(true);
  const { settings } = project;
  if (!item) {
    return (
      <aside className="inspector">
        <p className="muted">Select a photo to adjust its position and size.</p>
        <p className="muted">Drag photos in from the desk strip below, or drag one onto the strip to send it back.</p>
      </aside>
    );
  }
  const side = sideAt(item.x + item.w / 2);
  const page = pageRect(side, settings);
  const photo = project.photos[item.photoId];
  const aspect = item.w / item.h;
  const key = (f: string) => `inspect:${item.photoId}:${f}`;
  const fit = (box: Rect) => onChange(fitCentered({ pxW: item.w, pxH: item.h }, box, page));
  // Largest box first, as before per-edge guides: the outermost guide at the top.
  const boxes = settings.borders
    .map((g) => ({ g, box: borderBox(side, settings, g) }))
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const ppi = photo ? Math.round(photo.pxW / item.w) : null;

  return (
    <aside className="inspector">
      <div className="inspector-name" title={photo?.name}>
        {photo?.name}
      </div>
      <div className="muted small">{side === 'left' ? 'Left' : 'Right'} page · measured from its top-left corner</div>
      <div className="grid2">
        <NumberField label="X" value={item.x - page.x} onCommit={(n) => onChange({ x: page.x + n }, key('x'))} />
        <NumberField label="Y" value={item.y} onCommit={(n) => onChange({ y: n }, key('y'))} />
        <NumberField
          label="W"
          min={0.1}
          value={item.w}
          onCommit={(n) => onChange(lock ? { w: n, h: n / aspect } : { w: n }, key('w'))}
        />
        <NumberField
          label="H"
          min={0.1}
          value={item.h}
          onCommit={(n) => onChange(lock ? { h: n, w: n * aspect } : { h: n }, key('h'))}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Keep proportions
      </label>
      {ppi !== null && (
        <div className={`small ${ppi < 200 ? 'warn' : 'muted'}`}>
          <span className="data">{ppi} ppi</span>
          {ppi < 200 ? ' · may print soft' : ''}
        </div>
      )}
      <div className="inspector-actions">
        <button
          className="btn"
          onClick={() => onChange({ x: page.x + (page.w - item.w) / 2, y: (page.h - item.h) / 2 })}
        >
          Center on page
        </button>
        <button
          className="btn"
          onClick={() => fit(page)}
          onPointerEnter={() => onHoverBox(page)}
          onPointerLeave={() => onHoverBox(null)}
        >
          Fit page
        </button>
        {boxes.map(({ g, box }) => (
          <button
            key={g.id}
            className="btn"
            onClick={() => fit(box)}
            onPointerEnter={() => onHoverBox(box)}
            onPointerLeave={() => onHoverBox(null)}
            title={g.kind === 'edges' ? guideSummary(g) : undefined}
          >
            {guideLabel(g)}
          </button>
        ))}
        <button className="btn" onClick={onToPile}>
          Return to desk
        </button>
      </div>
    </aside>
  );
}

function PileStrip({ spreadId }: { spreadId: SpreadId }) {
  const { project } = useProject();
  const hover = ui.use((s) => s.hover?.kind === 'strip');
  const pile = [...project.pile].sort((a, b) => a.y - b.y || a.x - b.x);

  const onDown = (e: React.PointerEvent, p: Placement) => {
    if (e.button !== 0) return;
    const w = 110;
    const ghost = { photoId: p.photoId, count: 1, w, h: (w * p.h) / p.w };
    startDrag(e, {
      onMove: ({ e: ev }) => trackGhost(ev, ghost),
      onEnd: ({ e: ev }, moved) => {
        const target = trackGhost(ev, null);
        clearGhost();
        if (!moved) {
          // A click places the photo on the first empty page, or the right page.
          const spread = findSpread(projectStore.project, spreadId);
          if (!spread) return;
          const side = spread.kind === 'last' ? 'left' : spread.kind === 'first' ? 'right' : 'left';
          const taken = spread.items.some((i) => sideAt(i.x + i.w / 2) === side);
          const pick = spread.kind === 'middle' && taken ? 'right' : side;
          projectStore.apply((d) => putOnPage(d, [p.photoId], spreadId, pick));
          return;
        }
        if (target?.kind === 'page') projectStore.apply((d) => void dropPhotos(d, target, [p.photoId]));
      },
      onCancel: clearGhost,
    });
  };

  return (
    <div className={`strip${hover ? ' drop-hover' : ''}`} data-drop="strip">
      <div className="strip-label caps">Desk · {pile.length}</div>
      <div className="strip-items">
        {pile.length === 0 ? (
          <span className="muted small">Empty. Drag a photo here to send it back to the desk.</span>
        ) : (
          pile.map((p) => (
            <div
              key={p.photoId}
              className="strip-item"
              style={{ width: (56 * p.w) / p.h }}
              onPointerDown={(e) => onDown(e, p)}
              onContextMenu={(e) => openPhotoMenu(e, p.photoId)}
              title="Drag onto a page, or click to add"
            >
              <PhotoImg id={p.photoId} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
