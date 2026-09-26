import { useSyncExternalStore } from 'react';
import { getImage, putImage } from './db';
import type { PhotoMeta } from './types';
import { newId } from './store';

const THUMB_MAX = 1400;

const urls = new Map<string, string>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Show `blob` as the photo's display image. */
export function setUrl(id: string, blob: Blob): void {
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, URL.createObjectURL(blob));
  emit();
}

async function load(id: string): Promise<void> {
  if (loading.has(id) || urls.has(id)) return;
  loading.add(id);
  try {
    const img = await getImage(id);
    if (img) setUrl(id, img.thumb);
  } finally {
    loading.delete(id);
  }
}

export function usePhotoUrl(id: string): string | undefined {
  const url = useSyncExternalStore(subscribe, () => urls.get(id));
  if (url === undefined) void load(id);
  return url;
}

export function forgetUrl(id: string): void {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

/**
 * A photo's original as PNG (the image type browsers can reliably put on the
 * clipboard), upright per its EXIF orientation. Falls back to the display copy
 * if the original can't be decoded.
 */
export async function photoAsPng(id: string): Promise<Blob> {
  const img = await getImage(id);
  if (!img) throw new Error('Image not found');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(img.full, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(img.thumb);
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Decode an image file (applying EXIF orientation) and make its display-size copy. */
export async function thumbFromBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    return await makeThumb(bitmap);
  } finally {
    bitmap.close();
  }
}

async function makeThumb(bitmap: ImageBitmap): Promise<Blob> {
  const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

export interface ImportResult {
  photos: PhotoMeta[];
  failed: string[];
}

/** Decode, thumbnail, and store files. EXIF orientation is applied by createImageBitmap. */
export async function importFiles(
  files: File[],
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const sorted = [...files]
    .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const photos: PhotoMeta[] = [];
  const failed: string[] = [];
  let done = 0;
  onProgress(0, sorted.length);

  // A few at a time keeps memory bounded for large batches.
  const queue = [...sorted];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const thumb = await makeThumb(bitmap);
        const meta: PhotoMeta = { id: newId(), name: file.name, pxW: bitmap.width, pxH: bitmap.height };
        bitmap.close();
        await putImage(meta.id, { full: file, thumb });
        setUrl(meta.id, thumb);
        photos.push(meta);
      } catch {
        failed.push(file.name);
      }
      onProgress(++done, sorted.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const order = new Map(sorted.map((f, i) => [f.name, i]));
  photos.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
  return { photos, failed };
}
