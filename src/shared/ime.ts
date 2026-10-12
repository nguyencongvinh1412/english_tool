/**
 * IME (Japanese, Chinese, Vietnamese Telex…) input helpers
 */
import type React from 'react';

/**
 * Whether a key event belongs to an active IME composition, e.g. Enter that picks a kanji.
 * Safari reports the confirming Enter after compositionend with keyCode 229, so check both.
 */
export function isImeComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}
