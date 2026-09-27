import { largestBorder, pageRect, pageSides } from './geometry';
import type { Doc, Settings, Spread } from './types';
import type { ZipInput } from './zip';

/**
 * Build an IDML file (InDesign Markup Language: a ZIP of XML that InDesign opens
 * as a new document). The book becomes a facing-pages document with the same
 * page size and spreads, the largest border guide as margins, the other guides as
 * ruler guides, and each photo as a frame with its image linked from `Links/`.
 *
 * Coordinates: an IDML spread's origin is at its binding (our gutter) and vertical
 * center, in points; y grows downward, as in the app.
 */

const PT = 72;
const PKG = 'http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging';
const DOM = '8.0';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const LAYER = 'layer';
/** Space between spreads on InDesign's pasteboard. */
const SPREAD_SPACING = 36;

/** A photo's image file, relative to the IDML file. */
export interface LinkedImage {
  path: string;
  format: 'jpeg' | 'png';
  /** The file's stored resolution, which InDesign sizes it by. */
  ppi: number;
  /** The file's pixel size (upright). */
  pxW: number;
  pxH: number;
}

export function buildIdml(doc: Doc, links: Map<string, LinkedImage>): ZipInput[] {
  let nextId = 0;
  const id = () => `u${(++nextId).toString(16)}`;
  const { settings } = doc;
  const spreadFiles = doc.spreads.map((spread, i) => {
    const spreadId = id();
    return {
      name: `Spreads/Spread_${spreadId}.xml`,
      xml: spreadXml(doc, spread, i, spreadId, id, links),
    };
  });
  const pageCount = doc.spreads.reduce((n, s) => n + pageSides(s.kind).length, 0);

  const designmap = `${HEAD}
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="8.0(370)" ?>
<Document xmlns:idPkg="${PKG}" DOMVersion="${DOM}" Self="d">
<idPkg:Preferences src="Resources/Preferences.xml"/>
<Layer Self="${LAYER}" Name="Photos" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true"/>
${spreadFiles.map((f) => `<idPkg:Spread src="${f.name}"/>`).join('\n')}
</Document>`;

  const container = `${HEAD}
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles>
</container>`;

  return [
    // The package type must come first, and uncompressed (createZip stores everything).
    { name: 'mimetype', data: new Blob(['application/vnd.adobe.indesign-idml-package']) },
    { name: 'designmap.xml', data: xmlBlob(designmap) },
    { name: 'META-INF/container.xml', data: xmlBlob(container) },
    { name: 'Resources/Preferences.xml', data: xmlBlob(preferencesXml(settings, pageCount)) },
    ...spreadFiles.map((f) => ({ name: f.name, data: xmlBlob(f.xml) })),
  ];
}

function preferencesXml(s: Settings, pageCount: number): string {
  const w = s.pageW * PT;
  const h = s.pageH * PT;
  return `${HEAD}
<idPkg:Preferences xmlns:idPkg="${PKG}" DOMVersion="${DOM}">
<DocumentPreference PageHeight="${n(h)}" PageWidth="${n(w)}" PagesPerDocument="${pageCount}" FacingPages="true" StartPageNumber="1" PageBinding="LeftToRight" AllowPageShuffle="true" DocumentBleedUniformSize="true" DocumentBleedTopOffset="0" DocumentBleedBottomOffset="0" DocumentBleedInsideOrLeftOffset="0" DocumentBleedOutsideOrRightOffset="0" Intent="PrintIntent"/>
${marginXml(s)}
<ViewPreference HorizontalMeasurementUnits="Inches" VerticalMeasurementUnits="Inches"/>
</idPkg:Preferences>`;
}

function marginXml(s: Settings): string {
  const m = largestBorder(s) * PT;
  return `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="${n(m)}" Bottom="${n(m)}" Left="${n(m)}" Right="${n(m)}" ColumnDirection="Horizontal" ColumnsPositions="0 ${n(s.pageW * PT - 2 * m)}"/>`;
}

