import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { startDocuments } from './document';
import { setUpMenu } from './nativeMenu';

/**
 * The Mac app's side of things the website does with browser features. Loaded only
 * in the app's build (see __NATIVE_APP__), so none of it ships to the website.
 */

const FILE_TYPES: Record<string, string> = {
  'photo-sequence': 'Photobook Sequencer project',
  pdf: 'PDF',
  zip: 'ZIP archive',
};

/** Save a file where the user chooses; resolves to false if they cancel. */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  const ext = filename.slice(filename.lastIndexOf('.') + 1);
  const path = await save({
    defaultPath: filename,
    filters: [{ name: FILE_TYPES[ext] ?? ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return true;
}

export function startNative(): void {
  void setUpMenu();
  void startDocuments();
  if (__E2E__) void import('./e2e').then((m) => m.runE2E());

  // Links to websites and email open in the user's browser and mail app, not in the app's window.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]');
    const href = a?.getAttribute('href');
    if (!href || !/^(https?|mailto):/.test(href)) return;
    e.preventDefault();
    void openUrl(href);
  });
}
