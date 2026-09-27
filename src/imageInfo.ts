/**
 * What InDesign needs to know about an image file that browsers don't tell us:
 * its stored resolution (InDesign sizes placed images by it) and, for JPEGs, its
 * EXIF orientation (which InDesign doesn't apply, unlike browsers).
 */
export interface ImageInfo {
  format: 'jpeg' | 'png' | 'other';
  /** Pixels per inch, horizontally; 72 when the file doesn't say. */
  ppi: number;
  /** EXIF orientation, 1 (upright) when absent. */
  orientation: number;
}

const DEFAULT_PPI = 72;
const CM_PER_INCH = 2.54;

export function readImageInfo(bytes: Uint8Array): ImageInfo {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return readPng(bytes);
  return { format: 'other', ppi: DEFAULT_PPI, orientation: 1 };
}

function readJpeg(bytes: Uint8Array): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let jfifPpi: number | null = null;
  let exif: { ppi: number | null; orientation: number } | null = null;
  let p = 2;
  while (p + 4 <= bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p + 1]!;
    // Start of scan: the metadata segments are all before it.
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(p + 2);
    const start = p + 4;
    if (marker === 0xe0 && ascii(bytes, start, 5) === 'JFIF\0' && start + 12 <= bytes.length) {
      const units = bytes[start + 7];
      const density = view.getUint16(start + 8);
      if (density && units === 1) jfifPpi = density;
      if (density && units === 2) jfifPpi = density * CM_PER_INCH;
    } else if (marker === 0xe1 && ascii(bytes, start, 6) === 'Exif\0\0') {
      exif = readExif(view, start + 6, Math.min(bytes.length, p + 2 + length));
    }
    p += 2 + length;
  }
  return { format: 'jpeg', ppi: jfifPpi ?? exif?.ppi ?? DEFAULT_PPI, orientation: exif?.orientation ?? 1 };
}

/** Orientation and resolution from the first IFD of an EXIF (TIFF) block. */
function readExif(view: DataView, tiff: number, end: number): { ppi: number | null; orientation: number } {
  const result = { ppi: null as number | null, orientation: 1 };
  try {
    const little = view.getUint16(tiff) === 0x4949;
    const u16 = (o: number) => view.getUint16(o, little);
    const u32 = (o: number) => view.getUint32(o, little);
    const ifd = tiff + u32(tiff + 4);
    let xRes: number | null = null;
    let unit = 2;
    for (let i = 0, n = u16(ifd); i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = u16(e);
      if (tag === 0x0112) result.orientation = u16(e + 8);
      else if (tag === 0x0128) unit = u16(e + 8);
      else if (tag === 0x011a) {
        const at = tiff + u32(e + 8);
        const den = u32(at + 4);
        if (den) xRes = u32(at) / den;
      }
    }
    if (xRes) result.ppi = unit === 3 ? xRes * CM_PER_INCH : xRes;
  } catch {
    // A malformed block just means no information.
  }
  return result;
}

function readPng(bytes: Uint8Array): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  while (p + 12 <= bytes.length) {
    const length = view.getUint32(p);
    const type = ascii(bytes, p + 4, 4);
    if (type === 'pHYs' && length >= 9) {
      const perMeter = view.getUint32(p + 8);
      // Unit 1 is meters; 0 means only the aspect ratio is known.
      if (bytes[p + 16] === 1 && perMeter)
        return { format: 'png', ppi: (perMeter * CM_PER_INCH) / 100, orientation: 1 };
    }
    if (type === 'IDAT' || type === 'IEND') break;
    p += 12 + length;
  }
  return { format: 'png', ppi: DEFAULT_PPI, orientation: 1 };
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
