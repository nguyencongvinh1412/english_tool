/**
 * PNG export of a mind map
 * Drawn straight onto a canvas from the layout (not by capturing the screen), so the whole map is included even
 * when most of it is off screen, and the picture does not depend on the theme or the zoom level. Always light, for
 * sharing and printing.
 */
import { descendantCount, type MapDoc, type NodeColor } from './doc';
import { NODE_H, NODE_W, type MapLayout } from './mapLayout';

const PAD = 28;
const TITLE_H = 44;
/** Browsers refuse canvases much larger than this */
const MAX_SIDE = 12000;
const INK = '#2b2f36';
const MUTED = '#6b7280';

const FALLBACK: Record<NodeColor, string> = { listening: '#7c5cf0', reading: '#2f6bff', speaking: '#f08a00', writing: '#e5489a', exam: '#0e9fb5', brand: '#2f6bff' };

/** The app's own colours, so the picture matches what the learner sees */
function palette(): Record<NodeColor, string> {
  const style = getComputedStyle(document.documentElement);
  const colors = { ...FALLBACK };
  for (const name of Object.keys(colors) as NodeColor[]) colors[name] = style.getPropertyValue(`--${name}`).trim() || FALLBACK[name];
  return colors;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text shortened with an ellipsis to fit a width */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > width) end--;
  return `${text.slice(0, end)}…`;
}

export function drawMap(canvas: HTMLCanvasElement, doc: MapDoc, layout: MapLayout, tones: Map<string, NodeColor>, title: string): void {
  const colors = palette();
  const boxes = [...layout.positions.values()];
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const width = Math.max(...boxes.map((b) => b.x)) - minX + NODE_W + PAD * 2;
  const height = Math.max(...boxes.map((b) => b.y)) - minY + NODE_H + PAD * 2 + TITLE_H;
  const scale = Math.min(2, MAX_SIDE / width, MAX_SIDE / height);

  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const at = (id: string) => ({ x: layout.positions.get(id)!.x - minX + PAD, y: layout.positions.get(id)!.y - minY + PAD + TITLE_H });
  const font = (size: number, weight = 700) => `${weight} ${size}px Inter, "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Segoe UI", system-ui, sans-serif`;

  ctx.fillStyle = INK;
  ctx.font = font(20, 800);
  ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, title, width - PAD * 2), PAD, PAD / 2 + TITLE_H / 2);

  // Connections first, so nodes sit on top
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const link of layout.links) {
    const from = at(link.from);
    const to = at(link.to);
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    ctx.strokeStyle = colors[tones.get(link.to) ?? 'brand'];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2);
    ctx.stroke();
  }

  for (const id of layout.positions.keys()) {
    const node = doc.nodes[id];
    const { x, y } = at(id);
    const color = colors[tones.get(id) ?? 'brand'];
    const isRoot = id === doc.root;

    roundRect(ctx, x, y, NODE_W, NODE_H, isRoot ? NODE_H / 2 : 8);
    ctx.fillStyle = isRoot ? color : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.font = font(isRoot ? 15 : 13);
    ctx.fillStyle = isRoot ? '#ffffff' : INK;
    ctx.textAlign = isRoot ? 'center' : 'left';
    const room = NODE_W - 20 - (node.collapsed ? 26 : 0);
    ctx.fillText(fit(ctx, node.text, room), isRoot ? x + NODE_W / 2 : x + 10, y + NODE_H / 2 + 1);
    ctx.textAlign = 'left';

    // A collapsed node says how many ideas it hides
    if (node.collapsed) {
      ctx.font = font(11, 800);
      ctx.fillStyle = isRoot ? '#ffffff' : MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(`+${descendantCount(doc, id)}`, x + NODE_W - 8, y + NODE_H / 2 + 1);
      ctx.textAlign = 'left';
    }
  }
}

/**
 * The map as a PNG file
 */
export function renderPng(doc: MapDoc, layout: MapLayout, tones: Map<string, NodeColor>, title: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawMap(canvas, doc, layout, tones, title);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'));
}
