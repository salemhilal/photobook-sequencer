import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { tidyPile } from '../actions';
import { useDoc } from '../store';
import { ui } from '../ui';
import { DeskColorPicker } from './DeskColorPicker';

/** Right-click menu for the desk background. */
export function DeskMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { doc } = useDoc();
  const selection = ui.use((s) => s.selection);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const tidySelection = selection.length > 1;
  const canTidy = tidySelection || doc.pile.length > 1;

  return (
    <div
      ref={ref}
      className="menu-list context-menu"
      role="menu"
      style={pos}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        className="menu-item"
        role="menuitem"
        disabled={!canTidy}
        onClick={() => {
          tidyPile(tidySelection ? selection : undefined);
          onClose();
        }}
      >
        <LayoutGrid />
        <span className="menu-label">{tidySelection ? `Tidy up ${selection.length} photos` : 'Tidy up desk'}</span>
      </button>
      <div className="menu-separator" />
      <div className="menu-section">
        <span className="caps muted">Desk color</span>
        <DeskColorPicker />
      </div>
    </div>
  );
}
