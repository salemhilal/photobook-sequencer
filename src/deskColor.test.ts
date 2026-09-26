import { describe, expect, it } from 'vitest';
import { DESK_PRESETS, luminance } from './deskColor';

describe('desk colors', () => {
  it('lists presets from darkest to lightest', () => {
    const l = DESK_PRESETS.map((p) => luminance(p.value));
    expect(l).toEqual([...l].sort((a, b) => a - b));
  });
});
