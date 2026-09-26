/**
 * Whether the browser will keep this site's storage. By default browsers may clear
 * it when space runs low (and Safari after 7 days without a visit, unless the app is
 * installed). Persistent storage asks them not to.
 */

export interface StorageStatus {
  persisted: boolean;
  /** Bytes used by this site, if the browser reports it. */
  usage: number | null;
}

export async function readStorageStatus(): Promise<StorageStatus | null> {
  if (!navigator.storage?.persisted) return null;
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted(),
    navigator.storage.estimate?.().catch(() => undefined),
  ]);
  return { persisted, usage: estimate?.usage ?? null };
}

/** Ask to keep storage. Some browsers decide silently; Firefox asks the user. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
