import { registerSW } from 'virtual:pwa-register';
import { ui } from './ui';

/**
 * Offline support and updates. A service worker (production builds only) keeps
 * the app available offline. When a new version has downloaded, it waits, and
 * the app offers a reload instead of switching mid-edit.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;

export function startOfflineSupport(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
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

const ACTIVATE_TIMEOUT_MS = 3000;

/**
 * Reload into the newest version. If an update is waiting, tell it to take over
 * first, then reload once it has. (Relying only on `controllerchange` isn't enough:
 * it never fires for a page the service worker doesn't control yet, such as the
 * first visit or after a hard reload.)
 */
export function reloadToUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return location.reload();
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  waiting.addEventListener('statechange', () => waiting.state === 'activated' && reload());
  waiting.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(reload, ACTIVATE_TIMEOUT_MS);
}