function spreadXml(
  doc: Doc,
  spread: Spread,
  index: number,
  spreadId: string,
  id: () => string,
  links: Map<string, LinkedImage>,
): string {
  const s = doc.settings;
  const sides = pageSides(spread.kind);
  const first = doc.spreads.slice(0, index).reduce((n, sp) => n + pageSides(sp.kind).length, 0);
  const top = (-s.pageH * PT) / 2;

  const pages = sides.map((side, i) => {
    const x = pageRect(side, s).x * PT;
    return `<Page Self="${id()}" Name="${first + i + 1}" AppliedMaster="n" GeometricBounds="0 0 ${n(s.pageH * PT)} ${n(s.pageW * PT)}" ItemTransform="1 0 0 1 ${n(x)} ${n(top)}" MasterPageTransform="1 0 0 1 0 0">
${marginXml(s)}
${guidesXml(s, i, id)}
</Page>`;
  });

  const frames = [...spread.items]
    .sort((a, b) => a.z - b.z)
    .map((p) => {
      const x1 = p.x * PT;
      const y1 = p.y * PT + top;
      const x2 = x1 + p.w * PT;
      const y2 = y1 + p.h * PT;
      const points = [
        [x1, y1],
        [x1, y2],
        [x2, y2],
        [x2, y1],
      ]
        .map(([x, y]) => {
          const at = `${n(x!)} ${n(y!)}`;
          return `<PathPointType Anchor="${at}" LeftDirection="${at}" RightDirection="${at}"/>`;
        })
        .join('');
      const meta = doc.photos[p.photoId];
      const link = links.get(p.photoId);
      const image = link ? imageXml(id, link, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }) : '';
      return `<Rectangle Self="${id()}" Name="${esc(meta?.name ?? '$ID/')}" ContentType="GraphicType" StoredState="Normal" ItemLayer="${LAYER}" Locked="false" Visible="true" AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0" ItemTransform="1 0 0 1 0 0">
<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${points}</PathPointArray></GeometryPathType></PathGeometry></Properties>
${image}
</Rectangle>`;
    });

  const offset = index * (s.pageH * PT + SPREAD_SPACING);
  return `${HEAD}
<idPkg:Spread xmlns:idPkg="${PKG}" DOMVersion="${DOM}">
<Spread Self="${spreadId}" PageCount="${sides.length}" BindingLocation="${sides[0] === 'left' ? 1 : 0}" ShowMasterItems="true" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 ${n(offset)}">
${pages.join('\n')}
${frames.join('\n')}
</Spread>
</idPkg:Spread>`;
}

/** Ruler guides for the center lines and every border guide but the one used as margins. */
function guidesXml(s: Settings, pageIndex: number, id: () => string): string {
  const w = s.pageW * PT;
  const h = s.pageH * PT;
  const margin = largestBorder(s);
  const vertical: number[] = [];
  const horizontal: number[] = [];
  if (s.centerV) vertical.push(w / 2);
  if (s.centerH) horizontal.push(h / 2);
  for (const b of new Set(s.borders)) {
    if (b === margin) continue;
    vertical.push(b * PT, w - b * PT);
    horizontal.push(b * PT, h - b * PT);
  }
  const guide = (orientation: string, at: number) =>
    `<Guide Self="${id()}" OrientationKind="${orientation}" Location="${n(at)}" FitToPage="true" ViewThreshold="0" Locked="false" ItemLayer="${LAYER}" PageIndex="${pageIndex}" GuideType="Ruler"/>`;
  return [...vertical.map((v) => guide('Vertical', v)), ...horizontal.map((y) => guide('Horizontal', y))].join('\n');
}

/** A linked image filling its frame: scaled from its size at its stored resolution. */
function imageXml(id: () => string, link: LinkedImage, frame: { x: number; y: number; w: number; h: number }): string {
  const gw = (link.pxW * PT) / link.ppi;
  const gh = (link.pxH * PT) / link.ppi;
  const sx = frame.w / gw;
  const sy = frame.h / gh;
  const format = link.format === 'png' ? '$ID/Portable Network Graphics (PNG)' : '$ID/JPEG';
  const ppi = n(link.ppi);
  return `<Image Self="${id()}" ItemTransform="${n(sx)} 0 0 ${n(sy)} ${n(frame.x)} ${n(frame.y)}" ActualPpi="${ppi} ${ppi}" EffectivePpi="${Math.round(link.ppi / sx)} ${Math.round(link.ppi / sy)}">
<Properties><GraphicBounds Left="0" Top="0" Right="${n(gw)}" Bottom="${n(gh)}"/></Properties>
<Link Self="${id()}" LinkResourceURI="file:${esc(link.path.split('/').map(encodeURIComponent).join('/'))}" LinkResourceFormat="${format}" StoredState="Normal" LinkClassID="35906" LinkClientID="257" LinkResourceModified="false" LinkObjectModified="false" ShowInUI="true" CanEmbed="true" CanUnembed="true" CanPackage="true" ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport"/>
</Image>`;
}

/** A number for XML: no exponent notation, and no floating-point noise. */
function n(v: number): string {
  return String(Math.round(v * 10000) / 10000);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function xmlBlob(xml: string): Blob {
  return new Blob([xml], { type: 'application/xml' });
}
