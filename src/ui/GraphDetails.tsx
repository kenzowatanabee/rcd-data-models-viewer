import type { Graph, GraphNode } from '../indexer/types';
import type { Between, Trace, VisibleGraph } from './graphModel';
import { captionOf } from './graphNodes';
import { gapsFor } from './lineage';
import { docHash } from './route';

function tally(ids: Iterable<string>, byId: Map<string, GraphNode>): string {
  const counts = { dataset: 0, pipeline: 0, external: 0 };
  for (const id of ids) {
    const node = byId.get(id);
    if (node) counts[node.kind] += 1;
  }
  const parts = [
    counts.dataset > 0 && `${counts.dataset} datasets`,
    counts.pipeline > 0 && `${counts.pipeline} pipelines`,
    counts.external > 0 && `${counts.external} undocumented`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

function NodeList({
  ids,
  byId,
  onSelect,
}: {
  ids: string[];
  byId: Map<string, GraphNode>;
  onSelect: (id: string) => void;
}) {
  const nodes = ids
    .map((id) => byId.get(id))
    .filter((node): node is GraphNode => node !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (nodes.length === 0) return <p className="muted">None.</p>;
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className="link-button"
            onClick={() => onSelect(node.id)}
          >
            {node.name}
          </button>{' '}
          <span className="tag">{captionOf(node)}</span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  graph: Graph;
  shown: VisibleGraph;
  node: GraphNode;
  lineage: Trace;
  path: { to: GraphNode; between: Between } | null;
  focused: boolean;
  onSelect: (id: string) => void;
  onFocus: () => void;
  onClose: () => void;
}

/** What the selected node is and where its data comes from and goes. */
export function GraphDetails({
  graph,
  shown,
  node,
  lineage,
  path,
  focused,
  onSelect,
  onFocus,
  onClose,
}: Props) {
  const byId = new Map(shown.nodes.map((n) => [n.id, n]));
  const hasIncoming = new Set(shown.edges.map((edge) => edge.to));
  const hasOutgoing = new Set(shown.edges.map((edge) => edge.from));
  const sources = [...lineage.upstream.keys()].filter(
    (id) => !hasIncoming.has(id),
  );
  const ends = [...lineage.downstream.keys()].filter(
    (id) => !hasOutgoing.has(id),
  );
  const gaps = node.file === null ? null : gapsFor(graph, node.id);
  const gapCount =
    gaps === null ? 0 : gaps.oneSided.length + gaps.references.length;

  return (
    <aside className="graph-details" aria-label="Selected node">
      <button
        type="button"
        className="graph-close"
        aria-label="Clear the selection"
        onClick={onClose}
      >
        ×
      </button>
      <h2>{node.name}</h2>
      <dl className="fields">
        <div>
          <dt>kind</dt>
          <dd>{node.kind === 'external' ? 'undocumented' : node.kind}</dd>
        </div>
        {node.layer !== null && (
          <div>
            <dt>layer</dt>
            <dd>{node.layer}</dd>
          </div>
        )}
        {node.status !== null && (
          <div>
            <dt>status</dt>
            <dd>{node.status}</dd>
          </div>
        )}
      </dl>
      <p className="graph-actions">
        {node.file !== null ? (
          <a href={docHash(node.file)}>Open doc</a>
        ) : (
          <span className="muted">No doc has this name.</span>
        )}
        {!focused && (
          <button type="button" className="link-button" onClick={onFocus}>
            Only this lineage
          </button>
        )}
      </p>
      {gapCount > 0 && (
        <p className="graph-gaps">
          {gapCount} lineage {gapCount === 1 ? 'gap' : 'gaps'}, listed on the
          doc page.
        </p>
      )}
      {path !== null && (
        <section>
          <h3>Between this and {path.to.name}</h3>
          {path.between.nodes.size === 0 ? (
            <p className="muted">Neither feeds the other.</p>
          ) : (
            <>
              <p className="muted">Pipelines on the way:</p>
              <NodeList
                ids={[...path.between.nodes].filter(
                  (id) => byId.get(id)?.kind === 'pipeline',
                )}
                byId={byId}
                onSelect={onSelect}
              />
            </>
          )}
        </section>
      )}
      <section>
        <h3>
          <span className="swatch-line up" /> Upstream{' '}
          <span className="count">{lineage.upstream.size}</span>
        </h3>
        <p className="muted">{tally(lineage.upstream.keys(), byId)}</p>
        {lineage.upstream.size > 0 && (
          <>
            <p className="muted">Furthest back (nothing feeds them):</p>
            <NodeList ids={sources} byId={byId} onSelect={onSelect} />
          </>
        )}
      </section>
      <section>
        <h3>
          <span className="swatch-line down" /> Downstream{' '}
          <span className="count">{lineage.downstream.size}</span>
        </h3>
        <p className="muted">{tally(lineage.downstream.keys(), byId)}</p>
        {lineage.downstream.size > 0 && (
          <>
            <p className="muted">Ends up in (nothing reads them):</p>
            <NodeList ids={ends} byId={byId} onSelect={onSelect} />
          </>
        )}
      </section>
      <p className="muted graph-hint">
        Shift-click another node to see what lies between the two.
      </p>
    </aside>
  );
}
