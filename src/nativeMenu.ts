import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { openUrl } from '@tauri-apps/plugin-opener';
import { runFromMenu, shortcutAccelerator, type CommandId } from './commands';
import { quit } from './document';
import { isTextField } from './platform';
import { docStore } from './store';
import { ui } from './ui';

/**
 * The Mac app's menu bar, built from the command table (so it always matches the
 * shortcuts), with the standard macOS items around it.
 */

const REPO = 'https://github.com/salemhilal/photobook-sequencer';

/** A menu item for a command; `textFallback` edits the focused text field instead, when there is one. */
function command(id: CommandId, text: string, textFallback?: () => void) {
  return MenuItem.new({
    id,
    text,
    accelerator: shortcutAccelerator(id),
    action: () => void runFromMenu(id, textFallback),
  });
}

const separator = () => PredefinedMenuItem.new({ item: 'Separator' });
const predefined = (item: 'Cut' | 'Copy' | 'Paste' | 'Minimize' | 'Maximize' | 'Fullscreen') =>
  PredefinedMenuItem.new({ item });
// Text fields' own editing, for menu shortcuts typed in them.
const inField = (cmd: 'undo' | 'redo' | 'selectAll') => () => void document.execCommand(cmd);

export async function setUpMenu(): Promise<void> {
  const undo = await command('undo', 'Undo', inField('undo'));
  const redo = await command('redo', 'Redo', inField('redo'));
  const sidebar = await command('toggleSidebar', 'Hide Spreads');

  const menu = await Menu.new({
    items: [
      // macOS titles the first menu with the app's name.
      await Submenu.new({
        text: 'Photobook Sequencer',
        items: [
          await command('about', 'About Photobook Sequencer'),
          await separator(),
          await command('settings', 'Settings…'),
          await separator(),
          await PredefinedMenuItem.new({ item: 'Services' }),
          await separator(),
          await PredefinedMenuItem.new({ item: 'Hide', text: 'Hide Photobook Sequencer' }),
          await PredefinedMenuItem.new({ item: 'HideOthers' }),
          await PredefinedMenuItem.new({ item: 'ShowAll' }),
          await separator(),
          // Not the standard Quit, so unsaved changes get the chance to be saved.
          await MenuItem.new({ text: 'Quit Photobook Sequencer', accelerator: 'CmdOrCtrl+Q', action: quit }),
        ],
      }),
      await Submenu.new({
        text: 'File',
        items: [
          await command('newProject', 'New Project…'),
          await command('importProject', 'Open…'),
          await separator(),
          await command('addPhotos', 'Add Photos…'),
          await separator(),
          await PredefinedMenuItem.new({ item: 'CloseWindow' }),
          await command('exportProject', 'Save'),
          await command('saveAs', 'Save As…'),
          await separator(),
          await command('savePdf', 'Save PDF…'),
          await command('exportIndesign', 'Export for InDesign…'),
        ],
      }),
      await Submenu.new({
        text: 'Edit',
        items: [
          undo,
          redo,
          await separator(),
          // Native, so they work in text fields; on the desk, the page handles ⌘C and ⌘V itself.
          await predefined('Cut'),
          await predefined('Copy'),
          await predefined('Paste'),
          await command('duplicate', 'Duplicate'),
          await command('deleteSelection', 'Delete'),
          await separator(),
          await command('selectAll', 'Select All', inField('selectAll')),
        ],
      }),
      await Submenu.new({
        text: 'View',
        items: [await command('preview', 'Preview Book'), sidebar, await separator(), await predefined('Fullscreen')],
      }),
      await Submenu.new({
        text: 'Window',
        items: [await predefined('Minimize'), await predefined('Maximize')],
      }),
      await Submenu.new({
        text: 'Help',
        items: [
          await command('tour', 'Take the Tour'),
          await MenuItem.new({ text: 'Photobook Sequencer on GitHub', action: () => void openUrl(REPO) }),
        ],
      }),
    ],
  });
  await menu.setAsAppMenu();

  // Keep items that depend on state in step with it, updating only what changed. Undo
  // and Redo stay enabled in text fields, where they undo typing.
  let shown = '';
  const sync = () => {
    const { canUndo, canRedo } = docStore.getSnapshot();
    const typing = isTextField(document.activeElement);
    const state = { undo: canUndo || typing, redo: canRedo || typing, sidebar: ui.get().sidebarOpen };
    const key = JSON.stringify(state);
    if (key === shown) return;
    shown = key;
    void undo.setEnabled(state.undo);
    void redo.setEnabled(state.redo);
    void sidebar.setText(state.sidebar ? 'Hide Spreads' : 'Show Spreads');
  };
  sync();
  docStore.subscribe(sync);
  ui.subscribe(sync);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', () => setTimeout(sync));

  // Edit → Copy clicked with photos selected: copy them (⌘C is handled by the page itself).
  document.addEventListener('copy', (e) => {
    if (isTextField(document.activeElement) || !ui.get().selection.length) return;
    e.preventDefault();
    runFromMenu('copy');
  });
}
