import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link2, Link2Off, Plus, SeparatorHorizontal, SeparatorVertical, X } from 'lucide-react';
import { startDrag } from '../drag';
import {
  dropGuide,
  fmt,
  isUniform,
  lineAt,
  lineOnPage,
  linePosition,
  pageRect,
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
 * Clicking any guide selects it and highlights its settings.
 */

const PAD = 0.5;
/** Ruler thickness, in pixels. */
const RULER = 20;
/** Shift snaps a dragged guide to this, in inches. */
const SNAP = 1 / 8;
const SAMPLE: Spread = { id: 'guides', kind: 'middle', items: [] };
const SIDES = pageSides(SAMPLE.kind);
const EDGES = ['top', 'bottom', 'inside', 'outside'] as const;

type Axis = LineGuide['axis'];

/** What's selected: a guide from the rulers, a border guide, or a center line. */
type Selection = { kind: 'line'; index: number } | { kind: 'border'; index: number } | { kind: 'center'; axis: Axis };

const round = (n: number) => Math.round(n * 1000) / 1000;
const same = (a: Selection | null, b: Selection) =>
  !!a &&
  a.kind === b.kind &&
  (a.kind === 'center' ? a.axis === (b as typeof a).axis : a.index === (b as typeof a).index);

export function GuidesEditor() {
  const { doc } = useDoc();
  const s = doc.settings;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 500 });
  const [selected, setSelected] = useState<Selection | null>(null);
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

  const remove = (sel: Selection) => {
    if (sel.kind === 'center') return;
    docStore.apply((d) => void (sel.kind === 'line' ? d.settings.lines : d.settings.borders).splice(sel.index, 1));
    setSelected(null);
  };

  useWindowEvent('keydown', (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Escape') {
      if (selected) setSelected(null);
      else closeModal();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      remove(selected);
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
  const guideAt = (axis: Axis, e: PointerEvent): LineGuide | null => {
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
  const dragGuide = (e: React.PointerEvent, axis: Axis, index: number | null) => {
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
          if (index !== null) setSelected({ kind: 'line', index });
          return;
        }
        const g = guideAt(axis, ev);
        docStore.end();
        setSelected(g ? { kind: 'line', index: index ?? start.length } : null);
      },
      onCancel: () => {
        setDragLabel(null);
        docStore.cancel();
      },
    });
  };

  // Every guide, drawn over the canvas (whose origin is the gutter, at the pages' top).
  // Guides from the rulers can be dragged; the others are only selected.
  const oX = (PAD + s.pageW) * scale;
  const oY = PAD * scale;
  const guides: ReactNode[] = [];
  const draw = (key: string, axis: Axis, at: number, sel: Selection, side: 'left' | 'right' | null, drag?: number) => {
    const page = side ? pageRect(side, s) : { x: -s.pageW, w: 2 * s.pageW };
    const style =
      axis === 'horizontal'
        ? { top: oY + at * scale, left: oX + page.x * scale, width: page.w * scale }
        : { left: oX + at * scale, top: oY, height: s.pageH * scale };
    const kind = sel.kind === 'line' ? 'movable' : 'fixed';
    guides.push(
      <div
        key={key}
        className={`line-guide line-guide-${axis === 'horizontal' ? 'h' : 'v'} ${kind}${same(selected, sel) ? ' selected' : ''}`}
        style={style}
        onPointerDown={(e) => {
          if (drag !== undefined) return dragGuide(e, axis, drag);
          if (e.button !== 0) return;
          e.stopPropagation();
          setSelected(sel);
        }}
      />,
    );
  };
  if (s.centerV)
    for (const side of SIDES)
      draw(`cv-${side}`, 'vertical', pageCenter(side, s), { kind: 'center', axis: 'vertical' }, side);
  if (s.centerH) draw('ch', 'horizontal', s.pageH / 2, { kind: 'center', axis: 'horizontal' }, null);
  s.borders.forEach((g, i) => {
    const sel: Selection = { kind: 'border', index: i };
    for (const side of SIDES) {
      const p = pageRect(side, s);
      const [l, r] = side === 'left' ? [g.outside, g.inside] : [g.inside, g.outside];
      draw(`b${i}-${side}-l`, 'vertical', p.x + l, sel, side);
      draw(`b${i}-${side}-r`, 'vertical', p.x + p.w - r, sel, side);
      draw(`b${i}-${side}-t`, 'horizontal', g.top, sel, side);
      draw(`b${i}-${side}-b`, 'horizontal', s.pageH - g.bottom, sel, side);
    }
  });
  s.lines.forEach((l, i) => {
    if (!lineOnPage(s, l)) return;
    const sel: Selection = { kind: 'line', index: i };
    if (l.axis === 'horizontal') draw(`l${i}`, 'horizontal', l.at, sel, null, i);
    else for (const side of SIDES) draw(`l${i}-${side}`, 'vertical', linePosition(side, s, l), sel, side, i);
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
            Drag from a ruler to add a guide · Shift: snap to ⅛ in · Drag off the page to remove
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
                settings={s}
                scale={scale}
                pad={PAD}
                overlay={<div className="line-guides">{guides}</div>}
                onPointerDown={() => setSelected(null)}
              />
            </div>
            {dragLabel && (
              <div className="guide-drag-label data" style={{ left: dragLabel.x + 14, top: dragLabel.y + 14 }}>
                {dragLabel.text}
              </div>
            )}
          </div>
          <GuidesPanel s={s} selected={selected} onSelect={setSelected} onRemove={remove} />
        </div>
      </div>
    </div>
  );
}

