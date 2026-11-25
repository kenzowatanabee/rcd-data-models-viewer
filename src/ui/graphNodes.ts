import type { GraphNode } from '../indexer/types';
import type { VisibleGraph } from './graphModel';
import {
  layoutBands,
  wrapLabel,
  type BandGroup,
  type BandsLayout,
  type Size,
} from './graphLayout';

/** Must match `.graph-node` in styles/graph.css. */
export const LABEL_FONT =
  '600 12px "Inter Variable", "Segoe UI", system-ui, sans-serif';
export const CAPTION_FONT =
  '11px "Inter Variable", "Segoe UI", system-ui, sans-serif';
const LABEL_MAX = 190;
const LINE = 16;
const CAPTION_LINE = 14;
/** Padding, borders and the dataset layer stripe, plus a little slack. */
const EXTRA_WIDTH = 2 * 10 + 2 + 5 + 4;
const EXTRA_HEIGHT = 2 * 5 + 2;
const MIN_WIDTH = 110;

/** Room around a tag's text: its padding, border and the gap before it. */
const TAG_EXTRA = 2 * 5 + 2 + 6;

export interface NodeBox extends Size {
  lines: string[];
  caption: string;
  /** Short text of the tag after the caption, such as `3 lookups`. */
  tag: string | null;
}

export function captionOf(node: GraphNode): string {
  if (node.kind === 'external') return 'undocumented';
  if (node.kind === 'pipeline') return 'pipeline';
  return node.layer ?? 'dataset';
}

let context: CanvasRenderingContext2D | null | undefined;

function measurer(font: string): (text: string) => number {
  context ??= document.createElement('canvas').getContext('2d');
  const ctx = context;
  if (ctx === null) return (text) => text.length * 7.5;
  return (text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

function boxFor(node: GraphNode, tag: string | null): NodeBox {
  const label = measurer(LABEL_FONT);
  const small = measurer(CAPTION_FONT);
  const caption = captionOf(node);
  const lines = wrapLabel(node.name, LABEL_MAX, label);
  const textWidth = Math.max(
    ...lines.map(label),
    small(caption) + (tag === null ? 0 : small(tag) + TAG_EXTRA),
  );
  return {
    lines,
    caption,
    tag,
    width: Math.max(MIN_WIDTH, Math.ceil(textWidth) + EXTRA_WIDTH),
    height: lines.length * LINE + CAPTION_LINE + EXTRA_HEIGHT,
  };
}

export interface PlacedGraph {
  boxes: Map<string, NodeBox>;
  layout: BandsLayout;
}

/** What the layout depends on; anything else can change without moving nodes. */
function signature(
  graph: VisibleGraph,
  groups: BandGroup[],
  tags: Map<string, string>,
): string {
  return [
    ...[...tags].map(([id, tag]) => `${id}\t${tag}`),
    '',
    ...graph.nodes.map((n) => `${n.id}\t${n.name}\t${n.kind}\t${n.layer}`),
    '',
    ...graph.edges.map((e) => e.key),
    '',
    ...groups.map(
      (g) => `${g.id}\t${g.column}\t${g.arrange}\t${g.nodes.join('\t')}`,
    ),
  ].join('\n');
}

let last: { key: string; placed: PlacedGraph } | null = null;

/**
 * Sizes and lays out the graph in its bands, reusing the previous result when the nodes
 * and edges are the same, so a live refresh that changes nothing visible
 * does not move anything.
 */
export function placeGraph(
  graph: VisibleGraph,
  groups: BandGroup[],
  tags = new Map<string, string>(),
): PlacedGraph {
  const key = signature(graph, groups, tags);
  if (last?.key === key) return last.placed;
  const boxes = new Map(
    graph.nodes.map((node) => [
      node.id,
      boxFor(node, tags.get(node.id) ?? null),
    ]),
  );
  const layout = layoutBands({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      ...(boxes.get(node.id) as NodeBox),
    })),
    edges: graph.edges,
    groups,
  });
  last = { key, placed: { boxes, layout } };
  return last.placed;
}
