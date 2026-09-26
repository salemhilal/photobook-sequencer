import { useEffect, useRef, useState } from 'react';
import { Redo2, Settings, Undo2, X } from 'lucide-react';
import { deleteFromProject, importPhotos } from './actions';
import { savePdf } from './pdf';
import { openProjectFile, saveProjectFile } from './project';
import { Desk } from './components/Desk';
import { PhotoImg } from './components/PhotoImg';
import { Preview } from './components/Preview';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { SpreadEditor } from './components/SpreadEditor';
import { deleteImage, imageIds, loadDoc, saveDoc } from './db';
import { forgetUrl } from './images';
import { docStore, emptyDoc, migrateDoc, useDoc } from './store';
import { hasMod, isMac, isTyping, MOD_LABEL, ui } from './ui';

const SAVE_DELAY = 400;
/** How long the modifier must be held before shortcut hints appear. */
const HINT_DELAY = 250;

const SHORTCUTS = { addPhotos: 'O', preview: 'P', settings: ',', export: 'S', import: 'I' } as const;
const UNDO_LABEL = `${MOD_LABEL}Z`;
const REDO_LABEL = isMac ? '⇧⌘Z' : 'Ctrl+Y';
const PDF_LABEL = isMac ? '⇧⌘P' : 'Ctrl+Shift+P';

export default function App() {
  const { doc, canUndo, canRedo } = useDoc();
  const editing = ui.use((s) => s.editingSpreadId);
  const previewOpen = ui.use((s) => s.previewOpen);
  const settingsOpen = ui.use((s) => s.settingsOpen);
  const importing = ui.use((s) => s.importing);
  const notice = ui.use((s) => s.notice);
  const busy = ui.use((s) => s.busy);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const loaded = usePersistence();

  useGlobalKeys();
  useShortcuts({
    addPhotos: () => {
      if (!ui.get().importing) fileRef.current?.click();
    },
    importProject: () => {
      if (!ui.get().importing) projectRef.current?.click();
    },
  });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => ui.set({ notice: null }), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const placed = doc.spreads.reduce((n, s) => n + s.items.length, 0);
  const openFiles = () => fileRef.current?.click();

  if (!loaded) return <div className="loading">Opening your book…</div>;

  return (
    <div className="app">
      <header className="toolbar">
        <button
          className="btn primary has-hint"
          onClick={openFiles}
          disabled={importing !== null}
          title={`Add photos (${MOD_LABEL}${SHORTCUTS.addPhotos})`}
        >
          Add photos
          <ShortcutHint k={SHORTCUTS.addPhotos} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void importPhotos(files);
          }}
        />
        <div className="btn-group">
          <button
            className="btn icon has-hint"
            aria-label="Undo"
            title={`Undo (${UNDO_LABEL})`}
            disabled={!canUndo}
            onClick={() => docStore.undo()}
          >
            <Undo2 />
            <ShortcutHint label={UNDO_LABEL} below />
          </button>
          <button
            className="btn icon has-hint"
            aria-label="Redo"
            title={`Redo (${REDO_LABEL})`}
            disabled={!canRedo}
            onClick={() => docStore.redo()}
          >
            <Redo2 />
            <ShortcutHint label={REDO_LABEL} below />
          </button>
        </div>
        <span className="status">
          {importing?.total
            ? `Importing ${importing.done} of ${importing.total}…`
            : busy
              ? busy
              : importing
                ? 'Importing…'
            : `${doc.pile.length} on desk · ${placed} placed`}
        </span>
        <span className="spacer" />
        <input
          ref={projectRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void openProjectFile(file);
          }}
        />
        <button
          className="btn has-hint"
          onClick={() => projectRef.current?.click()}
          disabled={importing !== null || busy !== null}
          title={`Open a project file (${MOD_LABEL}${SHORTCUTS.import})`}
        >
          Import
          <ShortcutHint k={SHORTCUTS.import} />
        </button>
        <button
          className="btn has-hint"
          onClick={() => void saveProjectFile()}
          disabled={importing !== null || busy !== null}
          title={`Save the project, photos included, as a .zip (${MOD_LABEL}${SHORTCUTS.export})`}
        >
          Export
          <ShortcutHint k={SHORTCUTS.export} />
        </button>
        <button
          className="btn has-hint"
          onClick={() => void savePdf()}
          disabled={importing !== null || busy !== null}
          title={`Download the book as a PDF (${PDF_LABEL})`}
        >
          Save PDF
          <ShortcutHint label={PDF_LABEL} />
        </button>
        <span className="toolbar-divider" />
        <button
          className="btn has-hint"
          onClick={() => ui.set({ previewOpen: true, settingsOpen: false })}
          title={`Preview book (${MOD_LABEL}${SHORTCUTS.preview})`}
        >
          Preview book
          <ShortcutHint k={SHORTCUTS.preview} />
        </button>
        <button
          className="btn icon has-hint"
          aria-label="Settings"
          onClick={() => ui.set({ settingsOpen: true, previewOpen: false })}
          title={`Settings (${MOD_LABEL}${SHORTCUTS.settings})`}
        >
          <Settings />
          <ShortcutHint k={SHORTCUTS.settings} />
        </button>
      </header>
      <main className="main">
        <Desk onAddPhotos={openFiles} />
        <Sidebar />
        {editing && <SpreadEditor spreadId={editing} />}
      </main>
      {settingsOpen && <SettingsDialog />}
      {previewOpen && <Preview />}
      <DragGhost />
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="btn icon" aria-label="Dismiss" onClick={() => ui.set({ notice: null })}>
            <X />
          </button>
        </div>
      )}
    </div>
  );
}

