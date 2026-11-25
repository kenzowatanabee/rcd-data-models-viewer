import {
  Handle,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';

import type { GraphNode } from '../indexer/types';
import {
  BAND_TITLE,
  arrowPath,
  curvePath,
  routePath,
  type Point,
  type Rect,
} from './graphLayout';

export interface LookupTag {
  text: string;
  lookups: { id: string; name: string }[];
  open: boolean;
  /** Some lookup in it is lit by the selection. */
  lit: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}

export type LineageNode = Node<
  {
    node: GraphNode;
    lines: string[];
    caption: string;
    tag: LookupTag | null;
    /** Name, kind and layer, and what it reads: shown on hover at any zoom. */
    tooltip: string;
  },
  'lineage'
>;

export type RoutedEdge = Edge<
  {
    points: Point[];
    redundant: boolean;
    /** Between two bands, so drawn as a curve over them. */
    curved: boolean;
    lookup: boolean;
    /** From a shared feed to a reader in another band. */
    feed: boolean;
  },
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

function TagView({ tag }: { tag: LookupTag }) {
  const names = tag.lookups.map((l) => l.name).join('\n');
  return (
    <>
      <button
        type="button"
        className={`graph-tag nodrag nopan${tag.lit ? ' is-lit' : ''}`}
        title={`Reads the shared lookups:\n${names}`}
        aria-expanded={tag.open}
        onClick={(event) => {
          event.stopPropagation();
          tag.onToggle();
        }}
      >
        {tag.text}
      </button>
      {tag.open && (
        <div
          className="graph-tag-popover nodrag nopan nowheel"
          onClick={(event) => event.stopPropagation()}
        >
          <p>Shared lookups it reads:</p>
          <ul>
            {tag.lookups.map((lookup) => (
              <li key={lookup.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => tag.onPick(lookup.id)}
                >
                  {lookup.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function LineageNodeView({ data }: NodeProps<LineageNode>) {
  const { node, lines, caption, tag, tooltip } = data;
  return (
    <div className={nodeClass(node)} title={tooltip}>
      {/* Edges need handles to attach to; they are not meant to be seen */}
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="graph-node-label">
        {lines.map((line, index) => (
          <span key={index}>{line}</span>
        ))}
      </div>
      <div className="graph-node-caption">
        {caption}
        {tag !== null && <TagView tag={tag} />}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** Draws the route dagre found, so edges go around nodes, not through them. */
function RoutedEdgeView({ data }: EdgeProps<RoutedEdge>) {
  const points = data?.points ?? [];
  const className = [
    'graph-edge',
    data?.redundant && 'redundant',
    data?.curved && 'cross',
    data?.lookup && 'lookup',
    data?.feed && 'feed',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <path
        className={className}
        d={data?.curved ? curvePath(points) : routePath(points)}
      />
      <path className="graph-arrow" d={arrowPath(points)} />
    </>
  );
}

export const nodeTypes = { lineage: LineageNodeView };
export const edgeTypes = { routed: RoutedEdgeView };

export interface BandFrame extends Rect {
  id: string;
  title: string;
  detail: string | null;
  kind: string;
  count: number;
  /** Member names, for the hover text. */
  members: string;
}

/** The frames and titles of the bands, drawn under the nodes and edges. */
export function BandFrames({
  frames,
  hot,
}: {
  frames: BandFrame[];
  hot: string | null;
}) {
  return (
    <>
      {frames.map((frame) => (
        <div
          key={frame.id}
          className={`graph-band band-${frame.kind}${hot === frame.id ? ' is-hot' : ''}`}
          data-band={frame.id}
          style={{
            transform: `translate(${frame.x}px, ${frame.y}px)`,
            width: frame.width,
            height: frame.height,
          }}
        >
          <div className="graph-band-title" style={{ height: BAND_TITLE }}>
            <span className="graph-band-name" title={frame.members}>
              {frame.title}
            </span>
            {frame.detail !== null && (
              <span className="graph-band-detail">{frame.detail}</span>
            )}
            <span className="graph-band-count">{frame.count}</span>
          </div>
        </div>
      ))}
    </>
  );
}

export function Legend() {
  return (
    <ul className="graph-legend">
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
      <li>
        <span className="swatch-line cross" />
        link between two bands
      </li>
      <li>
        <span className="swatch-line cross feed" />
        from a shared feed: faint until it, a reader or a band it feeds is
        selected or hovered
      </li>
      <li>
        <span className="graph-tag swatch-tag">2 lookups</span>
        shared lookups a node reads
      </li>
    </ul>
  );
}
