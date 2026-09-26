import { useEffect } from 'react';
import { ui } from '../ui';

/** The in-app confirmation requested with `ask()`. */
export function ConfirmDialog() {
  const req = ui.use((s) => s.confirm);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        req.resolve(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;
  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && req.resolve(null)}>
      <div className="modal confirm" data-modal role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-body">
          <h2 id="confirm-title">{req.title}</h2>
          <p id="confirm-message">{req.message}</p>
        </div>
        <div className="confirm-actions">
          {req.actions.map((a) => (
            <button
              key={a.value}
              className={`btn${a.primary ? ' primary' : ''}`}
              autoFocus={a.primary}
              onClick={() => req.resolve(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
