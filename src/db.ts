import type { Doc } from './types';

const DB_NAME = 'photobook';
const DB_VERSION = 1;
const STATE = 'state';
const IMAGES = 'images';
const DOC_KEY = 'doc';

export interface StoredImage {
  /** The original file, kept for future export. */
  full: Blob;
  /** Downscaled JPEG used for display. */
  thumb: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE);
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function loadDoc(): Promise<Doc | undefined> {
  return wrap((await store(STATE, 'readonly')).get(DOC_KEY) as IDBRequest<Doc | undefined>);
}

export async function saveDoc(doc: Doc): Promise<void> {
  await wrap((await store(STATE, 'readwrite')).put(doc, DOC_KEY));
}

export async function putImage(id: string, img: StoredImage): Promise<void> {
  await wrap((await store(IMAGES, 'readwrite')).put(img, id));
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return wrap((await store(IMAGES, 'readonly')).get(id) as IDBRequest<StoredImage | undefined>);
}

export async function imageIds(): Promise<string[]> {
  const keys = await wrap((await store(IMAGES, 'readonly')).getAllKeys());
  return keys.filter((k): k is string => typeof k === 'string');
}

export async function deleteImage(id: string): Promise<void> {
  await wrap((await store(IMAGES, 'readwrite')).delete(id));
}
