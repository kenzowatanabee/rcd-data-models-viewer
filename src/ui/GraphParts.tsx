import {
  Handle,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';

import type { GraphNode } from '../indexer/types';
import { arrowPath, routePath, type Point } from './graphLayout';

export type LineageNode = Node<
  { node: GraphNode; lines: string[]; caption: string },
  'lineage'
>;

export type RoutedEdge = Edge<
  { points: Point[]; redundant: boolean },
  'routed'
>;

/** Layer names with their own colour; anything else is drawn grey. */
const LAYERS = new Set(['source', 'dimension', 'intermediate', 'output']);

/** Minimap rectangles take colour from these classes. */
export function miniMapClass(node: GraphNode): string {
  if (node.kind !== 'dataset') return `mm-${node.kind}`;
  return `mm-${node.layer !== null && LAYERS.has(node.layer) ? node.layer : 'other'}`;
}

export function nodeClass(node: GraphNode): string {
  if (node.kind !== 'dataset') return `graph-node kind-${node.kind}`;
  const layer =
    node.layer !== null && LAYERS.has(node.layer) ? node.layer : 'other';
  return `graph-node kind-dataset layer-${layer}`;
}

function LineageNodeView({ data }: NodeProps<LineageNode>) {
  const { node, lines, caption } = data;
  return (
    <div
      className={nodeClass(node)}
      title={node.file ?? 'No doc has this name'}
    >
      {/* Edges need handles to attach to; they are not meant to be seen */}
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="graph-node-label">
        {lines.map((line, index) => (
          <span key={index}>{line}</span>
        ))}
      </div>
      <div className="graph-node-caption">{caption}</div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** Draws the route dagre found, so edges go around nodes, not through them. */
function RoutedEdgeView({ data }: EdgeProps<RoutedEdge>) {
  const points = data?.points ?? [];
  return (
    <>
      <path
        className={data?.redundant ? 'graph-edge redundant' : 'graph-edge'}
        d={routePath(points)}
      />
      <path className="graph-arrow" d={arrowPath(points)} />
    </>
  );
}

export const nodeTypes = { lineage: LineageNodeView };
export const edgeTypes = { routed: RoutedEdgeView };

export function Legend() {
  return (
    <section className="graph-legend">
      <h3>Legend</h3>
      <ul>
        {['source', 'dimension', 'intermediate', 'output'].map((layer) => (
          <li key={layer}>
            <span className={`swatch graph-node kind-dataset layer-${layer}`} />
            dataset, {layer}
          </li>
        ))}
        <li>
          <span className="swatch graph-node kind-pipeline" />
          pipeline
        </li>
        <li>
          <span className="swatch graph-node kind-external" />
          undocumented name
        </li>
        <li>
          <span className="swatch-line up" />
          upstream of the selection
        </li>
        <li>
          <span className="swatch-line down" />
          downstream of the selection
        </li>
        <li>
          <span className="swatch-line redundant" />
          direct link a pipeline also gives
        </li>
      </ul>
    </section>
  );
}
