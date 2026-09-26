import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { folioLabel } from '../actions';
import { savePdf } from '../pdf';
import { useDoc } from '../store';
import { ui } from '../ui';
import { SpreadCanvas } from './SpreadCanvas';

export function Preview() {
  const { doc } = useDoc();
  const [index, setIndex] = useState(() => {
    const editing = ui.get().editingSpreadId;
    return Math.max(
      0,
      doc.spreads.findIndex((s) => s.id === editing),
    );
  });
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 900, h: 600 });
  const busy = ui.use((s) => s.busy);
  const { spreads, settings } = doc;
  const spread = spreads[Math.min(index, spreads.length - 1)];

  const close = () => ui.set({ previewOpen: false });
  const go = (d: number) => {
    setDir(d > 0 ? 'next' : 'prev');
    setIndex((i) => Math.min(spreads.length - 1, Math.max(0, i + d)));
  };

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else if (e.key === 'Home') go(-spreads.length);
      else if (e.key === 'End') go(spreads.length);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!spread) return null;
  const scale = Math.min((stage.w - 40) / (2 * settings.pageW), (stage.h - 40) / settings.pageH);
  const label = folioLabel(index, spreads.length);

  return (
    <div className="preview" data-modal>
      <header className="preview-head">
        <span className="folio">{label}</span>
        <span className="muted data">
          {index + 1} / {spreads.length}
        </span>
        <span className="spacer" />
        <span className="hint">← → to turn pages · Esc to exit</span>
        <button className="btn" onClick={() => void savePdf()} disabled={busy !== null}>
          {busy ?? 'Download PDF'}
        </button>
        <button className="btn" onClick={close}>
          Exit preview
        </button>
      </header>
      <div className="preview-stage" ref={stageRef}>
        <button className="turn prev" aria-label="Previous spread" disabled={index === 0} onClick={() => go(-1)}>
          <ChevronLeft />
        </button>
        <div key={spread.id} className={`preview-spread turn-${dir}`}>
          <SpreadCanvas spread={spread} settings={settings} scale={scale} clip className="book" />
        </div>
        <button
          className="turn next"
          aria-label="Next spread"
          disabled={index === spreads.length - 1}
          onClick={() => go(1)}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
