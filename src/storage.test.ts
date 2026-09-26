import { describe, expect, it } from 'vitest';
import { formatBytes } from './storage';

describe('formatBytes', () => {
  it('uses a readable unit', () => {
    expect([512, 1536, 5 * 1024 ** 2, 123 * 1024 ** 2, 3.2 * 1024 ** 3].map(formatBytes)).toEqual([
      '512 B',
      '1.5 KB',
      '5.0 MB',
      '123 MB',
      '3.2 GB',
    ]);
  });
});
