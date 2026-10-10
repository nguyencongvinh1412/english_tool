/**
 * Text extraction from uploaded test documents
 * PDF: one entry per page (unpdf). DOCX: raw text split into page-sized chunks (mammoth).
 */
import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import type { MediaAsset } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { storagePath } from '../services/storage.js';

export interface ExtractedPage {
  /** 1-based page number */
  n: number;
  text: string;
  /** Rendered page image, uploaded later by the admin's browser (PDF only) */
  imageAssetId?: string;
}

/** Characters per pseudo-page when splitting DOCX text */
const DOCX_PAGE_CHARS = 3000;
const MAX_PAGES = 400;

/**
 * Splits long text into chunks at paragraph boundaries
 */
function splitIntoPages(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const pages: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > DOCX_PAGE_CHARS) {
      pages.push(current.trim());
      current = '';
    }
    current += `${paragraph}\n\n`;
  }
  if (current.trim()) pages.push(current.trim());
  return pages;
}

/**
 * Extracts page texts from a stored PDF or DOCX
 * @throws HttpError 400 for unreadable or oversized documents
 */
export async function extractPages(asset: MediaAsset): Promise<ExtractedPage[]> {
  const data = await readFile(storagePath(asset.storageKey));

  let texts: string[];
  try {
    if (asset.mime === 'application/pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: false });
      texts = text;
    } else {
      const { value } = await mammoth.extractRawText({ buffer: data });
      texts = splitIntoPages(value);
    }
  } catch (error) {
    console.error('Document extraction failed:', error);
    throw new HttpError(400, 'This document could not be read. Is it a valid PDF or DOCX?', 'unreadable_document');
  }

  if (texts.length > MAX_PAGES) {
    throw new HttpError(400, `Documents are limited to ${MAX_PAGES} pages. Split the book into tests first.`, 'too_many_pages');
  }

  return texts.map((text, index) => ({ n: index + 1, text: text.replaceAll('\u0000', '').trim() }));
}