function pageCenter(side: 'left' | 'right', s: Settings): number {
  const p = pageRect(side, s);
  return p.x + p.w / 2;
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
  selected: Selection | null;
  onSelect: (sel: Selection | null) => void;
  onRemove: (sel: Selection) => void;
}

function GuidesPanel({ s, selected, onSelect, onRemove }: PanelProps) {
  const drop = dropGuide(s);
  const addLine = (axis: Axis) => {
    const size = axis === 'vertical' ? s.pageW : s.pageH;
    docStore.apply((d) => void d.settings.lines.push({ axis, at: Math.round(size / 3 / SNAP) * SNAP }));
    onSelect({ kind: 'line', index: s.lines.length });
  };
  const addBorder = () => {
    docStore.apply((d) => {
      const b = uniformBorder((d.settings.borders.at(-1)?.top ?? 0.25) + 0.25);
      clampBorder(b, d.settings);
      d.settings.borders.push(b);
    });
    onSelect({ kind: 'border', index: s.borders.length });
  };
  const center = (axis: Axis, label: string) => {
    const sel: Selection = { kind: 'center', axis };
    const on = axis === 'vertical' ? s.centerV : s.centerH;
    return (
      <label className={`check pick${same(selected, sel) ? ' selected' : ''}`} onPointerDown={() => onSelect(sel)}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            docStore.apply((d) => void (d.settings[axis === 'vertical' ? 'centerV' : 'centerH'] = e.target.checked))
          }
        />
        {label}
      </label>
    );
  };

  return (
    <aside className="inspector guides-panel">
      <section>
        <h3>Center lines</h3>
        <div className="inline">
          {center('vertical', 'Vertical')}
          {center('horizontal', 'Horizontal')}
        </div>
      </section>

      <section>
        <header className="section-head">
          <h3>Border guides</h3>
          <button
            className="btn ghost icon small"
            aria-label="Add border guide"
            title="Add border guide"
            onClick={addBorder}
          >
            <Plus />
          </button>
        </header>
        {s.borders.length === 0 && <p className="help">None. Dropped photos fill the page.</p>}
        {s.borders.map((g, i) => (
          <BorderRow
            key={i}
            g={g}
            i={i}
            isDrop={g === drop}
            selected={same(selected, { kind: 'border', index: i })}
            onSelect={() => onSelect({ kind: 'border', index: i })}
            onRemove={() => onRemove({ kind: 'border', index: i })}
          />
        ))}
      </section>

      <section>
        <header className="section-head">
          <h3>Guides</h3>
          <button
            className="btn ghost icon small"
            aria-label="Add horizontal guide"
            title="Add horizontal guide"
            onClick={() => addLine('horizontal')}
          >
            <SeparatorHorizontal />
          </button>
          <button
            className="btn ghost icon small"
            aria-label="Add vertical guide"
            title="Add vertical guide"
            onClick={() => addLine('vertical')}
          >
            <SeparatorVertical />
          </button>
        </header>
        {s.lines.length === 0 && <p className="help">Drag from a ruler to add one.</p>}
        {s.lines.map((l, i) => (
          <div
            key={i}
            className={`inline guide-row pick${same(selected, { kind: 'line', index: i }) ? ' selected' : ''}`}
            onPointerDown={() => onSelect({ kind: 'line', index: i })}
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
            <button
              className="btn ghost icon small"
              aria-label="Remove guide"
              onClick={() => onRemove({ kind: 'line', index: i })}
            >
              <X />
            </button>
          </div>
        ))}
      </section>

      <p className="help guides-note">
        Every spread, mirrored on facing pages. Inside is the edge at the gutter; vertical guides are measured from the
        outside edge. Shift snaps a dragged guide to ⅛ in.
      </p>
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

interface BorderRowProps {
  g: BorderGuide;
  i: number;
  isDrop: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function BorderRow({ g, i, isDrop, selected, onSelect, onRemove }: BorderRowProps) {
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
  const makeDrop = () =>
    docStore.apply((d) => {
      for (const [j, b] of d.settings.borders.entries()) {
        if (j === i) b.drop = true;
        else delete b.drop;
      }
    });

  return (
    <div className={`border-guide pick${selected ? ' selected' : ''}`} onPointerDown={onSelect}>
      <div className="grid2">
        <NumberField label="Top" value={g.top} min={0} suffix="" onCommit={(n) => set('top', n)} />
        <NumberField label="Bottom" value={g.bottom} min={0} suffix="" onCommit={(n) => set('bottom', n)} />
        <NumberField label="Inside" value={g.inside} min={0} suffix="" onCommit={(n) => set('inside', n)} />
        <NumberField label="Outside" value={g.outside} min={0} suffix="" onCommit={(n) => set('outside', n)} />
      </div>
      <div className="inline border-tools">
        <button
          className={`drop-toggle${isDrop ? ' on' : ''}`}
          aria-pressed={isDrop}
          onClick={makeDrop}
          data-tip={
            isDrop
              ? 'Photos dropped on a page fit inside this guide.'
              : 'Fit photos dropped on a page inside this guide instead.'
          }
        >
          On drop
        </button>
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
        <button className="btn ghost icon small" aria-label="Remove border guide" onClick={onRemove}>
          <X />
        </button>
      </div>
    </div>
  );
}
