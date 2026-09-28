import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link2, Link2Off, Plus, X } from 'lucide-react';
import { startDrag } from '../drag';
import {
  dropGuide,
  fmt,
  isUniform,
  lineAt,
  lineOnPage,
  linePosition,
  pageSides,
  sideAt,
  uniformBorder,
} from '../geometry';
import { useWindowEvent } from '../hooks';
import { isTyping } from '../input';
import { docStore, useDoc } from '../store';
import type { BorderGuide, LineGuide, Settings, Spread } from '../types';
import { closeModal } from '../ui';
import { NumberField } from './NumberField';
import { SpreadCanvas } from './SpreadCanvas';

/**
 * The guides view: a facing pair of empty pages with rulers along the top and left, and
 * the guide settings beside them. Guides apply to every spread, mirrored on facing pages.
 * Drag from a ruler to add a guide parallel to it; drag a guide off the page to remove it.
 */

const PAD = 0.5;
/** Ruler thickness, in pixels. */
const RULER = 20;
/** Shift snaps a dragged guide to this, in inches. */
const SNAP = 0.25;
const SAMPLE: Spread = { id: 'guides', kind: 'middle', items: [] };
const EDGES = ['top', 'bottom', 'inside', 'outside'] as const;

const round = (n: number) => Math.round(n * 1000) / 1000;

