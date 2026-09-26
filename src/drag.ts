import { hitTest, targetKey, ui, type DropTarget } from './ui';

const THRESHOLD = 4;

export interface DragMove {
  e: PointerEvent;
  /** Client-pixel offset from the pointerdown point. */
  dx: number;
  dy: number;
}

interface DragHandlers {
  onStart?: (m: DragMove) => void;
  onMove?: (m: DragMove) => void;
  /** Called on release. `moved` is false for a click. */
  onEnd?: (m: DragMove, moved: boolean) => void;
  onCancel?: () => void;
}

/**
 * Track a pointer drag from a React pointerdown. Movement under a few pixels counts as a click.
 * Escape cancels the gesture.
 */
export function startDrag(down: React.PointerEvent, h: DragHandlers): void {
  const x0 = down.clientX;
  const y0 = down.clientY;
  let moved = false;

  const move = (e: PointerEvent) => {
    const m = { e, dx: e.clientX - x0, dy: e.clientY - y0 };
    if (!moved) {
      if (Math.hypot(m.dx, m.dy) < THRESHOLD) return;
      moved = true;
      h.onStart?.(m);
    }
    h.onMove?.(m);
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
  };
  const up = (e: PointerEvent) => {
    cleanup();
    h.onEnd?.({ e, dx: e.clientX - x0, dy: e.clientY - y0 }, moved);
  };
  const cancel = () => {
    cleanup();
    h.onCancel?.();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
}

/** Show the floating thumbnail and highlight the drop target under the pointer. */
export function trackGhost(
  e: PointerEvent,
  ghost: { photoId: string; count: number; w: number; h: number } | null,
): DropTarget {
  const target = hitTest(e.clientX, e.clientY);
  ui.set({
    ghost: ghost ? { ...ghost, clientX: e.clientX, clientY: e.clientY } : null,
    hoverKey: targetKey(target),
  });
  return target;
}

export function clearGhost(): void {
  ui.set({ ghost: null, hoverKey: null });
}
