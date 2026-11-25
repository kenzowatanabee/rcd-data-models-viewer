import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Graph, GraphNode } from '../indexer/types';
import {
  describeOneSided,
  describeReference,
  gapsFor,
  neighbours,
  type Neighbour,
} from './lineage';
import { docHash } from './route';

/** Layers with their own colour; anything else gets the grey marker. */
const LAYERS = new Set(['source', 'dimension', 'intermediate', 'output']);

function markerClass(node: GraphNode): string {
  if (node.kind === 'pipeline') return 'kind-pipeline';
  if (node.kind === 'external') return 'kind-external';
  const layer = node.layer;
  return `layer-${layer !== null && LAYERS.has(layer) ? layer : 'other'}`;
}

function metaOf(node: GraphNode): string {
  if (node.kind === 'pipeline') return 'pipeline';
  if (node.kind === 'external') return 'undocumented';
  return node.layer ?? 'dataset';
}

/** Lets long identifiers wrap after their underscores, not mid-word. */
function Breakable({ name }: { name: string }) {
  const parts = name.split(/(?<=_)/);
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </span>
      ))}
    </>
  );
}

const fieldsOf = (declaredBy: string[]) =>
  declaredBy.map((value) => value.replace(/^.*\//, '')).join(', ');

function NeighbourRow({ node, declaredBy }: Neighbour) {
  const marker = (
    <span className={`layer-marker ${markerClass(node)}`} aria-hidden="true" />
  );
  const meta = <span className="neighbour-meta">{metaOf(node)}</span>;
  const title = `${node.name}\ndeclared in ${fieldsOf(declaredBy)}`;
  if (node.file === null) {
    return (
      <li>
        <span
          className="neighbour neighbour-external"
          title={`${title}\nNo doc has this name.`}
        >
          {marker}
          <span className="neighbour-name">
            <Breakable name={node.name} />
          </span>
          {meta}
        </span>
      </li>
    );
  }
  return (
    <li>
      <a className="neighbour" href={docHash(node.file)} title={title}>
        {marker}
        <span className="neighbour-name">
          <Breakable name={node.name} />
        </span>
        {meta}
      </a>
    </li>
  );
}

const KIND_ORDER = { pipeline: 0, dataset: 1, external: 2 } as const;

/** Pipelines first, then datasets, then undocumented names; by name within. */
const byKind = (a: Neighbour, b: Neighbour) =>
  KIND_ORDER[a.node.kind] - KIND_ORDER[b.node.kind] ||
  a.node.name.localeCompare(b.node.name);

function NeighbourGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: Neighbour[];
  empty: ReactNode;
}) {
  return (
    <section className="lineage-group">
      <h3>
        {title} <span className="count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="lineage-empty">{empty}</p>
      ) : (
        <ul className="neighbours">
          {[...items].sort(byKind).map((item) => (
            <NeighbourRow key={item.node.id} {...item} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A doc path as a link, with the front-matter field to edit. */
function Where({ file, field }: { file: string; field: string }) {
  return (
    <>
      <code>{field}</code> in{' '}
      <a href={docHash(file)} className="gap-file">
        {file}
      </a>
    </>
  );
}

function Gaps({ graph, node }: { graph: Graph; node: GraphNode }) {
  const gaps = gapsFor(graph, node.id);
  const count = gaps.oneSided.length + gaps.references.length;
  if (count === 0) return null;
  return (
    <section className="lineage-group gaps">
      <h3>
        <TriangleAlert size={12} aria-hidden="true" />
        Gaps to fix <span className="count">{count}</span>
      </h3>
      <ul>
        {gaps.oneSided.map((link) => {
          const gap = describeOneSided(graph, link);
          return (
            <li key={`${link.declaredBy}>${link.missing}`} className="gap">
              <p className="gap-title">One-sided link</p>
              <p>
                <strong>{gap.declared.name}</strong> lists{' '}
                <strong>{gap.missing.name}</strong> in{' '}
                <code>{gap.declared.field}</code>, but{' '}
                <strong>{gap.missing.name}</strong> does not list it back in{' '}
                <code>{gap.missing.field}</code>.
              </p>
              <p className="gap-fix">
                Fix: add <code>{gap.declared.name}</code> to{' '}
                <Where {...gap.missing} />, or remove it from{' '}
                <Where {...gap.declared} /> if the link is wrong.
              </p>
              {gap.uncertain && (
                <p className="gap-note">
                  {gap.missing.name} has an ambiguous name in{' '}
                  <code>{gap.missing.field}</code>, so the link may already be
                  there under that name.
                </p>
              )}
            </li>
          );
        })}
        {gaps.references.map((reference) => {
          const gap = describeReference(graph, reference);
          const key = `${reference.file}#${reference.field}:${reference.ref}`;
          if (gap.status === 'ambiguous') {
            return (
              <li key={key} className="gap">
                <p className="gap-title">Ambiguous name</p>
                <p>
                  <code>{gap.ref}</code> in <code>{gap.at.field}</code> of{' '}
                  <strong>{gap.at.name}</strong> matches more than one doc:{' '}
                  {gap.candidates.map((candidate, index) => (
                    <span key={candidate.file}>
                      {index > 0 && ' and '}
                      <a href={docHash(candidate.file)}>{candidate.name}</a>
                    </span>
                  ))}
                  , so no link is drawn.
                </p>
                <p className="gap-fix">
                  Fix: give each of those docs a unique <code>name</code> (keep{' '}
                  <code>{gap.ref}</code> as an alias), then use the unique name
                  in <Where {...gap.at} />.
                </p>
              </li>
            );
          }
          if (gap.status === 'wrong-kind') {
            return (
              <li key={key} className="gap">
                <p className="gap-title">Wrong kind</p>
                <p>
                  <code>{gap.ref}</code> in <code>{gap.at.field}</code> of{' '}
                  <strong>{gap.at.name}</strong> names a {gap.actual ?? 'doc'},
                  but <code>{gap.at.field}</code> should list{' '}
                  {gap.expected ?? 'another kind'}s.
                </p>
                <p className="gap-fix">
                  Fix: correct the name in <Where {...gap.at} />.
                </p>
              </li>
            );
          }
          return (
            <li key={key} className="gap">
              <p className="gap-title">Undocumented name</p>
              <p>
                <code>{gap.ref}</code> in <code>{gap.at.field}</code> of{' '}
                <strong>{gap.at.name}</strong> matches no doc&rsquo;s name or
                alias, so it shows as undocumented.
              </p>
              <p className="gap-fix">
                Fix: if a doc covers it, add <code>{gap.ref}</code> to that
                doc&rsquo;s <code>aliases</code>; if it is a typo, correct it in{' '}
                <Where {...gap.at} />.
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Direct upstream and downstream of a doc, and the gaps to fix. */
export function LineagePanel({
  graph,
  node,
}: {
  graph: Graph;
  node: GraphNode;
}) {
  const { upstream, downstream } = neighbours(graph, node.id);
  const pipeline = node.kind === 'pipeline';
  return (
    <section className="aside-section lineage" aria-labelledby="lineage-title">
      <div className="aside-header">
        <h2 id="lineage-title">Lineage</h2>
      </div>
      <div className="lineage-body">
        <NeighbourGroup
          title="Upstream"
          items={upstream}
          empty={
            pipeline ? (
              <>
                No inputs declared. List them in <code>inputs</code>.
              </>
            ) : (
              <>
                Nothing declared. Name the producing pipeline in{' '}
                <code>pipeline</code> or source datasets in{' '}
                <code>upstream</code>.
              </>
            )
          }
        />
        <NeighbourGroup
          title="Downstream"
          items={downstream}
          empty={
            pipeline ? (
              <>
                No outputs declared. List them in <code>outputs</code>.
              </>
            ) : (
              <>
                Nothing reads it, as far as the docs say. Pipelines that read it
                go in <code>downstream</code>.
              </>
            )
          }
        />
        <Gaps graph={graph} node={node} />
      </div>
    </section>
  );
}
