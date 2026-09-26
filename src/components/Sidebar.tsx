import { useRef, useState, type CSSProperties } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import { deleteSpread, folioLabel, insertSpread, moveSpread, putInPile, putOnNewSpread, putOnPage } from '../actions';
import { clearGhost, startDrag, trackGhost } from '../drag';
import { docStore, useDoc } from '../store';
import type { Placement, Settings, Spread } from '../types';
import { DESK_PPI, deskGeometry, openPhotoMenu, ui } from '../ui';
import { PhotoImg } from './PhotoImg';
import { SpreadCanvas } from './SpreadCanvas';

const THUMB_W = 244;
const GHOST_MAX = 140;

export function Sidebar() {
  const { doc } = useDoc();
  const listRef = useRef<HTMLDivElement>(null);
  const [reorder, setReorder] = useState<{ id: string; dropIndex: number } | null>(null);
  const { spreads, settings } = doc;

  /** Dragging a middle spread's header reorders it; clicking it opens the spread. */
  const onHeaderDown = (e: React.PointerEvent, spread: Spread) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const from = spreads.findIndex((s) => s.id === spread.id);
    let dropIndex = from;
    startDrag(e, {
      onMove: ({ e: ev }) => {
        const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row-index]') ?? [])];
        let idx = rows.length - 1;
        for (const row of rows) {
          const r = row.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            idx = Number(row.dataset.rowIndex);
            break;
          }
        }
        dropIndex = Math.min(Math.max(1, idx), spreads.length - 1);
        setReorder({ id: spread.id, dropIndex });
      },
      onEnd: (_, moved) => {
        setReorder(null);
        if (!moved) return ui.set({ editingSpreadId: spread.id });
        if (dropIndex === from || dropIndex === from + 1) return;
        moveSpread(spread.id, dropIndex > from ? dropIndex - 1 : dropIndex);
      },
      onCancel: () => setReorder(null),
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="caps">Spreads</span>
        <button
          className="btn ghost icon small"
          aria-label="Add spread at the end"
          title="Add a spread before the back page"
          onClick={() => insertSpread(spreads.length - 1)}
        >
          <Plus />
        </button>
        <span className="spacer" />
        <span className="caps muted">{spreads.length * 2 - 2} pages</span>
      </div>
      <div className="sidebar-list" ref={listRef}>
        {spreads.map((spread, i) => (
          <div key={spread.id}>
            {i > 0 && <InsertGap index={i} active={reorder?.dropIndex === i} />}
            <SpreadRow
              spread={spread}
              index={i}
              total={spreads.length}
              settings={settings}
              dragging={reorder?.id === spread.id}
              onHeaderDown={onHeaderDown}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * The gap between two spreads: hover to add a spread there, or drop photos on it
 * to add a spread holding them.
 */
function InsertGap({ index, active }: { index: number; active: boolean }) {
  const dropHover = ui.use((s) => s.hoverKey === `insert:${index}`);
  const photoDrag = ui.use((s) => s.ghost !== null);
  return (
    <div
      className={`insert-gap${active ? ' active' : ''}${dropHover ? ' drop-hover' : ''}${photoDrag ? ' photo-drag' : ''}`}
      data-drop="insert"
      data-index={index}
    >
      {dropHover ? (
        <span className="insert-btn">Drop to add a spread</span>
      ) : (
        <button className="insert-btn" onClick={() => insertSpread(index)}>
          + Add spread
        </button>
      )}
    </div>
  );
}

interface RowProps {
  spread: Spread;
  index: number;
  total: number;
  settings: Settings;
  dragging: boolean;
  onHeaderDown: (e: React.PointerEvent, s: Spread) => void;
}

function SpreadRow({ spread, index, total, settings, dragging, onHeaderDown }: RowProps) {
  const editing = ui.use((s) => s.editingSpreadId === spread.id);
  const scale = THUMB_W / (2 * settings.pageW);
  const middle = spread.kind === 'middle';
  const label = folioLabel(index, total);

  const open = () => ui.set({ editingSpreadId: spread.id });

  const onCanvasDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    startDrag(e, { onEnd: (_, moved) => !moved && open() });
  };

  const onItemDown = (e: React.PointerEvent, p: Placement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const k = DESK_PPI * ui.get().view.zoom;
    const w = Math.min(GHOST_MAX, p.w * k);
    const ghost = { photoId: p.photoId, count: 1, w, h: (w * p.h) / p.w };
    const fromSide = p.x + p.w / 2 < 0 ? 'left' : 'right';
    startDrag(e, {
      onMove: ({ e: ev }) => trackGhost(ev, ghost),
      onEnd: ({ e: ev }, moved) => {
        const target = trackGhost(ev, null);
        clearGhost();
        if (!moved) return open();
        if (target?.kind === 'page') {
          if (target.spreadId === spread.id && target.side === fromSide) return;
          docStore.apply((d) => putOnPage(d, [p.photoId], target.spreadId, target.side));
        } else if (target?.kind === 'insert') {
          docStore.apply((d) => putOnNewSpread(d, [p.photoId], target.index));
        } else if (target?.kind === 'desk') {
          const at = deskGeometry.toDesk(ev.clientX, ev.clientY);
          docStore.apply((d) => putInPile(d, p.photoId, at));
        }
      },
      onCancel: clearGhost,
    });
  };

  const renderItem = (p: Placement, style: CSSProperties) => (
    <div
      key={p.photoId}
      className="item"
      style={style}
      onPointerDown={(e) => onItemDown(e, p)}
      onContextMenu={(e) => openPhotoMenu(e, p.photoId)}
    >
      <PhotoImg id={p.photoId} />
    </div>
  );

  return (
    <div
      className={`spread-row${editing ? ' editing' : ''}${dragging ? ' dragging' : ''}`}
      data-row-index={index}
    >
      <div
        className={`spread-row-head${middle ? ' draggable' : ''}`}
        title={middle ? 'Drag to reorder' : 'The first and last pages stay in place'}
        onPointerDown={middle ? (e) => onHeaderDown(e, spread) : undefined}
      >
        <span className={`grip${middle ? '' : ' locked'}`} aria-hidden="true">
          <GripVertical />
        </span>
        <span className="spread-label">
          {label}
        </span>
        <span className="muted data">{spread.items.length ? `${spread.items.length} photo${spread.items.length === 1 ? '' : 's'}` : ''}</span>
        {middle && (
          <button
            className="row-delete"
            aria-label={`Delete pages ${label}`}
            title="Delete spread (photos return to the desk)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => deleteSpread(spread.id)}
          >
            <X />
          </button>
        )}
      </div>
      <SpreadCanvas
        spread={spread}
        settings={settings}
        scale={scale}
        clip
        droppable
        renderItem={renderItem}
        onPointerDown={onCanvasDown}
        className="thumb"
      />
    </div>
  );
}