export function GuidesEditor() {
  const { doc } = useDoc();
  const s = doc.settings;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 500 });
  const [selected, setSelected] = useState<number | null>(null);
  const [dragLabel, setDragLabel] = useState<{ text: string; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setStage({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const removeLine = (i: number) => {
    docStore.apply((d) => void d.settings.lines.splice(i, 1));
    setSelected(null);
  };

  useWindowEvent('keydown', (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Escape') {
      if (selected !== null) setSelected(null);
      else closeModal();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
      e.preventDefault();
      removeLine(selected);
    }
  });

  // Where the spread sits in the stage: centered in the space beside the rulers.
  const scale = Math.max(
    4,
    Math.min((stage.w - RULER) / (2 * s.pageW + 2 * PAD), (stage.h - RULER) / (s.pageH + 2 * PAD)),
  );
  const left = RULER + Math.max(0, (stage.w - RULER - (2 * s.pageW + 2 * PAD) * scale) / 2);
  const top = RULER + Math.max(0, (stage.h - RULER - (s.pageH + 2 * PAD) * scale) / 2);
  /** The gutter and the pages' top edge, in stage pixels. */
  const gutterX = left + (PAD + s.pageW) * scale;
  const pageTop = top + PAD * scale;

  /** The guide the pointer is placing, or null over the ruler or off the page (to remove it). */
  const guideAt = (axis: LineGuide['axis'], e: PointerEvent): LineGuide | null => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return null;
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const x = (px - gutterX) / scale;
    let at = axis === 'horizontal' ? (py - pageTop) / scale : lineAt(sideAt(x), s, 'vertical', x);
    if (e.shiftKey) at = Math.round(at / SNAP) * SNAP;
    const overRuler = axis === 'horizontal' ? py < RULER : px < RULER;
    const size = axis === 'horizontal' ? s.pageH : s.pageW;
    return overRuler || at <= 0 || at >= size ? null : { axis, at: round(at) };
  };

  /** Drag a new guide out of a ruler (`index` null) or an existing one. */
  const dragGuide = (e: React.PointerEvent, axis: LineGuide['axis'], index: number | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = s.lines;
    const place = (g: LineGuide | null): LineGuide[] => {
      const lines = [...start];
      if (index === null) {
        if (g) lines.push(g);
      } else if (g) lines[index] = g;
      else lines.splice(index, 1);
      return lines;
    };
    startDrag(e, {
      onStart: () => docStore.begin(),
      onMove: ({ e: ev }) => {
        const g = guideAt(axis, ev);
        docStore.preview((d) => void (d.settings.lines = place(g)));
        const r = stageRef.current?.getBoundingClientRect();
        const from = axis === 'horizontal' ? 'from top' : 'from outside';
        setDragLabel({
          text: g ? `${fmt(g.at)} in ${from}` : 'Remove',
          x: ev.clientX - (r?.left ?? 0),
          y: ev.clientY - (r?.top ?? 0),
        });
      },
      onEnd: ({ e: ev }, moved) => {
        setDragLabel(null);
        if (!moved) {
          if (index !== null) setSelected(index);
          return;
        }
        const g = guideAt(axis, ev);
        docStore.end();
        setSelected(g ? (index ?? start.length) : null);
      },
      onCancel: () => {
        setDragLabel(null);
        docStore.cancel();
      },
    });
  };

  // The line guides, drawn over the canvas (whose origin is the gutter, at the pages' top).
  const oX = (PAD + s.pageW) * scale;
  const oY = PAD * scale;
  const lineGuides = s.lines.map((l, i) => {
    if (!lineOnPage(s, l)) return null;
    const cls = `line-guide line-guide-${l.axis === 'horizontal' ? 'h' : 'v'}${i === selected ? ' selected' : ''}`;
    const down = (e: React.PointerEvent) => dragGuide(e, l.axis, i);
    if (l.axis === 'horizontal') {
      return (
        <div
          key={i}
          className={cls}
          style={{ top: oY + l.at * scale, left: oX - s.pageW * scale, width: 2 * s.pageW * scale }}
          onPointerDown={down}
        />
      );
    }
    return pageSides(SAMPLE.kind).map((side) => (
      <div
        key={`${i}-${side}`}
        className={cls}
        style={{ left: oX + linePosition(side, s, l) * scale, top: oY, height: s.pageH * scale }}
        onPointerDown={down}
      />
    ));
  });

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal editor guides-editor" data-modal>
        <header className="modal-head">
          <div className="modal-title">
            <span className="folio">Guides</span>
            <span className="muted data">
              {fmt(s.pageW)} × {fmt(s.pageH)} in · every spread
            </span>
          </div>
          <span className="spacer" />
          <span className="hint">
            Drag from a ruler to add a guide · Shift: snap to ¼ in · Drag off the page to remove
          </span>
          <button className="btn ghost icon" aria-label="Close" onClick={closeModal}>
            <X />
          </button>
        </header>
        <div className="editor-body">
          <div className="editor-stage guides-stage" ref={stageRef}>
            <Ruler
              axis="horizontal"
              length={stage.w}
              origin={gutterX}
              scale={scale}
              size={s.pageW}
              mirrored
              onPointerDown={(e) => dragGuide(e, 'horizontal', null)}
            />
            <Ruler
              axis="vertical"
              length={stage.h}
              origin={pageTop}
              scale={scale}
              size={s.pageH}
              onPointerDown={(e) => dragGuide(e, 'vertical', null)}
            />
            <div className="ruler-corner" />
            <div className="guides-canvas" style={{ left, top }}>
              <SpreadCanvas
                spread={SAMPLE}
                settings={{ ...s, lines: [] }}
                scale={scale}
                pad={PAD}
                guides
                overlay={<div className="line-guides">{lineGuides}</div>}
                onPointerDown={() => setSelected(null)}
              />
            </div>
            {dragLabel && (
              <div className="guide-drag-label data" style={{ left: dragLabel.x + 14, top: dragLabel.y + 14 }}>
                {dragLabel.text}
              </div>
            )}
          </div>
          <GuidesPanel s={s} selected={selected} onSelect={setSelected} onRemove={removeLine} />
        </div>
      </div>
    </div>
  );
}

