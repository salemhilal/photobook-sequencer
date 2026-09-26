import { useEffect, useRef, useState } from 'react';
import { deleteFromProject, importPhotos } from './actions';
import { Desk } from './components/Desk';
import { PhotoImg } from './components/PhotoImg';
import { Preview } from './components/Preview';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { SpreadEditor } from './components/SpreadEditor';
import { deleteImage, imageIds, loadDoc, saveDoc } from './db';
import { forgetUrl } from './images';
import { docStore, emptyDoc, useDoc } from './store';
import type { Doc } from './types';
import { isTyping, ui } from './ui';

const SAVE_DELAY = 400;

export default function App() {
  const { doc, canUndo, canRedo } = useDoc();
  const editing = ui.use((s) => s.editingSpreadId);
  const previewOpen = ui.use((s) => s.previewOpen);
  const settingsOpen = ui.use((s) => s.settingsOpen);
  const importing = ui.use((s) => s.importing);
  const notice = ui.use((s) => s.notice);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = usePersistence();

  useGlobalKeys();

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
        <button className="btn primary" onClick={openFiles} disabled={importing !== null}>
          Add photos
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
          <button className="btn icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => docStore.undo()}>
            ↶
          </button>
          <button className="btn icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => docStore.redo()}>
            ↷
          </button>
        </div>
        <span className="status">
          {importing
            ? `Importing ${importing.done} of ${importing.total}…`
            : `${doc.pile.length} on desk · ${placed} placed`}
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => ui.set({ previewOpen: true })}>
          Preview book
        </button>
        <button className="btn" onClick={() => ui.set({ settingsOpen: true })}>
          Settings
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
            ×
          </button>
        </div>
      )}
    </div>
  );
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
        docStore.reset(stored ? migrate(stored) : emptyDoc());
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

/** Fill in fields that older saved docs may lack. */
function migrate(stored: Doc): Doc {
  const base = emptyDoc();
  return { ...base, ...stored, settings: { ...base.settings, ...stored.settings } };
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
