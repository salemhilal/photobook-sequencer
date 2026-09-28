import { ui } from '../ui';
import { Dialog } from './Dialog';

/** The in-app confirmation requested with `ask()`. */
export function ConfirmDialog() {
  const req = ui.use((s) => s.confirm);
  if (!req) return null;
  return (
    <Dialog label={req.title} onClose={() => req.choose(null)} className="confirm" role="alertdialog">
      <div className="confirm-body">
        <h2>{req.title}</h2>
        <p>{req.message}</p>
      </div>
      <div className="confirm-actions">
        {req.actions.map((a, i) => (
          <button
            key={a.label}
            className={`btn${a.primary ? ' primary' : ''}`}
            autoFocus={a.primary}
            onClick={() => req.choose(i)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
