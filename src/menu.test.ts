// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFromMenu } from './commands';
import { projectStore, emptyProject } from './store';
import { ui } from './ui';

afterEach(() => {
  document.body.replaceChildren();
  ui.set({ modal: null });
  projectStore.reset(emptyProject());
});

describe('runFromMenu', () => {
  it('runs the command', () => {
    projectStore.apply((d) => void (d.settings.pageW = 12));
    expect(runFromMenu('undo')).toBe(true);
    expect(projectStore.project.settings.pageW).toBe(10);
  });

  it('gives a focused text field its own editing instead', () => {
    projectStore.apply((d) => void (d.settings.pageW = 12));
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const fallback = vi.fn();
    expect(runFromMenu('undo', fallback)).toBe(false);
    expect(fallback).toHaveBeenCalled();
    expect(projectStore.project.settings.pageW).toBe(12);
  });

  it('leaves desk commands alone while something covers the desk', () => {
    ui.set({ modal: 'settings', selection: [] });
    expect(runFromMenu('selectAll')).toBe(false);
  });
});
