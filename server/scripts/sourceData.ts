/**
 * Helpers for the scripts that build the bundled dictionary data
 */

export async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'english-tool data build' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Minimal CSV parser (quoted fields may contain commas); a byte-order mark is dropped
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') {
        cells.push(cell);
        cell = '';
      } else cell += char;
    }
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}
