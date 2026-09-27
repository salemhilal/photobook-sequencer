import { describe, expect, it } from 'vitest';
import { readImageInfo } from './imageInfo';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u16be = (v: number) => [v >> 8, v & 0xff];
const u16le = (v: number) => [v & 0xff, v >> 8];
const u32le = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24];
const u32be = (v: number) => [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

/** A JPEG's APP1 segment with an EXIF block: orientation, X resolution, and its unit. */
function exifSegment(orientation: number, xRes: number, unit: number): number[] {
  const entry = (tag: number, type: number, value: number[]) => [...u16le(tag), ...u16le(type), ...u32le(1), ...value];
  const ifdEnd = 8 + 2 + 3 * 12 + 4;
  const tiff = [
    ...bytes('II'),
    ...u16le(42),
    ...u32le(8),
    ...u16le(3),
    ...entry(0x0112, 3, [...u16le(orientation), 0, 0]),
    ...entry(0x011a, 5, u32le(ifdEnd)),
    ...entry(0x0128, 3, [...u16le(unit), 0, 0]),
    ...u32le(0),
    ...u32le(xRes),
    ...u32le(1),
  ];
  const body = [...bytes('Exif\0\0'), ...tiff];
  return [0xff, 0xe1, ...u16be(body.length + 2), ...body];
}

describe('readImageInfo', () => {
  it('reads a JPEG’s JFIF resolution', () => {
    const jfif = bytes('JFIF\0', [1, 1, 1], u16be(300), u16be(300), [0, 0]);
    const info = readImageInfo(bytes([0xff, 0xd8, 0xff, 0xe0], u16be(jfif.length + 2), [...jfif], [0xff, 0xda]));
    expect(info).toEqual({ format: 'jpeg', ppi: 300, orientation: 1 });
  });

  it('reads EXIF orientation and resolution, in centimeters too', () => {
    const info = readImageInfo(bytes([0xff, 0xd8], exifSegment(6, 100, 3), [0xff, 0xda]));
    expect(info.orientation).toBe(6);
    expect(info.ppi).toBeCloseTo(254);
  });

  it('reads a PNG’s pHYs resolution', () => {
    const phys = [...bytes('pHYs'), ...u32be(11811), ...u32be(11811), 1];
    const info = readImageInfo(bytes([0x89], 'PNG\r\n\x1a\n', u32be(9), phys, [0, 0, 0, 0]));
    expect(info.format).toBe('png');
    expect(info.ppi).toBeCloseTo(300, 0);
  });

  it('assumes 72 ppi and upright when a file says nothing', () => {
    expect(readImageInfo(bytes([0xff, 0xd8, 0xff, 0xda]))).toEqual({ format: 'jpeg', ppi: 72, orientation: 1 });
    expect(readImageInfo(bytes('GIF89a')).format).toBe('other');
  });
});
