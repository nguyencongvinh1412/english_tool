/**
 * Page previews of an imported book and the Part 1 photo cropper
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Modal, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { canvasToJpeg, HIGH_RES_SCALE, openPdf, renderPage } from './pdfPages';
import { uploadMedia, type ImportPage } from './importApi';

interface PagePreviewProps {
  docUrl: string | null;
  isPdf: boolean;
  page: ImportPage | undefined;
  scale: number;
  /** Render only once scrolled into view (thumbnail strips) */
  lazy?: boolean;
}

/**
 * One page: the PDF render, or its extracted text for DOCX
 */
export const PagePreview: React.FC<PagePreviewProps> = ({ docUrl, isPdf, page, scale, lazy = false }) => {
  const { t } = useI18n();
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [failed, setFailed] = useState(false);
  const pageNumber = page?.n;

  useEffect(() => {
    if (visible || !holderRef.current) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !isPdf || !docUrl || !pageNumber) return;
    let cancelled = false;
    openPdf(docUrl)
      .then((doc) => renderPage(doc, pageNumber, scale))
      .then((canvas) => {
        if (cancelled || !holderRef.current) return;
        canvas.className = 'page-preview__canvas';
        holderRef.current.replaceChildren(canvas);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [visible, isPdf, docUrl, pageNumber, scale]);

  if (!page) return <p className="page-preview__empty">{t.imports.noPreview}</p>;
  if (!isPdf || failed) {
    return <pre className="page-preview__text">{page.text || t.imports.noPreview}</pre>;
  }
  return (
    <div className="page-preview" ref={holderRef}>
      <Spinner size={20} />
    </div>
  );
};

interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Selections smaller than this (canvas pixels) are ignored */
const MIN_CROP_PX = 24;

interface PhotoCropModalProps {
  open: boolean;
  docUrl: string;
  pageCount: number;
  initialPage: number;
  onClose: () => void;
  /** Called with the uploaded image's asset id */
  onCropped: (assetId: string) => void;
}

/**
 * Renders a page large, lets the admin drag a box over the photo, and uploads the crop
 */
export const PhotoCropModal: React.FC<PhotoCropModalProps> = ({ open, docUrl, pageCount, initialPage, onClose, onCropped }) => {
  const { t } = useI18n();
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [page, setPage] = useState(initialPage);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    openPdf(docUrl)
      .then((doc) => renderPage(doc, page, HIGH_RES_SCALE))
      .then((canvas) => {
        if (cancelled || !holderRef.current) return;
        canvas.className = 'crop__canvas';
        canvasRef.current = canvas;
        holderRef.current.querySelector('canvas')?.remove();
        holderRef.current.prepend(canvas);
        setSize({ width: canvas.width, height: canvas.height });
        setSelection(null);
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [open, docUrl, page]);

  /** Pointer position in canvas pixels */
  const toCanvas = (event: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    return {
      x: Math.min(Math.max(0, (event.clientX - rect.left) * ratio), canvas.width),
      y: Math.min(Math.max(0, (event.clientY - rect.top) * ratio), canvas.height),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const point = toCanvas(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = point;
    setSelection({ ...point, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const start = dragRef.current;
    const point = toCanvas(event);
    if (!start || !point) return;
    setSelection({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const crop = async (): Promise<void> => {
    if (!canvasRef.current || !selection) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await canvasToJpeg(canvasRef.current, selection);
      const [asset] = await uploadMedia([{ blob, name: `photo-p${page}.jpg` }]);
      onCropped(asset.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const valid = selection !== null && selection.width >= MIN_CROP_PX && selection.height >= MIN_CROP_PX;
  // Selection box in percent, so it scales with the displayed canvas
  const box =
    selection && size
      ? {
          left: `${(selection.x / size.width) * 100}%`,
          top: `${(selection.y / size.height) * 100}%`,
          width: `${(selection.width / size.width) * 100}%`,
          height: `${(selection.height / size.height) * 100}%`,
        }
      : null;

  return (
    <Modal
      open={open}
      title={t.imports.cropTitle}
      onClose={onClose}
      closeLabel={t.common.close}
      size="lg"
      footer={
        <>
          <span className="crop__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              ‹
            </Button>
            {t.imports.page(page)}
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              ›
            </Button>
          </span>
          <Button icon="crop" onClick={crop} loading={busy} disabled={!valid}>
            {t.imports.useSelection}
          </Button>
        </>
      }
    >
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      <div
        className="crop"
        ref={holderRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        {box && <div className="crop__box" style={box} />}
      </div>
    </Modal>
  );
};
