import type { Graph, GraphNode } from '../indexer/types';
import { gapsFor, neighbours, type Neighbour } from './lineage';
import { docHash } from './route';

function NodeLink({ node }: { node: GraphNode }) {
  if (node.file === null) {
    return (
      <span className="node-external" title="No doc has this name">
        {node.name} <span className="tag">undocumented</span>
      </span>
    );
  }
  return (
    <a href={docHash(node.file)} title={node.file}>
      {node.name}
    </a>
  );
}

function NeighbourList({
  title,
  items,
}: {
  title: string;
  items: Neighbour[];
}) {
  return (
    <section>
      <h3>
        {title} <span className="count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="muted">None declared.</p>
      ) : (
        <ul className="neighbours">
          {items.map(({ node, declaredBy }) => (
            <li key={node.id} title={`declared by ${declaredBy.join(', ')}`}>
              <span className={`kind kind-${node.kind}`}>{node.kind}</span>{' '}
              <NodeLink node={node} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** `docs/x.md#field` as a link to the doc, with the field shown. */
function FieldRef({ value }: { value: string }) {
  const cut = value.lastIndexOf('#');
  const file = cut === -1 ? value : value.slice(0, cut);
  const field = cut === -1 ? '' : value.slice(cut + 1);
  return (
    <>
      <a href={docHash(file)}>{file}</a>
      {field !== '' && <code>#{field}</code>}
    </>
  );
}

export function LineagePanel({
  graph,
  node,
}: {
  graph: Graph;
  node: GraphNode;
}) {
  const { upstream, downstream } = neighbours(graph, node.id);
  const gaps = gapsFor(graph, node.id);
  const gapCount = gaps.oneSided.length + gaps.references.length;
  return (
    <aside className="lineage">
      <h2>Lineage</h2>
      <NeighbourList title="Upstream" items={upstream} />
      <NeighbourList title="Downstream" items={downstream} />
      {gapCount > 0 && (
        <section className="gaps">
          <h3>
            Gaps <span className="count">{gapCount}</span>
          </h3>
          <ul>
            {gaps.oneSided.map((link) => (
              <li key={`${link.declaredBy}>${link.missing}`}>
                One-sided: declared in <FieldRef value={link.declaredBy} />,
                missing from <FieldRef value={link.missing} />
                {link.uncertain && (
                  <span
                    className="tag"
                    title="The other doc has an ambiguous name in that field"
                  >
                    uncertain
                  </span>
                )}
              </li>
            ))}
            {gaps.references.map((reference) => (
              <li key={`${reference.file}#${reference.field}:${reference.ref}`}>
                <span className={`tag status-${reference.status}`}>
                  {reference.status}
                </span>{' '}
                <code>{reference.ref}</code> in{' '}
                <FieldRef value={`${reference.file}#${reference.field}`} />
                {reference.candidates.length > 0 && (
                  <>
                    {' '}
                    could be{' '}
                    {reference.candidates.map((candidate, index) => (
                      <span key={candidate}>
                        {index > 0 && ' or '}
                        <a href={docHash(candidate)}>{candidate}</a>
                      </span>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
