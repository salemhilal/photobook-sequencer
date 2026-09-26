import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, LayoutGrid } from 'lucide-react';
import { tidyPile } from '../actions';
import { copyPhotoToClipboard } from '../images';
import { useDoc } from '../store';
import { ui, type ContextMenuState } from '../ui';
import { DeskColorPicker } from './DeskColorPicker';

/** Renders whichever right-click menu is open. */
export function ContextMenus() {
  const menu = ui.use((s) => s.contextMenu);
  if (!menu) return null;
  const close = () => ui.set({ contextMenu: null });
  return (
    <MenuShell key={`${menu.x},${menu.y}`} x={menu.x} y={menu.y} onClose={close}>
      {menu.kind === 'desk' ? <DeskItems onClose={close} /> : <PhotoItems menu={menu} onClose={close} />}
    </MenuShell>
  );
}

/** Positions a menu at the pointer (kept on screen) and closes it on outside click, Escape, or blur. */
function MenuShell({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

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

  return (
    <div
      ref={ref}
      className="menu-list context-menu"
      role="menu"
      style={pos}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

function DeskItems({ onClose }: { onClose: () => void }) {
  const { doc } = useDoc();
  const selection = ui.use((s) => s.selection);
  const tidySelection = selection.length > 1;
  const canTidy = tidySelection || doc.pile.length > 1;
  return (
    <>
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
    </>
  );
}

function PhotoItems({ menu, onClose }: { menu: Extract<ContextMenuState, { kind: 'photo' }>; onClose: () => void }) {
  const { doc } = useDoc();
  const name = doc.photos[menu.photoId]?.name ?? 'Photo';
  return (
    <>
      <div className="menu-caption data muted" title={name}>
        {name}
      </div>
      <button
        className="menu-item"
        role="menuitem"
        onClick={() => {
          // The clipboard write must start inside the click, so it isn't awaited first.
          copyPhotoToClipboard(menu.photoId).then(
            () => ui.set({ notice: `Copied ${name}` }),
            () => ui.set({ notice: "Couldn't copy the image. Your browser may not allow it." }),
          );
          onClose();
        }}
      >
        <Copy />
        <span className="menu-label">Copy image</span>
      </button>
    </>
  );
}
