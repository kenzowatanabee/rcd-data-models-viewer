import type { GraphNode } from '../indexer/types';
import type { VisibleGraph } from './graphModel';
import { layoutGraph, wrapLabel, type Layout, type Size } from './graphLayout';

/** Must match `.graph-node` in styles.css. */
const LABEL_FONT =
  '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CAPTION_FONT =
  '11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const LABEL_MAX = 190;
const LINE = 16;
const CAPTION_LINE = 14;
/** Padding, borders and the dataset layer stripe, plus a little slack. */
const EXTRA_WIDTH = 2 * 10 + 2 + 5 + 4;
const EXTRA_HEIGHT = 2 * 5 + 2;
const MIN_WIDTH = 110;

export interface NodeBox extends Size {
  lines: string[];
  caption: string;
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

function boxFor(node: GraphNode): NodeBox {
  const label = measurer(LABEL_FONT);
  const caption = captionOf(node);
  const lines = wrapLabel(node.name, LABEL_MAX, label);
  const textWidth = Math.max(
    ...lines.map(label),
    measurer(CAPTION_FONT)(caption),
  );
  return {
    lines,
    caption,
    width: Math.max(MIN_WIDTH, Math.ceil(textWidth) + EXTRA_WIDTH),
    height: lines.length * LINE + CAPTION_LINE + EXTRA_HEIGHT,
  };
}

export interface PlacedGraph {
  boxes: Map<string, NodeBox>;
  layout: Layout;
}

/** What the layout depends on; anything else can change without moving nodes. */
function signature(graph: VisibleGraph): string {
  return [
    ...graph.nodes.map((n) => `${n.id}\t${n.name}\t${n.kind}\t${n.layer}`),
    '',
    ...graph.edges.map((e) => e.key),
  ].join('\n');
}

let last: { key: string; placed: PlacedGraph } | null = null;

/**
 * Sizes and lays out the graph, reusing the previous result when the nodes
 * and edges are the same, so a live refresh that changes nothing visible
 * does not move anything.
 */
export function placeGraph(graph: VisibleGraph): PlacedGraph {
  const key = signature(graph);
  if (last?.key === key) return last.placed;
  const boxes = new Map(graph.nodes.map((node) => [node.id, boxFor(node)]));
  const layout = layoutGraph({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      ...(boxes.get(node.id) as NodeBox),
    })),
    edges: graph.edges,
  });
  last = { key, placed: { boxes, layout } };
  return last.placed;
}
