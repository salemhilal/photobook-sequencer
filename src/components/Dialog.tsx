import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  /** Shown in a header with a close button. Omit for a header-less dialog. */
  title?: string;
  /** Accessible name, when there's no visible title. */
  label?: string;
  onClose: () => void;
  /** Extra class on the dialog box (for width and layout). */
  className?: string;
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
}

/**
 * A centered dialog over a blurred backdrop. Escape and clicking the backdrop close it.
 * Escape is caught before other key handlers, so only the dialog responds.
 */
export function Dialog({ title, label, onClose, className, role = 'dialog', children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className ?? ''}`} data-modal role={role} aria-label={title ?? label}>
        {title && (
          <header className="modal-head">
            <div className="modal-title">{title}</div>
            <span className="spacer" />
            <button className="btn ghost icon" aria-label="Close" onClick={onClose}>
              <X />
            </button>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