interface RulerProps {
  axis: 'horizontal' | 'vertical';
  /** The ruler's length, in pixels. */
  length: number;
  /** Where the measuring starts: the gutter (mirrored, for the top ruler) or the pages' top. */
  origin: number;
  scale: number;
  /** The page's size along the ruler, in inches. */
  size: number;
  /** Measure each page from its outside edge, meeting at the gutter. */
  mirrored?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

/** A ruler in inches: ⅛ in ticks (fewer when zoomed out), numbered every inch. */
function Ruler({ axis, length, origin, scale, size, mirrored = false, onPointerDown }: RulerProps) {
  const minor = [1 / 8, 1 / 4, 1 / 2, 1].find((step) => step * scale >= 6) ?? 1;
  const every = scale >= 16 ? 1 : 2;
  const ticks: ReactNode[] = [];
  // Pages along the ruler: [position of its 0, direction]. The top ruler measures each
  // page from its outside edge; the left one, from the top.
  const pages: [number, number][] = mirrored
    ? [
        [origin - size * scale, 1],
        [origin + size * scale, -1],
      ]
    : [[origin, 1]];
  pages.forEach(([zero, dir], p) => {
    for (let i = 0; i * minor <= size + 1e-9; i++) {
      const d = i * minor;
      const at = zero + dir * d * scale;
      const whole = Math.abs(d - Math.round(d)) < 1e-9;
      const half = Math.abs(d * 2 - Math.round(d * 2)) < 1e-9;
      const len = whole ? RULER * 0.55 : half ? RULER * 0.35 : RULER * 0.2;
      const key = `${p}-${i}`;
      ticks.push(
        axis === 'horizontal' ? (
          <line key={key} x1={at} x2={at} y1={RULER} y2={RULER - len} />
        ) : (
          <line key={key} y1={at} y2={at} x1={RULER} x2={RULER - len} />
        ),
      );
      // Numbered every inch, but not at the gutter, where both pages end.
      if (whole && Math.round(d) % every === 0 && !(mirrored && Math.abs(d - size) < 1e-9)) {
        const label = fmt(d);
        ticks.push(
          axis === 'horizontal' ? (
            <text key={`${key}t`} x={at + (dir > 0 ? 3 : -3)} y={9} textAnchor={dir > 0 ? 'start' : 'end'}>
              {label}
            </text>
          ) : (
            <text key={`${key}t`} x={3} y={at + 10}>
              {label}
            </text>
          ),
        );
      }
    }
  });
  const box = axis === 'horizontal' ? { width: length, height: RULER } : { width: RULER, height: length };
  return (
    <svg
      className={`ruler ruler-${axis === 'horizontal' ? 'top' : 'left'}`}
      {...box}
      onPointerDown={onPointerDown}
      aria-label={`Ruler: drag to add a ${axis} guide`}
    >
      {ticks}
    </svg>
  );
}

interface PanelProps {
  s: Settings;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onRemove: (i: number) => void;
}

function GuidesPanel({ s, selected, onSelect, onRemove }: PanelProps) {
  const drop = dropGuide(s);
  const addLine = (axis: LineGuide['axis']) => {
    const size = axis === 'vertical' ? s.pageW : s.pageH;
    docStore.apply((d) => void d.settings.lines.push({ axis, at: Math.round(size / 3 / SNAP) * SNAP }));
    onSelect(s.lines.length);
  };

  return (
    <aside className="inspector guides-panel">
      <section>
        <h3 className="caps muted">Center lines</h3>
        <div className="inline">
          <label className="check">
            <input
              type="checkbox"
              checked={s.centerV}
              onChange={(e) => docStore.apply((d) => void (d.settings.centerV = e.target.checked))}
            />
            Vertical
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.centerH}
              onChange={(e) => docStore.apply((d) => void (d.settings.centerH = e.target.checked))}
            />
            Horizontal
          </label>
        </div>
      </section>

      <section>
        <h3 className="caps muted">Border guides</h3>
        {s.borders.map((g, i) => (
          <BorderRow key={i} g={g} i={i} isDrop={g === drop} />
        ))}
        <button
          className="btn ghost add-guide"
          onClick={() =>
            docStore.apply((d) => {
              const last = d.settings.borders.at(-1)?.top ?? 0.25;
              const b = uniformBorder(last + 0.25);
              clampBorder(b, d.settings);
              d.settings.borders.push(b);
            })
          }
        >
          <Plus />
          Add border guide
        </button>
        <p className="help">In inches from each edge. Inside is the edge at the gutter.</p>
      </section>

      <section>
        <h3 className="caps muted">Guides</h3>
        <p className="help">
          {s.lines.length === 0 && 'Drag from a ruler to add one. Hold Shift to snap to ¼ in. '}
          Horizontal guides are measured from the top; vertical ones from each page’s outside edge.
        </p>
        {s.lines.map((l, i) => (
          <div
            key={i}
            className={`inline guide-row${i === selected ? ' selected' : ''}`}
            onPointerDown={() => onSelect(i)}
          >
            <span className="guide-kind">{l.axis === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>
            <NumberField
              value={l.at}
              min={0}

              onCommit={(n) =>
                docStore.apply(
                  (d) => {
                    const line = d.settings.lines[i];
                    if (line)
                      line.at = Math.min(n, (line.axis === 'vertical' ? d.settings.pageW : d.settings.pageH) - 0.05);
                  },
                  { coalesce: `line:${i}` },
                )
              }
            />
            <button className="btn ghost icon small" aria-label="Remove guide" onClick={() => onRemove(i)}>
              <X />
            </button>
          </div>
        ))}
        <div className="inline">
          <button className="btn ghost add-guide" onClick={() => addLine('horizontal')}>
            <Plus />
            Horizontal
          </button>
          <button className="btn ghost add-guide" onClick={() => addLine('vertical')}>
            <Plus />
            Vertical
          </button>
        </div>
      </section>

      <p className="help">Guides apply to every spread, mirrored on facing pages. Photos snap to them.</p>
    </aside>
  );
}

/** Keeps a border guide's box on the page: at least 0.1 in across each way. */
function clampBorder(b: BorderGuide, s: Settings): void {
  b.top = Math.min(b.top, s.pageH - b.bottom - 0.1);
  b.bottom = Math.min(b.bottom, s.pageH - b.top - 0.1);
  b.inside = Math.min(b.inside, s.pageW - b.outside - 0.1);
  b.outside = Math.min(b.outside, s.pageW - b.inside - 0.1);
}

function BorderRow({ g, i, isDrop }: { g: BorderGuide; i: number; isDrop: boolean }) {
  // Linked, an edit sets every edge. Starts linked when they're all the same.
  const [linked, setLinked] = useState(() => isUniform(g));
  const set = (edge: (typeof EDGES)[number], n: number) =>
    docStore.apply(
      (d) => {
        const b = d.settings.borders[i];
        if (!b) return;
        for (const e of linked ? EDGES : [edge]) b[e] = n;
        clampBorder(b, d.settings);
      },
      { coalesce: `border:${i}:${linked ? 'all' : edge}` },
    );

  return (
    <div className="border-guide">
      <div className="inline">
        <span className="guide-kind">Guide {i + 1}</span>
        {isDrop && (
          <span
            className="tag"
            tabIndex={0}
            data-tip="When you drop a photo onto a page, it's sized to fit inside this guide and centered."
          >
            on drop
          </span>
        )}
        <span className="spacer" />
        <button
          className={`btn ghost icon small${linked ? ' active' : ''}`}
          aria-label={linked ? 'Unlink edges' : 'Link edges'}
          aria-pressed={linked}
          title={linked ? 'Edges linked: editing one sets all four' : 'Link edges'}
          onClick={() => setLinked(!linked)}
        >
          {linked ? <Link2 /> : <Link2Off />}
        </button>
        <button
          className="btn ghost icon small"
          aria-label={`Remove border guide ${i + 1}`}
          onClick={() => docStore.apply((d) => void d.settings.borders.splice(i, 1))}
        >
          <X />
        </button>
      </div>
      <div className="grid2">
        <NumberField label="Top" value={g.top} min={0} suffix="" onCommit={(n) => set('top', n)} />
        <NumberField label="Bottom" value={g.bottom} min={0} suffix="" onCommit={(n) => set('bottom', n)} />
        <NumberField label="Inside" value={g.inside} min={0} suffix="" onCommit={(n) => set('inside', n)} />
        <NumberField label="Outside" value={g.outside} min={0} suffix="" onCommit={(n) => set('outside', n)} />
      </div>
    </div>
  );
}
