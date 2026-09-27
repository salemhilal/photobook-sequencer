import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

/** Files on the Mac: the Save dialog, and writing through the app's Rust side. */

const FILE_TYPES: Record<string, string> = {
  'photo-sequence': 'Photobook Sequencer project',
  pdf: 'PDF',
  zip: 'ZIP archive',
};

/** Ask where to save `filename`; resolves to the chosen path, or null if cancelled. */
export async function chooseSaveLocation(filename: string): Promise<string | null> {
  const ext = filename.slice(filename.lastIndexOf('.') + 1);
  return save({
    defaultPath: filename,
    filters: [{ name: FILE_TYPES[ext] ?? ext.toUpperCase(), extensions: [ext] }],
  });
}

/** Pieces a file is sent to the app in (see begin_save in src-tauri/src/lib.rs). */
const CHUNK = 8 * 1024 * 1024;

/**
 * Write a file, however large: it's sent in pieces to a temporary file, and the target is
 * only touched once all of it has arrived. Rejects with the reason if it can't be written.
 */
export async function writeFile(path: string, blob: Blob, onProgress?: (fraction: number) => void): Promise<void> {
  const id = await invoke<number>('begin_save');
  try {
    for (let at = 0; at < blob.size; at += CHUNK) {
      onProgress?.(at / blob.size);
      const piece = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
      await invoke('append_save', piece, { headers: { save: String(id) } });
    }
    await invoke('finish_save', { id, path });
  } catch (e) {
    void invoke('finish_save', { id, path: null }).catch(() => {});
    throw e;
  }
}
