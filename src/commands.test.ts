import { describe, expect, it } from 'vitest';
import { commands, shortcutAccelerator, shortcutLabel } from './commands';
import { isMac } from './platform';

describe('commands', () => {
  it('never bind the same key combination twice', () => {
    const seen = new Map<string, string>();
    for (const [id, c] of Object.entries(commands)) {
      for (const b of c.bindings) {
        const shifts = 'shift' in b && b.shift === 'any' ? [true, false] : ['shift' in b && b.shift === true];
        for (const shift of shifts) {
          const combo = `${'mod' in b && b.mod ? 'mod+' : ''}${shift ? 'shift+' : ''}${b.key}`;
          expect(seen.get(combo), `${combo} is bound by both ${seen.get(combo)} and ${id}`).toBeUndefined();
          seen.set(combo, id);
        }
      }
    }
  });

  it('labels shortcuts for display', () => {
    const labels = ['addPhotos', 'savePdf', 'settings', 'redo', 'about'].map((id) =>
      shortcutLabel(id as keyof typeof commands),
    );
    expect(labels).toEqual(isMac ? ['⌘I', '⇧⌘P', '⌘,', '⇧⌘Z', ''] : ['Ctrl+I', 'Ctrl+Shift+P', 'Ctrl+,', 'Ctrl+Y', '']);
  });

  it('gives menu accelerators for modifier shortcuts, and none for plain keys', () => {
    expect(shortcutAccelerator('addPhotos')).toBe('CmdOrCtrl+I');
    expect(shortcutAccelerator('importProject')).toBe('CmdOrCtrl+O');
    expect(shortcutAccelerator('savePdf')).toBe('CmdOrCtrl+Shift+P');
    expect(shortcutAccelerator('settings')).toBe('CmdOrCtrl+,');
    expect(shortcutAccelerator('deleteSelection')).toBeUndefined();
    expect(shortcutAccelerator('newProject')).toBeUndefined();
  });
});
