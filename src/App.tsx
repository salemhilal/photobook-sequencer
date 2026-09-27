import { useEffect } from 'react';
import {
  Download,
  FilePlus,
  FileText,
  Package,
  FolderOpen,
  ImagePlus,
  Info,
  Compass,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import { usePasteHandler } from './clipboard';
import { runCommand, shortcutLabel, useCommandShortcuts, type CommandId } from './commands';
import { AboutDialog } from './components/AboutDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenus } from './components/ContextMenu';
import { Desk } from './components/Desk';
import { FileMenu } from './components/FileMenu';
import { PhotoImg } from './components/PhotoImg';
import { Preview } from './components/Preview';
import { QuickLook } from './components/QuickLook';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { SpreadEditor } from './components/SpreadEditor';
import { Tour } from './components/Tour';
import { usePersistence } from './persistence';
import { tourSeenPref } from './prefs';
import { startTour } from './tour';
import { docStore, useDoc } from './store';
import { openModal, toggleSidebar, ui } from './ui';
import { takeOver } from './tabLock';
import { checkForUpdate, reloadToUpdate } from './update';

const NOTICE_MS = 6000;

export default function App() {
  const { doc, canUndo, canRedo } = useDoc();
  const editing = ui.use((s) => s.editingSpreadId);
  const modal = ui.use((s) => s.modal);
  const importing = ui.use((s) => s.importing);
  const notice = ui.use((s) => s.notice);
  const busy = ui.use((s) => s.busy);
  const sidebarOpen = ui.use((s) => s.sidebarOpen);
  const outdated = ui.use((s) => s.outdated);
  const updateReady = ui.use((s) => s.updateReady);
  const elsewhere = ui.use((s) => s.elsewhere);
  const saveFailed = ui.use((s) => s.saveFailed);
  const windowTitle = ui.use((s) => s.windowTitle);
  const loaded = usePersistence();

  useCommandShortcuts();
  usePasteHandler();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => ui.set({ notice: null }), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // The first time this browser opens the app to an empty project, show the tour.
  const fresh = loaded && Object.keys(doc.photos).length === 0;
  useEffect(() => {
    if (fresh && !tourSeenPref.load()) startTour();
  }, [fresh]);

  if (elsewhere) return <ElsewhereScreen />;
  if (outdated) return <OutdatedScreen />;
  if (!loaded) return <div className="loading">Opening your book…</div>;

  const working = importing !== null || busy !== null;
  const placed = doc.spreads.reduce((n, s) => n + s.items.length, 0);
  const status = importing?.total
    ? `Importing ${importing.done} of ${importing.total}…`
    : (busy ?? (importing ? 'Importing…' : `${doc.pile.length} on desk · ${placed} placed`));

  const fileItem = (id: CommandId, label: string, icon: React.ReactNode, disabled = working) => ({
    label,
    icon,
    shortcut: shortcutLabel(id),
    disabled,
    onSelect: () => runCommand(id),
  });

  return (
    <div className="app">
      {/* In the Mac app this is also the window's title bar: drag it to move the window. */}
      <header className="toolbar" data-tauri-drag-region>
        <span className="wordmark">SEQUENCER</span>
        {windowTitle && (
          <div className="window-title">
            {windowTitle.name}
            {windowTitle.edited && <span className="muted"> — Edited</span>}
          </div>
        )}
        {/* The Mac app has these in its menu bar. */}
        {!__NATIVE_APP__ && (
          <FileMenu
            items={[
              fileItem('newProject', 'New project…', <FilePlus />),
              { ...fileItem('addPhotos', 'Add photos…', <ImagePlus />, importing !== null), separatorBefore: true },
              fileItem('importProject', 'Import project…', <FolderOpen />),
              fileItem('exportProject', 'Export project', <Download />),
              fileItem('savePdf', 'Save PDF', <FileText />),
              fileItem('exportIndesign', 'Export for InDesign', <Package />),
              { ...fileItem('tour', 'Take the tour', <Compass />), separatorBefore: true },
              fileItem('about', 'About…', <Info />, false),
            ]}
          />
        )}
        <div className="btn-joined has-hint">
          <button
            className="btn ghost icon"
            aria-label="Undo"
            title={`Undo (${shortcutLabel('undo')})`}
            disabled={!canUndo}
            onClick={() => docStore.undo()}
          >
            <Undo2 />
          </button>
          <button
            className="btn ghost icon"
            aria-label="Redo"
            title={`Redo (${shortcutLabel('redo')})`}
            disabled={!canRedo}
            onClick={() => docStore.redo()}
          >
            <Redo2 />
          </button>
          <ShortcutHint label={`${shortcutLabel('undo')} · ${shortcutLabel('redo')}`} below />
        </div>
        <span className="spacer" data-tauri-drag-region />
        <span className="status" data-tauri-drag-region>
          {status}
        </span>
        <button
          className="btn accent has-hint"
          data-tour="preview"
          onClick={() => openModal('preview')}
          title={`Preview book (${shortcutLabel('preview')})`}
        >
          Preview book
          <ShortcutHint label={shortcutLabel('preview')} />
        </button>
        <button
          className={`btn ghost icon has-hint${sidebarOpen ? '' : ' active'}`}
          aria-label={sidebarOpen ? 'Hide spreads' : 'Show spreads'}
          aria-pressed={!sidebarOpen}
          onClick={toggleSidebar}
          title={`${sidebarOpen ? 'Hide' : 'Show'} spreads (${shortcutLabel('toggleSidebar')})`}
        >
          {sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
          <ShortcutHint label={shortcutLabel('toggleSidebar')} />
        </button>
        <button
          className="btn ghost icon has-hint"
          aria-label="Settings"
          onClick={() => openModal('settings')}
          title={`Settings (${shortcutLabel('settings')})`}
        >
          <Settings />
          <ShortcutHint label={shortcutLabel('settings')} />
        </button>
      </header>
      <main className="main">
        <Desk />
        {sidebarOpen && <Sidebar />}
        {editing && <SpreadEditor spreadId={editing} />}
      </main>
      {modal === 'settings' && <SettingsDialog />}
      {modal === 'about' && <AboutDialog />}
      {modal === 'preview' && <Preview />}
      <QuickLook />
      <Tour />
      <ConfirmDialog />
      <ContextMenus />
      <DragGhost />
      {saveFailed && (
        <div className="save-failed" role="alert">
          Couldn't save your work. Your browser's storage may be full.
          <button className="btn primary" onClick={() => runCommand('exportProject')}>
            Export a copy
          </button>
        </div>
      )}
      {updateReady && (
        <div className="update-bar" role="status">
          A new version is available.
          <button className="btn primary" onClick={reloadToUpdate}>
            Reload
          </button>
        </div>
      )}
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

/** A shortcut badge shown over (or `below`) its button while the modifier key is held. */
function ShortcutHint({ label, below }: { label: string; below?: boolean }) {
  const show = ui.use((s) => s.hints);
  if (!show) return null;
  return (
    <kbd className={`shortcut-hint${below ? ' below' : ''}`} aria-hidden="true">
      {label}
    </kbd>
  );
}

/** Shown instead of the app when the saved project is from a newer version of the app. */
/** Shown instead of the app while another tab or window is editing the project. */
function ElsewhereScreen() {
  return (
    <div className="screen-message" role="alert">
      <span className="wordmark">SEQUENCER</span>
      <h1>Photobook Sequencer is open in another window.</h1>
      <p>To keep your work safe, only one window can edit at a time. Using it here stops the other one.</p>
      <button className="btn primary" onClick={takeOver}>
        Use it here
      </button>
    </div>
  );
}

function OutdatedScreen() {
  // The newer version may not have downloaded yet; look for it now.
  useEffect(checkForUpdate, []);
  return (
    <div className="screen-message" role="alert">
      <span className="wordmark">SEQUENCER</span>
      <h1>This project was saved by a newer version of Photobook Sequencer.</h1>
      <p>Reload to update. Your saved project hasn't been changed.</p>
      <button className="btn primary" onClick={reloadToUpdate}>
        Reload
      </button>
    </div>
  );
}

function DragGhost() {
  const ghost = ui.use((s) => s.ghost);
  if (!ghost) return null;
  return (
    <div
      className="drag-ghost"
      style={{ left: ghost.clientX - ghost.w / 2, top: ghost.clientY - ghost.h / 2, width: ghost.w, height: ghost.h }}
    >
      <PhotoImg id={ghost.photoId} />
      {ghost.count > 1 && <span className="drag-ghost-count">{ghost.count}</span>}
    </div>
  );
}
