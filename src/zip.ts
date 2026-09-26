/**
 * Minimal ZIP support, built on Blobs so large files are never fully loaded into memory.
 * Writing stores entries uncompressed (photos are already compressed).
 * Reading slices entries straight out of the file; deflated entries are also supported.
 * ZIP64 (archives over 4 GB) is not supported.
 */

const LIMIT = 0xffffffff;
const CHUNK = 8 * 1024 * 1024;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  for (let start = 0; start < blob.size; start += CHUNK) {
    const bytes = new Uint8Array(await blob.slice(start, start + CHUNK).arrayBuffer());
    for (const b of bytes) crc = (CRC_TABLE[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipInput {
  name: string;
  data: Blob;
}

export class ZipTooLargeError extends Error {
  constructor() {
    super('This project is larger than 4 GB, which the export format does not support yet.');
  }
}

export async function createZip(entries: ZipInput[], onProgress?: (done: number) => void): Promise<Blob> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const [i, entry] of entries.entries()) {
    const name = enc.encode(entry.name);
    const size = entry.data.size;
    const crc = await crc32(entry.data);
    if (offset + 30 + name.length + size > LIMIT) throw new ZipTooLargeError();

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, entry.data);

    const cd = new DataView(new ArrayBuffer(46 + name.length));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    const cdBytes = new Uint8Array(cd.buffer);
    cdBytes.set(name, 46);
    central.push(cdBytes);

    offset += 30 + name.length + size;
    onProgress?.(i + 1);
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + cdSize + 22 > LIMIT || entries.length > 0xffff) throw new ZipTooLargeError();
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

export interface ZipEntry {
  name: string;
  size: number;
  /** The entry's contents, typed as `type`. Stored entries are zero-copy slices of the file. */
  blob(type?: string): Promise<Blob>;
}

export class NotAZipError extends Error {
  constructor(detail = "This file isn't a ZIP archive.") {
    super(detail);
  }
}

export async function readZip(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailSize = Math.min(file.size, 22 + 0xffff);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new NotAZipError();
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === LIMIT || count === 0xffff) throw new NotAZipError('This archive uses ZIP64, which is not supported.');

  const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new NotAZipError('The archive is damaged.');
    const method = cd.getUint16(p + 10, true);
    const compressed = cd.getUint32(p + 20, true);
    const size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOffset = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    entries.set(name, {
      name,
      size,
      async blob(type = '') {
        const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
        if (local.getUint32(0, true) !== 0x04034b50) throw new NotAZipError('The archive is damaged.');
        const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        const raw = file.slice(start, start + compressed, type);
        if (method === 0) return raw;
        if (method === 8) {
          const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Blob([await new Response(stream).arrayBuffer()], { type });
        }
        throw new NotAZipError(`"${name}" uses an unsupported compression method.`);
      },
    });
  }
  return entries;
}
