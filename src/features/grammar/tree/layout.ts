/**
 * Tidy tree layout
 * Places a tree left to right (or mirrored to the left): one column per depth, leaves on consecutive rows and
 * each parent centred on its children. Pure and cheap, so it runs only when the tree or the expanded set changes,
 * never while the viewport moves.
 */

export interface TreeSource {
  id: string;
  children?: TreeSource[];
}

export interface PlacedNode {
  id: string;
  depth: number;
  /** Top-left corner in flow coordinates */
  x: number;
  y: number;
  parentId: string | null;
  /** Has children in the source tree, shown or not */
  hasChildren: boolean;
  expanded: boolean;
}

export interface TreeLayout {
  nodes: PlacedNode[];
  links: { from: string; to: string }[];
}

export interface LayoutOptions {
  /** Node width per depth; the last entry repeats for deeper levels */
  widths: number[];
  colGap: number;
  rowHeight: number;
  /** 1 grows to the right, -1 grows to the left of the root */
  direction?: 1 | -1;
  /** Ids whose children are shown; the root always shows them */
  expanded?: ReadonlySet<string>;
  /** Show everything, ignoring `expanded` */
  expandAll?: boolean;
}

const widthAt = (widths: number[], depth: number): number => widths[Math.min(depth, widths.length - 1)];

/**
 * Left edge of a column
 */
export function columnX(depth: number, widths: number[], colGap: number, direction: 1 | -1 = 1): number {
  if (depth === 0) return 0;
  if (direction === 1) {
    let x = widthAt(widths, 0) + colGap;
    for (let d = 1; d < depth; d++) x += widthAt(widths, d) + colGap;
    return x;
  }
  let x = 0;
  for (let d = 1; d <= depth; d++) x += widthAt(widths, d) + colGap;
  return -x;
}

/**
 * Lays out the visible part of a tree
 */
export function layoutTree(root: TreeSource, options: LayoutOptions): TreeLayout {
  const { widths, colGap, rowHeight, direction = 1, expanded = new Set<string>(), expandAll = false } = options;
  const nodes: PlacedNode[] = [];
  const links: { from: string; to: string }[] = [];
  let nextRow = 0;

  const place = (node: TreeSource, depth: number, parentId: string | null): number => {
    const children = node.children ?? [];
    const open = children.length > 0 && (depth === 0 || expandAll || expanded.has(node.id));
    const entry: PlacedNode = { id: node.id, depth, x: columnX(depth, widths, colGap, direction), y: 0, parentId, hasChildren: children.length > 0, expanded: open };
    nodes.push(entry);

    if (!open) {
      entry.y = nextRow * rowHeight;
      nextRow++;
      return entry.y;
    }
    const ys = children.map((child) => {
      links.push({ from: node.id, to: child.id });
      return place(child, depth + 1, node.id);
    });
    entry.y = (ys[0] + ys[ys.length - 1]) / 2;
    return entry.y;
  };

  place(root, 0, null);
  return { nodes, links };
}
