import {
  ArrowLeftRight,
  CircleCheck,
  FileText,
  PencilLine,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

import type { Graph, GraphNode } from '../indexer/types';
import { toneOf } from './docHeaderModel';
import type { Between, Trace, VisibleGraph } from './graphModel';
import { pathOrder } from './graphModel';
import { captionOf } from './graphNodes';
import { Legend, type BandFrame } from './GraphParts';
import { Breakable } from './LineagePanel';
import { describeOneSided, describeReference, gapsFor } from './lineage';
import { docHash } from './route';
import { nextIndex } from './settings';

/** Layers with their own colour; anything else gets the grey marker. */
const LAYERS = new Set(['source', 'dimension', 'intermediate', 'output']);

function markerClass(node: GraphNode): string {
  if (node.kind === 'pipeline') return 'kind-pipeline';
  if (node.kind === 'external') return 'kind-external';
  const layer = node.layer;
  return `layer-${layer !== null && LAYERS.has(layer) ? layer : 'other'}`;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function tally(nodes: GraphNode[]): string {
  const count = (kind: GraphNode['kind']) =>
    nodes.filter((n) => n.kind === kind).length;
  const parts = [
    count('dataset') > 0 && plural(count('dataset'), 'dataset'),
    count('pipeline') > 0 && plural(count('pipeline'), 'pipeline'),
    count('external') > 0 && `${count('external')} undocumented`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

/** Arrow keys, Home and End move between the buttons of a list. */
function onListKey(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[data-list-item]'),
  ];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = nextIndex(at, items.length, event.key);
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
}

function NodeRow({
  node,
  note,
  onSelect,
}: {
  node: GraphNode;
  note?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="neighbour graph-item"
        data-list-item
        title={`${node.name}\n${captionOf(node)}\nClick to select it`}
        onClick={() => onSelect(node.id)}
      >
        <span
          className={`layer-marker ${markerClass(node)}`}
          aria-hidden="true"
        />
        <span className="neighbour-name">
          <Breakable name={node.name} />
        </span>
        {note !== undefined && <span className="tag">{note}</span>}
        <span className="neighbour-meta">{captionOf(node)}</span>
      </button>
    </li>
  );
}

const GROUPS: { kind: GraphNode['kind']; title: string }[] = [
  { kind: 'pipeline', title: 'Pipelines' },
  { kind: 'dataset', title: 'Datasets' },
  { kind: 'external', title: 'Undocumented' },
];

/** One side of a lineage, grouped by kind, nearest first. */
function Side({
  title,
  direction,
  distances,
  byId,
  ends,
  endNote,
  onSelect,
}: {
  title: string;
  direction: 'up' | 'down';
  distances: Map<string, number>;
  byId: Map<string, GraphNode>;
  /** Nodes at the far end: nothing feeds them, or nothing reads them. */
  ends: Set<string>;
  endNote: string;
  onSelect: (id: string) => void;
}) {
  const nodes = [...distances.keys()]
    .map((id) => byId.get(id))
    .filter((node): node is GraphNode => node !== undefined)
    .sort(
      (a, b) =>
        (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  return (
    <section className="panel-section graph-side-list">
      <h3>
        <span className={`swatch-line ${direction}`} aria-hidden="true" />
        {title} <span className="count">{nodes.length}</span>
      </h3>
      {nodes.length === 0 ? (
        <p className="muted">
          {direction === 'up'
            ? 'Nothing feeds it in this view.'
            : 'Nothing reads it in this view.'}
        </p>
      ) : (
        <>
          <p className="graph-tally">{tally(nodes)}, nearest first</p>
          <div className="graph-scroll" onKeyDown={onListKey}>
            {GROUPS.map(({ kind, title: heading }) => {
              const group = nodes.filter((n) => n.kind === kind);
              if (group.length === 0) return null;
              return (
                <div key={kind} className="graph-group">
                  <h4>
                    {heading} <span className="count">{group.length}</span>
                  </h4>
                  <ul className="neighbours">
                    {group.map((node) => (
                      <NodeRow
                        key={node.id}
                        node={node}
                        note={ends.has(node.id) ? endNote : undefined}
                        onSelect={onSelect}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** Lineage gaps for one doc, one plain sentence each. */
function gapLines(graph: Graph, file: string): string[] {
  const gaps = gapsFor(graph, file);
  return [
    ...gaps.oneSided.map((link) => {
      const gap = describeOneSided(graph, link);
      return `${gap.declared.name} lists ${gap.missing.name} in ${gap.declared.field}, but ${gap.missing.name} does not list it back in ${gap.missing.field}.`;
    }),
    ...gaps.references.map((reference) => {
      const gap = describeReference(graph, reference);
      const where = `“${gap.ref}” in ${gap.at.field} of ${gap.at.name}`;
      if (gap.status === 'ambiguous') {
        return `${where} matches ${gap.candidates.length} docs, so no link is drawn.`;
      }
      if (gap.status === 'wrong-kind') {
        return `${where} names a ${gap.actual ?? 'doc'}, but ${gap.at.field} should list ${gap.expected ?? 'other'}s.`;
      }
      return `${where} matches no doc.`;
    }),
  ];
}

function Badges({ node }: { node: GraphNode }) {
  const tone = node.status === null ? null : toneOf(node.status);
  return (
    <ul className="doc-badges" aria-label="Node properties">
      <li className={`badge badge-kind kind-${node.kind}`}>
        {node.kind === 'pipeline' && (
          <span className="layer-marker kind-pipeline" aria-hidden="true" />
        )}
        {node.kind === 'external'
          ? 'Undocumented'
          : node.kind === 'pipeline'
            ? 'Pipeline'
            : 'Dataset'}
      </li>
      {node.layer !== null && (
        <li className="badge badge-layer" title="Layer">
          <span
            className={`layer-marker ${markerClass(node)}`}
            aria-hidden="true"
          />
          <span className="visually-hidden">Layer: </span>
          {node.layer}
        </li>
      )}
      {node.status !== null && (
        <li className={`badge badge-status status-${tone}`} title="Status">
          {tone === 'reviewed' ? (
            <CircleCheck size={12} aria-hidden="true" />
          ) : tone === 'draft' ? (
            <PencilLine size={12} aria-hidden="true" />
          ) : null}
          <span className="visually-hidden">Status: </span>
          {node.status}
        </li>
      )}
    </ul>
  );
}

interface NodeProps {
  graph: Graph;
  shown: VisibleGraph;
  node: GraphNode;
  lookups: ReadonlySet<string>;
  feeds: ReadonlySet<string>;
  lineage: Trace;
  focused: boolean;
  onSelect: (id: string) => void;
  onFocus: () => void;
  onWhole: () => void;
  onClose: () => void;
}

/** What the selected node is and where its data comes from and goes. */
export function NodeDetails({
  graph,
  shown,
  node,
  lookups,
  feeds,
  lineage,
  focused,
  onSelect,
  onFocus,
  onWhole,
  onClose,
}: NodeProps) {
  const byId = new Map(shown.nodes.map((n) => [n.id, n]));
  const hasIncoming = new Set(shown.edges.map((edge) => edge.to));
  const hasOutgoing = new Set(shown.edges.map((edge) => edge.from));
  const starts = new Set(
    [...lineage.upstream.keys()].filter((id) => !hasIncoming.has(id)),
  );
  const ends = new Set(
    [...lineage.downstream.keys()].filter((id) => !hasOutgoing.has(id)),
  );
  const inputs = shown.edges.filter((e) => e.to === node.id).map((e) => e.from);
  const readers = new Set(
    shown.edges
      .filter((e) => e.from === node.id && byId.get(e.to)?.kind === 'pipeline')
      .map((e) => e.to),
  );
  const shared = (set: ReadonlySet<string>) =>
    [...new Set(inputs.filter((id) => set.has(id)))]
      .map((id) => byId.get(id))
      .filter((n): n is GraphNode => n !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  const readsLookups = shared(lookups);
  const readsFeeds = shared(feeds);
  const gaps = node.file === null ? [] : gapLines(graph, node.id);

  return (
    <>
      <div className="panel-header">
        <h2 className="graph-details-title">
          <Breakable name={node.name} />
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Clear the selection"
          title="Clear the selection (Esc)"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="panel-section">
        <Badges node={node} />
        {node.file === null && (
          <p className="muted graph-details-note">
            No doc has this name; other docs mention it.
          </p>
        )}
        <div className="graph-actions">
          {node.file !== null && (
            <a className="btn btn-sm btn-primary" href={docHash(node.file)}>
              <FileText size={14} aria-hidden="true" />
              Open doc
            </a>
          )}
          {focused ? (
            <button type="button" className="btn btn-sm" onClick={onWhole}>
              Whole graph
            </button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={onFocus}>
              Only this lineage
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClose}
          >
            Clear
          </button>
        </div>
        {lookups.has(node.id) && (
          <p className="panel-note">
            Shared lookup, read by {plural(readers.size, 'pipeline')}. Its links
            are drawn while it is selected; otherwise its readers carry a tag.
          </p>
        )}
        {feeds.has(node.id) && (
          <p className="panel-note">
            Shared feed, read by {plural(readers.size, 'pipeline')} in other
            bands. Its links are faint until it or a reader is selected or
            hovered.
          </p>
        )}
      </div>
      <Side
        title="Upstream"
        direction="up"
        distances={lineage.upstream}
        byId={byId}
        ends={starts}
        endNote="start"
        onSelect={onSelect}
      />
      <Side
        title="Downstream"
        direction="down"
        distances={lineage.downstream}
        byId={byId}
        ends={ends}
        endNote="end"
        onSelect={onSelect}
      />
      {(readsLookups.length > 0 || readsFeeds.length > 0) && (
        <section className="panel-section" onKeyDown={onListKey}>
          {readsFeeds.length > 0 && (
            <>
              <h3>
                Shared feeds it reads{' '}
                <span className="count">{readsFeeds.length}</span>
              </h3>
              <ul className="neighbours">
                {readsFeeds.map((n) => (
                  <NodeRow key={n.id} node={n} onSelect={onSelect} />
                ))}
              </ul>
            </>
          )}
          {readsLookups.length > 0 && (
            <>
              <h3 className={readsFeeds.length > 0 ? 'graph-h3-gap' : ''}>
                Shared lookups it reads{' '}
                <span className="count">{readsLookups.length}</span>
              </h3>
              <ul className="neighbours">
                {readsLookups.map((n) => (
                  <NodeRow key={n.id} node={n} onSelect={onSelect} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {gaps.length > 0 && node.file !== null && (
        <section className="panel-section graph-gaps">
          <h3>
            <TriangleAlert size={12} aria-hidden="true" />
            Lineage gaps <span className="count">{gaps.length}</span>
          </h3>
          <ul>
            {gaps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <a href={docHash(node.file)}>How to fix them, on the doc page</a>
        </section>
      )}
      <div className="panel-section">
        <p className="panel-hint">
          Shift-click another node to see what lies between the two.
        </p>
      </div>
    </>
  );
}

interface PathProps {
  shown: VisibleGraph;
  from: GraphNode;
  to: GraphNode;
  path: Between;
  onSelect: (id: string) => void;
  onSwap: () => void;
  onClearSecond: () => void;
  onClose: () => void;
}

/** Two nodes selected: what lies between them, in the order data flows. */
export function PathDetails({
  shown,
  from,
  to,
  path,
  onSelect,
  onSwap,
  onClearSecond,
  onClose,
}: PathProps) {
  const byId = new Map(shown.nodes.map((n) => [n.id, n]));
  const order = pathOrder(
    path,
    shown.edges,
    shown.nodes.map((n) => n.id),
  )
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => n !== undefined);
  const first = order[0];
  const last = order[order.length - 1];
  const inner = order.slice(1, -1);
  const pipelines = inner.filter((n) => n.kind === 'pipeline').length;
  return (
    <>
      <div className="panel-header">
        <h2>Between two nodes</h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Clear both nodes"
          title="Clear both nodes (Esc twice)"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="panel-section">
        <dl className="graph-ends">
          <div>
            <dt>First</dt>
            <dd>
              <Breakable name={from.name} />
            </dd>
          </div>
          <div>
            <dt>Second</dt>
            <dd>
              <Breakable name={to.name} />
            </dd>
          </div>
        </dl>
        <div className="graph-actions">
          <button type="button" className="btn btn-sm" onClick={onSwap}>
            <ArrowLeftRight size={14} aria-hidden="true" />
            Swap
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClearSecond}
          >
            Clear second
          </button>
        </div>
      </div>
      <section className="panel-section">
        {first === undefined || last === undefined ? (
          <p>
            Neither feeds the other: no path runs from {from.name} to {to.name}{' '}
            or back.
          </p>
        ) : (
          <>
            <h3>
              Path <span className="count">{order.length}</span>
            </h3>
            <p className="graph-tally">
              Data flows from {first.name} to {last.name}
              {inner.length > 0
                ? ` through ${plural(pipelines, 'pipeline')} and ${plural(inner.length - pipelines, 'dataset')}`
                : ' directly'}
              .
            </p>
            <div className="graph-scroll" onKeyDown={onListKey}>
              <ol className="neighbours graph-path">
                {order.map((node) => (
                  <NodeRow key={node.id} node={node} onSelect={onSelect} />
                ))}
              </ol>
            </div>
          </>
        )}
      </section>
    </>
  );
}

interface OverviewProps {
  frames: BandFrame[];
  summary: string;
  /** Undocumented names hidden by the view options, if any. */
  hiddenExternal: number;
  onShowExternal: () => void;
  onPickBand: (frame: BandFrame) => void;
  onHoverBand: (id: string | null) => void;
}

/** Nothing selected: what the graph holds, the bands, and the legend. */
export function GraphOverview({
  frames,
  summary,
  hiddenExternal,
  onShowExternal,
  onPickBand,
  onHoverBand,
}: OverviewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  return (
    <>
      <div className="panel-header">
        <h2>Overview</h2>
      </div>
      <div className="panel-section">
        <p>{summary}</p>
        <p className="panel-hint">
          Click a node to trace what feeds it and what it feeds; shift-click a
          second node to see what lies between them.
        </p>
        {hiddenExternal > 0 && (
          <p className="panel-note">
            {plural(hiddenExternal, 'undocumented name')} hidden.{' '}
            <button
              type="button"
              className="link-button"
              onClick={onShowExternal}
            >
              Show them
            </button>
          </p>
        )}
      </div>
      {frames.length > 0 && (
        <section className="panel-section graph-bands">
          <h3>
            Bands <span className="count">{frames.length}</span>
          </h3>
          <ul
            ref={listRef}
            onKeyDown={onListKey}
            onMouseLeave={() => onHoverBand(null)}
            onBlur={(event) => {
              if (!listRef.current?.contains(event.relatedTarget as Node)) {
                onHoverBand(null);
              }
            }}
          >
            {frames.map((frame) => (
              <li key={frame.id}>
                <button
                  type="button"
                  className="graph-band-item"
                  data-list-item
                  data-band-item={frame.id}
                  title={`Zoom to this band\n\n${frame.members}`}
                  onClick={() => onPickBand(frame)}
                  onMouseEnter={() => onHoverBand(frame.id)}
                  onFocus={() => onHoverBand(frame.id)}
                >
                  <span
                    className={`graph-band-marker band-${frame.kind}`}
                    aria-hidden="true"
                  />
                  <span className="graph-band-text">
                    <span className="graph-band-item-name">
                      <Breakable name={frame.title} />
                    </span>
                    {frame.detail !== null && (
                      <span className="graph-band-item-detail">
                        {frame.detail}
                      </span>
                    )}
                  </span>
                  <span className="count" aria-label={`${frame.count} nodes`}>
                    {frame.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="panel-section graph-legend-section">
        <summary>Legend</summary>
        <Legend />
      </details>
    </>
  );
}
