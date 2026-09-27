// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildIdml } from './idml';
import { emptyDoc } from './store';
import type { Doc } from './types';

async function build(doc: Doc, links = new Map()) {
  const entries = buildIdml(doc, links);
  const files = new Map<string, Document>();
  for (const e of entries) {
    if (e.name.endsWith('.xml')) files.set(e.name, new DOMParser().parseFromString(await e.data.text(), 'text/xml'));
  }
  return { entries, files };
}

function sample(): Doc {
  const doc = emptyDoc(); // 10 × 8 in pages; borders 0.5 and 1.25; four spreads
  doc.photos.a = { id: 'a', name: 'a & b.jpg', pxW: 3000, pxH: 2000 };
  doc.spreads[1]!.items.push({ photoId: 'a', x: -9, y: 1, w: 6, h: 4, z: 1 });
  return doc;
}

describe('buildIdml', () => {
  it('starts with the package type, and lists every spread', async () => {
    const { entries, files } = await build(sample());
    expect(entries[0]!.name).toBe('mimetype');
    expect(await entries[0]!.data.text()).toBe('application/vnd.adobe.indesign-idml-package');
    const spreads = [...files.get('designmap.xml')!.getElementsByTagName('idPkg:Spread')];
    expect(spreads).toHaveLength(4);
    for (const s of spreads) expect(files.has(s.getAttribute('src')!)).toBe(true);
  });

  it('sets up facing pages at the book’s size, with the largest border guide as margins', async () => {
    const { files } = await build(sample());
    const prefs = files.get('Resources/Preferences.xml')!;
    const doc = prefs.querySelector('DocumentPreference')!;
    expect(doc.getAttribute('PageWidth')).toBe('720');
    expect(doc.getAttribute('PageHeight')).toBe('576');
    // More would leave InDesign's own blank pages ahead of the book's.
    expect(doc.getAttribute('PagesPerDocument')).toBe('1');
    expect(doc.getAttribute('FacingPages')).toBe('true');
    expect(prefs.querySelector('MarginPreference')!.getAttribute('Top')).toBe('36');
  });

  it('places pages around the binding, with single first and last pages', async () => {
    const { files } = await build(sample());
    const spreads = [...files.entries()].filter(([name]) => name.startsWith('Spreads/')).map(([, d]) => d);
    const pages = (d: Document) => [...d.querySelectorAll('Page')].map((p) => p.getAttribute('ItemTransform'));
    expect(pages(spreads[0]!)).toEqual(['1 0 0 1 0 -288']);
    expect(pages(spreads[1]!)).toEqual(['1 0 0 1 -720 -288', '1 0 0 1 0 -288']);
    expect(pages(spreads[3]!)).toEqual(['1 0 0 1 -720 -288']);
    expect(spreads[0]!.querySelector('Spread')!.getAttribute('BindingLocation')).toBe('0');
    expect(spreads[1]!.querySelector('Page')!.getAttribute('Name')).toBe('2');
    // The 1.25 in border guide and the center lines become ruler guides: 3 vertical and 3 horizontal.
    expect(spreads[1]!.querySelector('Page')!.querySelectorAll('Guide')).toHaveLength(6);
    // Vertical guides are measured from the spread's left edge.
    const right = spreads[1]!.querySelectorAll('Page')[1]!;
    const verticals = [...right.querySelectorAll('Guide[Orientation="Vertical"]')].map((g) =>
      g.getAttribute('Location'),
    );
    expect(verticals).toEqual(['1080', '810', '1350']);
    const horizontals = [...right.querySelectorAll('Guide[Orientation="Horizontal"]')].map((g) =>
      g.getAttribute('Location'),
    );
    expect(horizontals).toEqual(['288', '90', '486']);
  });

  it('frames each photo where it sits, with its image scaled by its resolution', async () => {
    const links = new Map([
      ['a', { path: 'Links/a & b.jpg', format: 'jpeg' as const, ppi: 300, pxW: 3000, pxH: 2000 }],
    ]);
    const { files } = await build(sample(), links);
    const spread = [...files.entries()].filter(([name]) => name.startsWith('Spreads/'))[1]![1];
    const rect = spread.querySelector('Rectangle')!;
    expect(rect.getAttribute('Name')).toBe('a & b.jpg');
    const anchors = [...rect.querySelectorAll('PathPointType')].map((p) => p.getAttribute('Anchor'));
    expect(anchors).toEqual(['-648 -216', '-648 72', '-216 72', '-216 -216']);
    const image = rect.querySelector('Image')!;
    // 3000 px at 300 ppi is 720 pt wide; the frame is 432 pt.
    expect(image.getAttribute('ItemTransform')).toBe('0.6 0 0 0.6 -648 -216');
    expect(image.querySelector('GraphicBounds')!.getAttribute('Right')).toBe('720');
    expect(image.querySelector('Link')!.getAttribute('LinkResourceURI')).toBe('file:Links/a%20%26%20b.jpg');
  });

  it('leaves a frame empty when its image is missing', async () => {
    const { files } = await build(sample());
    const spread = [...files.entries()].filter(([name]) => name.startsWith('Spreads/'))[1]![1];
    expect(spread.querySelector('Rectangle')).not.toBeNull();
    expect(spread.querySelector('Image')).toBeNull();
  });
});
