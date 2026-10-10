/**
 * PDF page rendering in the admin's browser (pdf.js, loaded on demand)
 * Used for page previews, OCR images of scanned pages, and cropping Part 1 photos.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Render scale for images sent to OCR and for crops (~150 dpi) */
export const HIGH_RES_SCALE = 2;
const JPEG_QUALITY = 0.86;

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/**
 * pdf.js with its worker configured
 */
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();

/**
 * Opens a PDF from an authenticated media URL (cached per URL)
 */
export function openPdf(url: string): Promise<PDFDocumentProxy> {
  let doc = documents.get(url);
  if (!doc) {
    doc = (async () => {
      const [pdfjs, response] = await Promise.all([loadPdfjs(), fetch(url, { credentials: 'same-origin' })]);
      if (!response.ok) throw new Error(`PDF download failed (${response.status})`);
      return pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
    })();
    documents.set(url, doc);
    doc.catch(() => documents.delete(url));
  }
  return doc;
}

/**
 * Renders one page (1-based) to a new canvas
 */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

/**
 * Canvas (or a region of it) as a JPEG blob
 */
export function canvasToJpeg(source: HTMLCanvasElement, region?: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  let canvas = source;
  if (region) {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(region.width));
    canvas.height = Math.max(1, Math.round(region.height));
    canvas.getContext('2d')!.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/jpeg', JPEG_QUALITY)
  );
}
