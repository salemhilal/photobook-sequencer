import { useEffect } from 'react';
import { docStore, useDoc } from '../store';
import { ui } from '../ui';
import { NumberField } from './NumberField';

export function SettingsDialog() {
  const { doc } = useDoc();
  const s = doc.settings;
  const close = () => ui.set({ settingsOpen: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const maxBorder = Math.min(s.pageW, s.pageH) / 2 - 0.1;

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal settings" data-modal role="dialog" aria-label="Book settings">
        <header className="modal-head">
          <div className="modal-title">Book settings</div>
          <span className="spacer" />
          <button className="btn icon" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div className="settings-body">
          <section>
            <h3>Page size</h3>
            <p className="muted small">Each page, in inches. Photos keep their position relative to the gutter.</p>
            <div className="row">
              <NumberField
                label="Width"
                min={1}
                value={s.pageW}
                onCommit={(n) => docStore.apply((d) => void (d.settings.pageW = n), { coalesce: 'pageW' })}
              />
              <span className="muted">×</span>
              <NumberField
                label="Height"
                min={1}
                value={s.pageH}
                onCommit={(n) => docStore.apply((d) => void (d.settings.pageH = n), { coalesce: 'pageH' })}
              />
            </div>
          </section>
          <section>
            <h3>Center lines</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={s.centerV}
                onChange={(e) => docStore.apply((d) => void (d.settings.centerV = e.target.checked))}
              />{' '}
              Vertical
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={s.centerH}
                onChange={(e) => docStore.apply((d) => void (d.settings.centerH = e.target.checked))}
              />{' '}
              Horizontal
            </label>
          </section>
          <section>
            <h3>Border guides</h3>
            <p className="muted small">
              Inches in from each page's outside edges. New photos fit inside the largest box (smallest inset).
            </p>
            {s.borders.map((b, i) => (
              <div className="row" key={i}>
                <NumberField
                  value={b}
                  min={0}
                  onCommit={(n) =>
                    docStore.apply((d) => void (d.settings.borders[i] = Math.min(n, maxBorder)), {
                      coalesce: `border:${i}`,
                    })
                  }
                />
                {b === Math.min(...s.borders) && <span className="muted small">largest · used on drop</span>}
                <span className="spacer" />
                <button
                  className="btn icon"
                  aria-label={`Remove ${b} in guide`}
                  onClick={() => docStore.apply((d) => void d.settings.borders.splice(i, 1))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="btn"
              onClick={() =>
                docStore.apply((d) => {
                  const last = d.settings.borders.at(-1) ?? 0.25;
                  d.settings.borders.push(Math.min(maxBorder, last + 0.25));
                })
              }
            >
              + Add guide
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
