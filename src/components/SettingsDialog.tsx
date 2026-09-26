import { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { current } from 'immer';
import { relayoutRect } from '../geometry';
import { docStore, useDoc } from '../store';
import type { ThemePref } from '../theme';
import type { Doc, Spread } from '../types';
import { setTheme, ui } from '../ui';
import { DeskColorPicker } from './DeskColorPicker';
import { NumberField } from './NumberField';

/**
 * The layout that a run of page-size edits is computed from. Relaying out from
 * this fixed starting point (rather than from the previous size) keeps edits order-independent
 * and exactly reversible. It resets when anything else changes the spreads.
 */
let resizeSession: { base: Doc; out: Spread[] } | null = null;

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemePicker() {
  const theme = ui.use((s) => s.theme);
  return (
    <div className="segmented" role="radiogroup" aria-labelledby="appearance-label">
      {THEMES.map((t) => (
        <label key={t.value} className={theme === t.value ? 'on' : ''}>
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={theme === t.value}
            onChange={() => setTheme(t.value)}
          />
          {t.label}
        </label>
      ))}
    </div>
  );
}

export function SettingsDialog() {
  const { doc } = useDoc();
  const s = doc.settings;
  const close = () => ui.set({ settingsOpen: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Each field edit is one undo step (a gesture from focus to blur), and every
  // value typed is computed from the session base, so intermediate values don't distort photos.
  const setPageSize = (dim: 'pageW' | 'pageH', n: number) => {
    const start = docStore.gestureStart;
    if (!resizeSession || (start.spreads !== resizeSession.out && start.spreads !== resizeSession.base.spreads)) {
      resizeSession = { base: start, out: start.spreads };
    }
    const base = resizeSession.base;
    docStore.preview((d) => {
      d.settings[dim] = n;
      if (!d.settings.keepRelative) return;
      const to = current(d.settings);
      for (const spread of d.spreads) {
        const baseItems = base.spreads.find((s) => s.id === spread.id)?.items;
        for (const item of spread.items) {
          const from = baseItems?.find((i) => i.photoId === item.photoId);
          if (from) Object.assign(item, relayoutRect(from, base.settings, to));
        }
      }
    });
    resizeSession.out = docStore.doc.spreads;
  };
  const pageSizeField = {
    min: 1,
    onBegin: () => docStore.begin(),
    onEnd: () => docStore.end(),
  };

  const maxBorder = Math.min(s.pageW, s.pageH) / 2 - 0.1;
  const dropGuide = Math.min(...s.borders);

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal settings" data-modal role="dialog" aria-label="Settings">
        <header className="modal-head">
          <div className="modal-title">Settings</div>
          <span className="spacer" />
          <button className="btn ghost icon" aria-label="Close" onClick={close}>
            <X />
          </button>
        </header>
        <div className="settings-body">
          <section className="setting">
            <h3>Page size</h3>
            <div className="setting-controls">
              <div className="inline">
                <NumberField
                  label="W"
                  suffix=""
                  {...pageSizeField}
                  value={s.pageW}
                  onCommit={(n) => setPageSize('pageW', n)}
                />
                <NumberField
                  label="H"
                  suffix=""
                  {...pageSizeField}
                  value={s.pageH}
                  onCommit={(n) => setPageSize('pageH', n)}
                />
                <span className="muted data">in</span>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.keepRelative}
                  onChange={(e) => docStore.apply((d) => void (d.settings.keepRelative = e.target.checked))}
                />
                Keep photos relative to guides
              </label>
              <p className="help">
                {s.keepRelative
                  ? 'When the size changes, photos move and scale with the guides.'
                  : 'When the size changes, photos keep their exact position.'}
              </p>
            </div>
          </section>

          <section className="setting">
            <h3>Center lines</h3>
            <div className="setting-controls">
              <div className="inline">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.centerV}
                    onChange={(e) => docStore.apply((d) => void (d.settings.centerV = e.target.checked))}
                  />
                  Vertical
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.centerH}
                    onChange={(e) => docStore.apply((d) => void (d.settings.centerH = e.target.checked))}
                  />
                  Horizontal
                </label>
              </div>
            </div>
          </section>

          <section className="setting">
            <h3>Border guides</h3>
            <div className="setting-controls">
              {s.borders.map((b, i) => (
                <div className="inline guide-row" key={i}>
                  <NumberField
                    value={b}
                    min={0}
                    onCommit={(n) =>
                      docStore.apply((d) => void (d.settings.borders[i] = Math.min(n, maxBorder)), {
                        coalesce: `border:${i}`,
                      })
                    }
                  />
                  <button
                    className="btn ghost icon small"
                    aria-label={`Remove ${b} in guide`}
                    onClick={() => docStore.apply((d) => void d.settings.borders.splice(i, 1))}
                  >
                    <X />
                  </button>
                  {b === dropGuide && (
                    <span className="tag" title="New photos fit inside this guide">
                      on drop
                    </span>
                  )}
                </div>
              ))}
              <button
                className="btn ghost add-guide"
                onClick={() =>
                  docStore.apply((d) => {
                    const last = d.settings.borders.at(-1) ?? 0.25;
                    d.settings.borders.push(Math.min(maxBorder, last + 0.25));
                  })
                }
              >
                <Plus />
                Add guide
              </button>
              <p className="help">Measured in from each page's outside edges.</p>
            </div>
          </section>

          <section className="setting app-setting">
            <h3 id="appearance-label">Appearance</h3>
            <div className="setting-controls">
              <ThemePicker />
            </div>
          </section>

          <section className="setting">
            <h3>Desk</h3>
            <div className="setting-controls">
              <DeskColorPicker />
              <p className="help">Also in the desk's right-click menu.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
