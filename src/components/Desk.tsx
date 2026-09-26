import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { bump, importPhotos, putOnNewSpread, putOnPage } from '../actions';
import { isProjectFile, openProjectFile } from '../project';
import { clearGhost, startDrag, trackGhost } from '../drag';
import { intersects, resizeRect, type Corner, type Rect } from '../geometry';
import { docStore, useDoc } from '../store';
import type { Placement } from '../types';
import { DESK_PPI, deskGeometry, isTyping, ui } from '../ui';
import { PhotoImg } from './PhotoImg';

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const GHOST_MAX = 140;

export function Desk({ onAddPhotos }: { onAddPhotos: () => void }) {
  const { doc } = useDoc();
  const view = ui.use((s) => s.view);
  const selection = ui.use((s) => s.selection);
  const hover = ui.use((s) => s.hoverKey === 'desk');
  const ref = useRef<HTMLDivElement>(null);
  const spaceHeld = useRef(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [panning, setPanning] = useState(false);

  useLayoutEffect(() => {
    deskGeometry.toDesk = (cx, cy) => {
      const r = ref.current?.getBoundingClientRect();
      const v = ui.get().view;
      const k = DESK_PPI * v.zoom;
      return { x: (cx - (r?.left ?? 0) - v.panX) / k, y: (cy - (r?.top ?? 0) - v.panY) / k };
    };
    deskGeometry.visible = () => {
      const r = ref.current?.getBoundingClientRect();
      const v = ui.get().view;
      const k = DESK_PPI * v.zoom;
      return { x: -v.panX / k, y: -v.panY / k, w: (r?.width ?? 800) / k, h: (r?.height ?? 600) / k };
    };
  }, []);

  // Wheel pans; pinch or Ctrl/Cmd + wheel zooms around the cursor.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = ui.get().view;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM);
        zoomAround(zoom, e.clientX - r.left, e.clientY - r.top);
      } else {
        ui.set({ view: { ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY } });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        spaceHeld.current = true;
        if (e.target === document.body) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const startPan = (e: React.PointerEvent) => {
    const v0 = ui.get().view;
    setPanning(true);
    startDrag(e, {
      onMove: ({ dx, dy }) => ui.set({ view: { ...ui.get().view, panX: v0.panX + dx, panY: v0.panY + dy } }),
      onEnd: () => setPanning(false),
      onCancel: () => setPanning(false),
    });
  };

  const onBackgroundDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const additive = e.shiftKey || e.metaKey;
    const initial = additive ? ui.get().selection : [];
    if (!additive) ui.set({ selection: [] });
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    startDrag(e, {
      onMove: ({ dx, dy }) => {
        const m = { x: Math.min(sx, sx + dx), y: Math.min(sy, sy + dy), w: Math.abs(dx), h: Math.abs(dy) };
        setMarquee(m);
        const a = deskGeometry.toDesk(rect.left + m.x, rect.top + m.y);
        const b = deskGeometry.toDesk(rect.left + m.x + m.w, rect.top + m.y + m.h);
        const box = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
        const hit = docStore.doc.pile.filter((p) => intersects(p, box)).map((p) => p.photoId);
        ui.set({ selection: [...new Set([...initial, ...hit])] });
      },
      onEnd: () => setMarquee(null),
      onCancel: () => setMarquee(null),
    });
  };

  const onItemDown = (e: React.PointerEvent, p: Placement) => {
    if (e.button === 1 || spaceHeld.current) return; // falls through to panning
    if (e.button !== 0) return;
    e.stopPropagation();
    const toggle = e.shiftKey || e.metaKey;
    const current = ui.get().selection;
    const wasSelected = current.includes(p.photoId);
    if (!wasSelected) ui.set({ selection: toggle ? [...current, p.photoId] : [p.photoId] });
    const ids = ui.get().selection;
    const k = DESK_PPI * ui.get().view.zoom;
    const ghostW = Math.min(GHOST_MAX, p.w * k);
    const ghost = { photoId: p.photoId, count: ids.length, w: ghostW, h: (ghostW * p.h) / p.w };

    startDrag(e, {
      onStart: () => docStore.begin(),
      onMove: ({ e: ev, dx, dy }) => {
        const target = trackGhost(ev, null);
        ui.set({ ghost: target?.kind === 'desk' ? null : { ...ghost, clientX: ev.clientX, clientY: ev.clientY } });
        const set = new Set(ids);
        const ordered = [...docStore.doc.pile].sort((a, b) => a.z - b.z);
        docStore.preview((d) => {
          for (const q of ordered) {
            if (!set.has(q.photoId)) continue;
            const item = d.pile.find((i) => i.photoId === q.photoId);
            if (!item) continue;
            item.x += dx / k;
            item.y += dy / k;
            bump(d, item);
          }
        });
      },
      onEnd: ({ e: ev }, moved) => {
        clearGhost();
        if (!moved) {
          if (toggle && wasSelected) ui.set({ selection: current.filter((id) => id !== p.photoId) });
          else if (!toggle) ui.set({ selection: [p.photoId] });
          docStore.silent((d) => {
            const item = d.pile.find((i) => i.photoId === p.photoId);
            if (item) bump(d, item);
          });
          return;
        }
        const target = trackGhost(ev, null);
        clearGhost();
        if (target?.kind === 'page') {
          docStore.preview((d) => putOnPage(d, ids, target.spreadId, target.side));
          docStore.end();
          ui.set({ selection: [] });
        } else if (target?.kind === 'insert') {
          docStore.preview((d) => putOnNewSpread(d, ids, target.index));
          docStore.end();
          ui.set({ selection: [] });
        } else if (target?.kind === 'desk') {
          docStore.end();
        } else {
          docStore.cancel();
        }
      },
      onCancel: () => {
        clearGhost();
        docStore.cancel();
      },
    });
  };

  const onHandleDown = (e: React.PointerEvent, p: Placement, corner: Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const k = DESK_PPI * ui.get().view.zoom;
    startDrag(e, {
      onStart: () => docStore.begin(),
      onMove: ({ e: ev, dx, dy }) => {
        const { rect } = resizeRect(p, corner, dx / k, dy / k, !ev.shiftKey, null, 0);
        docStore.preview((d) => {
          const item = d.pile.find((i) => i.photoId === p.photoId);
          if (item) Object.assign(item, rect);
        });
      },
      onEnd: (_, moved) => {
        if (moved) docStore.end();
      },
      onCancel: () => docStore.cancel(),
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const project = files.find(isProjectFile);
    if (project) void openProjectFile(project);
    else if (files.length) void importPhotos(files);
  };

  const items = [...doc.pile].sort((a, b) => a.z - b.z);
  const single = selection.length === 1 ? selection[0] : null;

  return (
    <div
      ref={ref}
      className={`desk${panning ? ' panning' : ''}${hover ? ' drop-hover' : ''}`}
      data-drop="desk"
      onPointerDown={onBackgroundDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        className="desk-world"
        style={{
          transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
          ['--inv' as string]: 1 / view.zoom,
        }}
      >
        {items.map((p) => (
          <DeskItem
            key={p.photoId}
            p={p}
            selected={selection.includes(p.photoId)}
            handles={single === p.photoId}
            onDown={onItemDown}
            onHandleDown={onHandleDown}
          />
        ))}
      </div>
      {marquee && (
        <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
      )}
      {doc.pile.length === 0 && (
        <div className="desk-empty">
          <p className="desk-empty-title">
            {Object.keys(doc.photos).length ? 'Every photo is placed' : 'Start with your photos'}
          </p>
          <p>Add photos or drop files here. They land on this desk, ready to drag onto pages.</p>
          <button className="btn primary" onPointerDown={(e) => e.stopPropagation()} onClick={onAddPhotos}>
            Add photos
          </button>
        </div>
      )}
      <ZoomControls />
    </div>
  );
}

interface ItemProps {
  p: Placement;
  selected: boolean;
  handles: boolean;
  onDown: (e: React.PointerEvent, p: Placement) => void;
  onHandleDown: (e: React.PointerEvent, p: Placement, c: Corner) => void;
}

const DeskItem = memo(function DeskItem({ p, selected, handles, onDown, onHandleDown }: ItemProps) {
  return (
    <div
      className={`item${selected ? ' selected' : ''}`}
      style={{ left: p.x * DESK_PPI, top: p.y * DESK_PPI, width: p.w * DESK_PPI, height: p.h * DESK_PPI }}
      onPointerDown={(e) => onDown(e, p)}
    >
      <PhotoImg id={p.photoId} />
      {handles &&
        CORNERS.map((c) => (
          <div key={c} className={`handle handle-${c}`} onPointerDown={(e) => onHandleDown(e, p, c)} />
        ))}
    </div>
  );
});

function ZoomControls() {
  const zoom = ui.use((s) => s.view.zoom);
  const step = (f: number) => {
    const el = document.querySelector('.desk');
    const r = el?.getBoundingClientRect();
    zoomAround(clamp(zoom * f, MIN_ZOOM, MAX_ZOOM), (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
  };
  return (
    <div className="zoom" onPointerDown={(e) => e.stopPropagation()}>
      <button className="btn icon" aria-label="Zoom out" onClick={() => step(1 / 1.25)}>
        <Minus />
      </button>
      <button className="btn zoom-level" onClick={() => zoomAround(1, 0, 0)} title="Reset zoom">
        {Math.round(zoom * 100)}%
      </button>
      <button className="btn icon" aria-label="Zoom in" onClick={() => step(1.25)}>
        <Plus />
      </button>
    </div>
  );
}

/** Set zoom keeping the desk point under (sx, sy) — desk-relative pixels — fixed. */
function zoomAround(zoom: number, sx: number, sy: number): void {
  const v = ui.get().view;
  const f = zoom / v.zoom;
  ui.set({ view: { zoom, panX: sx - (sx - v.panX) * f, panY: sy - (sy - v.panY) * f } });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
