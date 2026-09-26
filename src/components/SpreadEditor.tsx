import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { bump, folioLabel, putInPile, putOnPage } from '../actions';
import { clearGhost, startDrag, trackGhost } from '../drag';
import {
  fitCentered,
  fmt,
  inset,
  pageRect,
  resizeRect,
  sideAt,
  snapLines,
  snapMove,
  type Corner,
  type Rect,
  type SnapFeedback,
} from '../geometry';
import { docStore, useDoc } from '../store';
import type { Doc, Placement, Spread } from '../types';
import { isTyping } from '../platform';
import { openPhotoMenu, ui } from '../ui';
import { NumberField } from './NumberField';
import { PhotoImg } from './PhotoImg';
import { SpreadCanvas } from './SpreadCanvas';

const PAD = 0.75;
const SNAP_PX = 8;
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const NUDGE = 1 / 16;
const NUDGE_BIG = 1 / 2;

export function SpreadEditor({ spreadId }: { spreadId: string }) {
  const { doc } = useDoc();
  const index = doc.spreads.findIndex((s) => s.id === spreadId);
  const spread = doc.spreads[index];
  const { settings } = doc;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 500 });
  const [selected, setSelected] = useState<string | null>(null);
  const [snapHit, setSnapHit] = useState<SnapFeedback | null>(null);

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
    const next = doc.spreads[index + delta];
    if (next) {
      setSelected(null);
      ui.set({ editingSpreadId: next.id });
    }
  };

  const updateItem = (photoId: string, patch: Partial<Placement>, coalesce?: string) =>
    docStore.apply(
      (d) => {
        const item = findItem(d, spreadId, photoId);
        if (item) Object.assign(item, patch);
      },
      coalesce ? { coalesce } : {},
    );

  const toPile = (photoId: string) => {
    docStore.apply((d) => putInPile(d, photoId));
    setSelected(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      if (ui.get().modal) return;
      const d = docStore.doc;
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!spread) return null;
  const lines = snapLines(spread, settings);
  const threshold = SNAP_PX / scale;

  const onItemDown = (e: React.PointerEvent, p: Placement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(p.photoId);
    const start: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
    startDrag(e, {
      onStart: () => docStore.begin(),
      onMove: ({ e: ev, dx, dy }) => {
        trackGhost(ev, null);
        const moved = { ...start, x: start.x + dx / scale, y: start.y + dy / scale };
        const { rect, hit } = ev.altKey ? { rect: moved, hit: null } : snapMove(moved, lines, threshold);
        setSnapHit(hit);
        docStore.preview((d) => {
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
          docStore.silent((d) => {
            const item = findItem(d, spreadId, p.photoId);
            if (item) bump(d, item);
          });
          return;
        }
        const target = trackGhost(ev, null);
        clearGhost();
        if (target?.kind === 'strip') {
          docStore.preview((d) => putInPile(d, p.photoId));
          setSelected(null);
        }
        docStore.end();
      },
      onCancel: () => {
        setSnapHit(null);
        clearGhost();
        docStore.cancel();
      },
    });
  };

  const onHandleDown = (e: React.PointerEvent, p: Placement, corner: Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    startDrag(e, {
      onStart: () => docStore.begin(),
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
        docStore.preview((d) => {
          const item = findItem(d, spreadId, p.photoId);
          if (item) Object.assign(item, rect);
        });
      },
      onEnd: (_, moved) => {
        setSnapHit(null);
        if (moved) docStore.end();
      },
      onCancel: () => {
        setSnapHit(null);
        docStore.cancel();
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

  const label = folioLabel(index, doc.spreads.length);

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
            disabled={index === doc.spreads.length - 1}
            onClick={() => go(1)}
          >
            <ChevronRight />
          </button>
          <span className="spacer" />
          <span className="hint">Shift: free resize · Alt: no snapping · Arrows nudge</span>
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
                guides
                droppable
                snapHit={snapHit}
                renderItem={renderItem}
                onPointerDown={() => setSelected(null)}
              />
            </div>
          </div>
          <Inspector
            doc={doc}
            spread={spread}
            item={selectedItem}
            onChange={(patch, key) => selectedItem && updateItem(selectedItem.photoId, patch, key)}
            onToPile={() => selectedItem && toPile(selectedItem.photoId)}
          />
        </div>
        <PileStrip spreadId={spreadId} />
      </div>
    </div>
  );
}

function findItem(d: Doc, spreadId: string, photoId: string): Placement | undefined {
  return d.spreads.find((s) => s.id === spreadId)?.items.find((i) => i.photoId === photoId);
}

interface InspectorProps {
  doc: Doc;
  spread: Spread;
  item: Placement | null;
  onChange: (patch: Partial<Placement>, coalesce?: string) => void;
  onToPile: () => void;
}

function Inspector({ doc, item, onChange, onToPile }: InspectorProps) {
  const [lock, setLock] = useState(true);
  const { settings } = doc;
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
  const photo = doc.photos[item.photoId];
  const aspect = item.w / item.h;
  const key = (f: string) => `inspect:${item.photoId}:${f}`;
  const fit = (by: number) => {
    const r = fitCentered({ id: '', name: '', pxW: item.w, pxH: item.h }, inset(page, by), page);
    onChange(r);
  };
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
        <button className="btn" onClick={() => fit(0)}>
          Fit page
        </button>
        {[...settings.borders]
          .sort((a, b) => a - b)
          .map((b, i) => (
            <button key={i} className="btn" onClick={() => fit(b)}>
              Fit {fmt(b)} in guide
            </button>
          ))}
        <button className="btn" onClick={onToPile}>
          Return to desk
        </button>
      </div>
    </aside>
  );
}

function PileStrip({ spreadId }: { spreadId: string }) {
  const { doc } = useDoc();
  const hover = ui.use((s) => s.hoverKey === 'strip');
  const pile = [...doc.pile].sort((a, b) => a.y - b.y || a.x - b.x);

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
          const spread = docStore.doc.spreads.find((s) => s.id === spreadId);
          if (!spread) return;
          const side = spread.kind === 'last' ? 'left' : spread.kind === 'first' ? 'right' : 'left';
          const taken = spread.items.some((i) => sideAt(i.x + i.w / 2) === side);
          const pick = spread.kind === 'middle' && taken ? 'right' : side;
          docStore.apply((d) => putOnPage(d, [p.photoId], spreadId, pick));
          return;
        }
        if (target?.kind === 'page') docStore.apply((d) => putOnPage(d, [p.photoId], target.spreadId, target.side));
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
