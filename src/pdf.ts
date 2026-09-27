import { getImage } from './db';
import { pageSides } from './geometry';
import { platform } from '#platform';
import { docStore } from './store';
import { ui } from './ui';

const PT_PER_INCH = 72;

/**
 * Render the book as a PDF: one PDF page per spread, at true size, with the first
 * and last pages as single pages. Photos are cropped at the page edges; guides are omitted.
 */
export async function renderPdf(onProgress: (done: number, total: number) => void): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = docStore.doc;
  const { pageW, pageH } = doc.settings;
  const pdf = await PDFDocument.create();
  pdf.setTitle('Photo book');
  pdf.setCreator('Photobook Sequencer');

  for (const [i, spread] of doc.spreads.entries()) {
    const sides = pageSides(spread.kind);
    const left = sides[0] === 'left' ? -pageW : 0;
    const page = pdf.addPage([sides.length * pageW * PT_PER_INCH, pageH * PT_PER_INCH]);

    for (const p of [...spread.items].sort((a, b) => a.z - b.z)) {
      const img = await getImage(p.photoId);
      if (!img) continue;
      // Display copies are always JPEG and already have EXIF orientation applied.
      // An unreadable one is left out rather than failing the whole book.
      const embedded = await img.thumb
        .arrayBuffer()
        .then((bytes) => pdf.embedJpg(bytes))
        .catch(() => null);
      if (!embedded) continue;
      page.drawImage(embedded, {
        x: (p.x - left) * PT_PER_INCH,
        // PDF's origin is the bottom-left corner.
        y: (pageH - p.y - p.h) * PT_PER_INCH,
        width: p.w * PT_PER_INCH,
        height: p.h * PT_PER_INCH,
      });
    }
    onProgress(i + 1, doc.spreads.length);
  }

  const bytes = await pdf.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/** Render and save the PDF, reporting progress and errors in the UI. */
export async function savePdf(): Promise<void> {
  if (ui.get().busy || ui.get().importing) return;
  try {
    await platform.saveFile(`photo-book-${new Date().toISOString().slice(0, 10)}.pdf`, () => {
      ui.set({ busy: 'Rendering PDF…' });
      return renderPdf((done, total) => ui.set({ busy: `Rendering PDF ${done} of ${total}…` }));
    });
  } catch {
    ui.set({ notice: "Couldn't make the PDF." });
  } finally {
    ui.set({ busy: null });
  }
}
