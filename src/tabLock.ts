/**
 * Only one tab (or installed-app window) edits the project at a time. Two editors
 * would overwrite each other's saves, and one's image cleanup could delete photos
 * the other just added. The Web Locks API gives one tab the lock; others show a
 * "use it here" screen, which takes the lock over and stops the first tab.
 */

const LOCK = 'photobook-sequencer-editor';
/** Set just before reloading to take the lock from another tab. */
const TAKE_OVER_KEY = 'photobook-take-over';

let claim: Promise<boolean> | null = null;

/**
 * Become the editing tab. Resolves false if another tab already is. If another tab
 * takes over later, `onLost` runs. Claimed once per page load and held until it closes.
 */
export function claimEditor(onLost: () => void): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(true);
  claim ??= new Promise((resolve) => {
    const steal = readTakeOver();
    navigator.locks
      .request(LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) return resolve(false);
        resolve(true);
        // Hold the lock until the page closes.
        return new Promise<void>(() => {});
      })
      // Rejects (AbortError) when another tab takes the lock over.
      .catch(onLost);
  });
  return claim;
}

/** Take editing over from the other tab: reload, then claim the lock by force. */
export function takeOver(): void {
  try {
    sessionStorage.setItem(TAKE_OVER_KEY, '1');
  } catch {
    // Without session storage the reload just asks again.
  }
  location.reload();
}

function readTakeOver(): boolean {
  try {
    const v = sessionStorage.getItem(TAKE_OVER_KEY) === '1';
    sessionStorage.removeItem(TAKE_OVER_KEY);
    return v;
  } catch {
    return false;
  }
}
