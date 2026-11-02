/**
 * Plain-text files attached to the grammar chat (notes, exercises, subtitles)
 */

/** Characters kept from a file; the server accepts the same amount */
export const MAX_TEXT_CHARS = 8000;
/** Larger files are refused before reading */
const MAX_TEXT_BYTES = 1024 * 1024;

export interface TextAttachment {
  name: string;
  text: string;
}

export const isTextFile = (file: File): boolean => file.type.startsWith('text/') || file.type === 'application/json' || /\.(txt|md|csv|json|srt|vtt)$/i.test(file.name);

/**
 * @throws Error when the file is not plain text or is too large
 */
export async function readTextFile(file: File): Promise<TextAttachment> {
  if (!isTextFile(file) || file.size > MAX_TEXT_BYTES) throw new Error('Unsupported file');
  return { name: file.name.slice(0, 100), text: (await file.text()).slice(0, MAX_TEXT_CHARS) };
}
