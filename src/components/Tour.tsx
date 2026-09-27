import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowEvent } from '../hooks';
import { endTour, goToStep, TOUR_STEPS } from '../tour';
import { ui } from '../ui';

/** Space between the highlight and what it frames. */
const PAD = 6;
/** Space between the highlight and the card, and the card and the window edge. */
const GAP = 16;
/** Keeps the highlight's outline (2px, drawn outside it) inside the window. */
const EDGE = 4;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The running tour: dims the app except the step's target, with a card to step through. */
export function Tour() {
  const step = ui.use((s) => s.tour);
  return step === null ? null : <TourStepView index={step} />;
}

function TourStepView({ index }: { index: number }) {
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;
  const target = useTargetBox(step.target);
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState({ width: 340, height: 180 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCard({ width: el.offsetWidth, height: el.offsetHeight });
  }, [index]);

  useWindowEvent(
    'keydown',
    (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goToStep(index + 1);
      else if (e.key === 'ArrowLeft') goToStep(Math.max(0, index - 1));
      else if (e.key === 'Escape') endTour();
      // Everything else is kept from the app underneath, which is showing the sample project.
      e.stopImmediatePropagation();
      if (!e.metaKey && !e.ctrlKey && e.key !== 'Tab') e.preventDefault();
    },
    true,
  );

  const hole = target && padWithin(target, innerWidth, innerHeight);
  const pos = placeCard(hole, card);

  return (
    <div
      className="tour"
      role="dialog"
      aria-label={`Tour: ${step.title}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        className={`tour-hole${hole ? '' : ' none'}`}
        style={hole ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 }}
      />
      <div ref={cardRef} className="tour-card" style={pos}>
        <div className="tour-count data muted">
          {index + 1} of {TOUR_STEPS.length}
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          {!last && (
            <button className="btn ghost" onClick={endTour}>
              Skip tour
            </button>
          )}
          <span className="spacer" />
          {index > 0 && (
            <button className="btn" onClick={() => goToStep(index - 1)}>
              Back
            </button>
          )}
          <button className="btn primary" autoFocus onClick={() => goToStep(index + 1)}>
            {last ? 'Start your book' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The target plus some breathing room, kept inside the window: targets that reach the
 * window's edge (the desk, the sidebar) are framed from just inside it instead.
 */
function padWithin(t: Box, vw: number, vh: number): Box {
  const left = Math.max(EDGE, t.left - PAD);
  const top = Math.max(EDGE, t.top - PAD);
  const right = Math.min(vw - EDGE, t.left + t.width + PAD);
  const bottom = Math.min(vh - EDGE, t.top + t.height + PAD);
  return { left, top, width: right - left, height: bottom - top };
}

/** The target's box, kept current as things open, animate, and resize. */
function useTargetBox(selector: string | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!selector) return;
    let frame = 0;
    const measure = () => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      setBox((b) =>
        !r
          ? null
          : b && b.left === r.left && b.top === r.top && b.width === r.width && b.height === r.height
            ? b
            : { left: r.left, top: r.top, width: r.width, height: r.height },
      );
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [selector]);
  return selector ? box : null;
}

/**
 * Put the card beside the highlight, on whichever side has room; inside it, near the
 * bottom, when it fills the window; centered, low, when there's nothing to highlight.
 */
function placeCard(hole: Box | null, card: { width: number; height: number }): { left: number; top: number } {
  const vw = innerWidth;
  const vh = innerHeight;
  const clampX = (x: number) => Math.min(Math.max(GAP, x), vw - card.width - GAP);
  const clampY = (y: number) => Math.min(Math.max(GAP, y), vh - card.height - GAP);
  // Below the sample photos, which sit in the upper part of the desk.
  if (!hole) return { left: (vw - card.width) / 2, top: clampY(vh * 0.62 - card.height / 2) };
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  if (right + GAP + card.width + GAP <= vw) return { left: right + GAP, top: clampY(hole.top) };
  if (hole.left - GAP - card.width >= GAP) return { left: hole.left - GAP - card.width, top: clampY(hole.top) };
  if (bottom + GAP + card.height + GAP <= vh) return { left: clampX(hole.left), top: bottom + GAP };
  if (hole.top - GAP - card.height >= GAP) return { left: clampX(hole.left), top: hole.top - GAP - card.height };
  return { left: clampX(hole.left + (hole.width - card.width) / 2), top: clampY(bottom - card.height - 2 * GAP) };
}
