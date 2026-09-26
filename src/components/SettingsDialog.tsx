import { useEffect } from 'react';
import { current } from 'immer';
import { relayoutRect } from '../geometry';
import { docStore, useDoc } from '../store';
import { applyTheme, saveTheme, type ThemePref } from '../theme';
import type { Doc, Spread } from '../types';

/**
 * The layout that a run of page-size edits is computed from. Relaying out from
 * this fixed starting point (rather than from the previous size) keeps edits order-independent
 * and exactly reversible. It resets when anything else changes the spreads.
 */
let resizeSession: { base: Doc; out: Spread[] } | null = null;
import { ui } from '../ui';
import { NumberField } from './NumberField';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemePicker() {
  const theme = ui.use((s) => s.theme);
  const choose = (t: ThemePref) => {
    ui.set({ theme: t });
    applyTheme(t);
    saveTheme(t);
  };
  return (
    <div className="segmented" role="radiogroup" aria-labelledby="appearance-label">
      {THEMES.map((t) => (
        <label key={t.value} className={theme === t.value ? 'on' : ''}>
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={theme === t.value}
            onChange={() => choose(t.value)}
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

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal settings" data-modal role="dialog" aria-label="Settings">
        <header className="modal-head">
          <div className="modal-title">Settings</div>
          <span className="spacer" />
          <button className="btn icon" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div className="settings-body">
          <section>
            <h3 id="appearance-label">Appearance</h3>
            <ThemePicker />
          </section>
          <section>
            <h3>Page size</h3>
            <p className="muted small">Each page, in inches.</p>
            <div className="row">
              <NumberField
                label="Width"
                {...pageSizeField}
                value={s.pageW}
                onCommit={(n) => setPageSize('pageW', n)}
              />
              <span className="muted">×</span>
              <NumberField
                label="Height"
                {...pageSizeField}
                value={s.pageH}
                onCommit={(n) => setPageSize('pageH', n)}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={s.keepRelative}
                onChange={(e) => docStore.apply((d) => void (d.settings.keepRelative = e.target.checked))}
              />{' '}
              Keep photos relative to guides when resizing
            </label>
            <p className="muted small check-help">
              {s.keepRelative
                ? 'Photos move with the page edges, guides, and center, and scale toward the page center.'
                : 'Photos keep their exact size and distance from the gutter.'}
            </p>
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
