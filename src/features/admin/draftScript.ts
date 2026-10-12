/**
 * Listening scripts as editable text in the import review
 */

/**
 * Script lines as editable text: one "A: text" turn per line
 */
export function scriptToText(script: { speaker: string; text: string }[]): string {
  return script.map((line) => `${line.speaker}: ${line.text}`).join('\n');
}

export function textToScript(text: string, singleSpeaker: boolean): { speaker: string; text: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([ABC])\s*:\s*(.*)$/.exec(line);
      if (singleSpeaker) return { speaker: 'A', text: match ? match[2] : line };
      return match ? { speaker: match[1], text: match[2] } : { speaker: 'A', text: line };
    });
}
