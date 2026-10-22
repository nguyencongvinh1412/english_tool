/**
 * Shrinks a picture to a JPEG data URL small enough to send with a chat message
 */

/** Longest side after shrinking; text in a screenshot stays readable at this size */
const MAX_SIDE = 1280;
const QUALITY = 0.8;
/** Pictures larger than this are refused before decoding */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * @throws Error when the file is not an image the browser can decode
 */
export async function imageToDataUrl(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > MAX_FILE_BYTES) throw new Error('Unsupported image');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unsupported image');
    // JPEG has no transparency: put the picture on white
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}
