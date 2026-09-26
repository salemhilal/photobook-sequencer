import { describe, expect, it } from 'vitest';
import { createZip, NotAZipError, readZip } from './zip';

const text = async (b: Blob) => b.text();

/** d.txt, compressed with deflate by macOS `zip -9`. */
const DEFLATED_ZIP = 'UEsDBBQAAgAIAGWHOl3RQ+bAEQAAACMAAAAFAAAAZC50eHRLzs8tKEotLlbITVVIxs4GAFBLAQIeAxQAAgAIAGWHOl3RQ+bAEQAAACMAAAAFAAAAAAAAAAEAAACkgQAAAABkLnR4dFBLBQYAAAAAAQABADMAAAA0AAAAAAA=';

describe('zip', () => {
  it('round-trips entries, including non-ASCII names', async () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 251);
    const zip = await createZip([
      { name: 'project.json', data: new Blob(['{"hello":"wörld"}']) },
      { name: 'images/Été (2).jpg', data: new Blob([big]) },
    ]);
    const entries = await readZip(zip);
    expect([...entries.keys()]).toEqual(['project.json', 'images/Été (2).jpg']);
    expect(await text(await entries.get('project.json')!.blob())).toBe('{"hello":"wörld"}');
    const img = await entries.get('images/Été (2).jpg')!.blob('image/jpeg');
    expect(img.type).toBe('image/jpeg');
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(big);
  });

  it('writes valid CRCs', async () => {
    const zip = await createZip([{ name: 'a.txt', data: new Blob(['hello']) }]);
    const view = new DataView(await zip.arrayBuffer());
    expect(view.getUint32(14, true)).toBe(0x3610a686); // CRC-32 of "hello"
  });

  it('reads deflated entries from archives made by other tools', async () => {
    const file = new Blob([Uint8Array.from(atob(DEFLATED_ZIP), (c) => c.charCodeAt(0))]);
    const entries = await readZip(file);
    expect(await text(await entries.get('d.txt')!.blob())).toBe('compress me compress me compress me');
  });

  it('rejects files that are not zips', async () => {
    await expect(readZip(new Blob(['not a zip at all']))).rejects.toBeInstanceOf(NotAZipError);
  });
});
