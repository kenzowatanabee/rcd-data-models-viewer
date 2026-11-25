import type { GraphResponse } from '../server/api';
import { docHash } from './route';

function tally<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

/** What the indexer found, for the landing view. */
export function Summary({ data }: { data: GraphResponse }) {
  const { graph } = data;
  const nodes = tally(graph.nodes, (node) => node.kind);
  const references = tally(graph.references, (reference) => reference.status);
  const uncertain = graph.oneSided.filter((link) => link.uncertain).length;
  return (
    <section className="summary">
      <p className="muted">
        Viewing <code>{data.docsPath}</code>
      </p>
      <dl className="stats">
        {nodes.map(([kind, count]) => (
          <div key={kind}>
            <dt>{kind === 'external' ? 'undocumented' : `${kind}s`}</dt>
            <dd>{count}</dd>
          </div>
        ))}
        <div>
          <dt>edges</dt>
          <dd>{graph.edges.length}</dd>
        </div>
        <div>
          <dt>one-sided links</dt>
          <dd>
            {graph.oneSided.length}
            {uncertain > 0 && (
              <span className="muted"> ({uncertain} uncertain)</span>
            )}
          </dd>
        </div>
        <div>
          <dt>problems</dt>
          <dd>{graph.problems.length}</dd>
        </div>
      </dl>
      <p className="muted">
        References:{' '}
        {references.map(([status, count]) => `${status} ${count}`).join(', ') ||
          'none'}
      </p>
      {graph.problems.length > 0 && (
        <details>
          <summary>Problems ({graph.problems.length})</summary>
          <ul>
            {graph.problems.map((problem) => (
              <li key={`${problem.kind}:${problem.files.join('|')}`}>
                <span className="tag">{problem.kind}</span>{' '}
                {problem.files.map((file, index) => (
                  <span key={file}>
                    {index > 0 && ', '}
                    <a href={docHash(file)}>{file}</a>
                  </span>
                ))}{' '}
                {problem.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
