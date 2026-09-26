import { registerSW } from 'virtual:pwa-register';
import { ui } from './ui';

/**
 * Offline support and updates. A service worker (production builds only) keeps
 * the app available offline. When a new version has downloaded, it waits, and
 * the app offers a reload instead of switching mid-edit.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

export function startOfflineSupport(): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    onNeedRefresh: () => ui.set({ updateReady: true }),
    onOfflineReady: () => ui.set({ notice: 'Ready to work offline.' }),
    onRegisteredSW: (_url, r) => {
      registration = r;
      // Long-open tabs still hear about new versions.
      setInterval(checkForUpdate, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });
}

export function checkForUpdate(): void {
  void registration?.update().catch(() => {
    // Offline or unreachable; try again later.
  });
}

/** Reload into the newest version: activate a downloaded update if there is one. */
export function reloadToUpdate(): void {
  if (ui.get().updateReady && applyUpdate) void applyUpdate(true);
  else location.reload();
}
