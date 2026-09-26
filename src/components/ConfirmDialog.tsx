import { ui } from '../ui';
import { Dialog } from './Dialog';

/** The in-app confirmation requested with `ask()`. */
export function ConfirmDialog() {
  const req = ui.use((s) => s.confirm);
  if (!req) return null;
  return (
    <Dialog label={req.title} onClose={() => req.resolve(null)} className="confirm" role="alertdialog">
      <div className="confirm-body">
        <h2>{req.title}</h2>
        <p>{req.message}</p>
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
    </Dialog>
  );
}
