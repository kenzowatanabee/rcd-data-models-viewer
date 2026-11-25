import type { Run } from './flowLabel';
import { shapeSize, wrapText, type Size, type TextBox } from './flowGeometry';
import type { LayoutInput } from './flowLayout';
import type { FlowChart } from './flowParse';

export type TextRole = 'node' | 'edge' | 'title';

/** Width of `text` in the font of `role`; the renderer measures on a canvas. */
export type MeasureText = (
  text: string,
  style: Omit<Run, 'text'> & { role: TextRole },
) => number;

/** Must match `.flow-*-text` in styles/flow.css. */
export const TEXT = {
  node: { size: 14, line: 19, maxWidth: 260 },
  edge: { size: 12, line: 16, maxWidth: 200 },
  title: { size: 12.5, line: 17, maxWidth: 420 },
} as const;

/** Room around an edge label's text, for its background. */
export const EDGE_LABEL_PAD = { x: 5, y: 2 };

export interface SizedChart {
  input: LayoutInput;
  nodeText: Map<string, TextBox>;
  edgeText: Map<number, TextBox>;
  titleText: Map<string, TextBox>;
}

/** Wraps every label and works out the size of each node, label and title. */
export function sizeChart(chart: FlowChart, measure: MeasureText): SizedChart {
  const wrap = (role: TextRole) => (label: Run[][]) =>
    wrapText(
      label,
      (text, style) => measure(text, { ...style, role }),
      TEXT[role].maxWidth,
      TEXT[role].line,
    );
  const nodeText = new Map(
    chart.nodes.map((n) => [n.id, wrap('node')(n.label)]),
  );
  const edgeText = new Map<number, TextBox>();
  for (const edge of chart.edges) {
    if (edge.label !== null) edgeText.set(edge.index, wrap('edge')(edge.label));
  }
  const titleText = new Map(
    chart.subgraphs.map((sg) => [sg.id, wrap('title')(sg.title)]),
  );
  const nodeSize = new Map<string, Size>(
    chart.nodes.map((n) => [
      n.id,
      shapeSize(n.shape, nodeText.get(n.id) as TextBox),
    ]),
  );
  const edgeLabelSize = new Map<number, Size>(
    [...edgeText].map(([index, box]) => [
      index,
      {
        width: box.width + 2 * EDGE_LABEL_PAD.x,
        height: box.height + 2 * EDGE_LABEL_PAD.y,
      },
    ]),
  );
  const titleSize = new Map<string, Size>(
    [...titleText].map(([id, box]) => [
      id,
      { width: box.width, height: box.height },
    ]),
  );
  return {
    input: { chart, nodeSize, edgeLabelSize, titleSize },
    nodeText,
    edgeText,
    titleText,
  };
}
