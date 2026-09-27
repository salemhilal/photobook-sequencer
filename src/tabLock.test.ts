import { describe, expect, it, vi } from 'vitest';

/** A tiny stand-in for navigator.locks: one holder per name, `steal` aborts the holder. */
function fakeLocks() {
  const held = new Map<string, () => void>();
  return {
    request(name: string, opts: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: object | null) => unknown) {
      return new Promise((resolve, reject) => {
        if (held.has(name) && !opts.steal) {
          resolve(cb(null));
          return;
        }
        held.get(name)?.();
        held.set(name, () => reject(new DOMException('stolen', 'AbortError')));
        void cb({});
      });
    },
  };
}

/** Each "tab" is a fresh module instance sharing one lock manager. */
async function openTab() {
  vi.resetModules();
  return import('./tabLock');
}

describe('claimEditor', () => {
  it('lets one tab edit, and a later take-over stops the first', async () => {
    const locks = fakeLocks();
    const session = new Map<string, string>();
    vi.stubGlobal('navigator', { locks });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => void session.set(k, v),
      removeItem: (k: string) => void session.delete(k),
    });

    const lostA = vi.fn();
    const tabA = await openTab();
    expect(await tabA.claimEditor(lostA)).toBe(true);

    const tabB = await openTab();
    expect(await tabB.claimEditor(vi.fn())).toBe(false);

    // Tab B chooses "Use it here": it reloads and claims by force.
    session.set('photobook-take-over', '1');
    const tabB2 = await openTab();
    expect(await tabB2.claimEditor(vi.fn())).toBe(true);
    await Promise.resolve();
    expect(lostA).toHaveBeenCalled();
    expect(session.has('photobook-take-over')).toBe(false);
  });

  it('allows editing where the browser has no Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    const tab = await openTab();
    expect(await tab.claimEditor(vi.fn())).toBe(true);
  });
});