/** `k` is a key pressed with the modifier; `label` is a full custom label. */
function ShortcutHint({ k, label, below }: { k?: string; label?: string; below?: boolean }) {
  const show = ui.use((s) => s.hints);
  if (!show) return null;
  return (
    <kbd className={`shortcut-hint${below ? ' below' : ''}`} aria-hidden="true">
      {label ?? `${MOD_LABEL}${k ?? ''}`}
    </kbd>
  );
}

/**
 * App-level shortcuts, plus hints: holding the modifier alone for a moment
 * reveals each shortcut's key over its button.
 */
function useShortcuts(actions: { addPhotos: () => void; importProject: () => void }): void {
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  useEffect(() => {
    const modKey = isMac ? 'Meta' : 'Control';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      if (ui.get().hints) ui.set({ hints: false });
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.key === modKey) {
        if (!e.repeat) {
          clearTimeout(timer);
          timer = setTimeout(() => ui.set({ hints: true }), HINT_DELAY);
        }
        return;
      }
      hide();
      if (hasMod(e) && e.shiftKey && !e.altKey && e.key.toUpperCase() === 'P') {
        e.preventDefault();
        void savePdf();
        return;
      }
      if (!hasMod(e) || e.shiftKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === SHORTCUTS.addPhotos) {
        e.preventDefault();
        actionsRef.current.addPhotos();
      } else if (key === SHORTCUTS.import) {
        e.preventDefault();
        actionsRef.current.importProject();
      } else if (key === SHORTCUTS.export) {
        e.preventDefault();
        void saveProjectFile();
      } else if (key === SHORTCUTS.preview) {
        e.preventDefault();
        ui.set((s) => ({ previewOpen: !s.previewOpen, settingsOpen: false }));
      } else if (key === SHORTCUTS.settings) {
        e.preventDefault();
        ui.set((s) => ({ settingsOpen: !s.settingsOpen, previewOpen: false }));
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === modKey) hide();
    };

    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
}

function DragGhost() {
  const ghost = ui.use((s) => s.ghost);
  if (!ghost) return null;
  return (
    <div
      className="ghost"
      style={{ left: ghost.clientX - ghost.w / 2, top: ghost.clientY - ghost.h / 2, width: ghost.w, height: ghost.h }}
    >
      <PhotoImg id={ghost.photoId} />
      {ghost.count > 1 && <span className="ghost-count">{ghost.count}</span>}
    </div>
  );
}

function usePersistence(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};

    const save = async () => {
      await saveDoc(docStore.doc);
      await collectGarbage();
    };

    void loadDoc()
      .then((stored) => {
        if (cancelled) return;
        docStore.reset(stored ? migrateDoc(stored) : emptyDoc());
        setLoaded(true);
        void collectGarbage();
        let last = docStore.doc;
        unsubscribe = docStore.subscribe(() => {
          if (docStore.doc === last) return;
          last = docStore.doc;
          clearTimeout(timer);
          timer = setTimeout(() => void save(), SAVE_DELAY);
        });
      })
      .catch(() => {
        if (cancelled) return;
        ui.set({ notice: "Couldn't open saved work. Changes won't be saved in this browser." });
        setLoaded(true);
      });

    const flush = () => void saveDoc(docStore.doc);
    window.addEventListener('pagehide', flush);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return loaded;
}

/** Delete stored images no longer reachable from the document or its undo history. */
async function collectGarbage(): Promise<void> {
  if (ui.get().importing) return;
  const live = new Set<string>();
  for (const d of docStore.allDocs()) for (const id of Object.keys(d.photos)) live.add(id);
  for (const id of await imageIds()) {
    if (!live.has(id) && !ui.get().importing) {
      await deleteImage(id);
      forgetUrl(id);
    }
  }
}

function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) docStore.redo();
        else docStore.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        docStore.redo();
        return;
      }

      // Desk shortcuts only apply when no modal is open.
      const s = ui.get();
      if (s.editingSpreadId || s.previewOpen || s.settingsOpen) return;
      if (mod && key === 'a') {
        e.preventDefault();
        ui.set({ selection: docStore.doc.pile.map((p) => p.photoId) });
      } else if (e.key === 'Escape') {
        ui.set({ selection: [] });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection.length) {
        e.preventDefault();
        deleteFromProject(s.selection);
      } else if (e.key.startsWith('Arrow') && s.selection.length) {
        e.preventDefault();
        const n = e.shiftKey ? 1 : 1 / 8;
        const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
        const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
        const ids = new Set(s.selection);
        docStore.apply(
          (d) => {
            for (const p of d.pile) {
              if (!ids.has(p.photoId)) continue;
              p.x += dx;
              p.y += dy;
            }
          },
          { coalesce: 'desk-nudge' },
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
