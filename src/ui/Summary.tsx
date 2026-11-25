import type { GraphResponse } from '../server/api';
import { healthReport, sectionCount, type SectionId } from './health';
import { healthHash } from './route';

function tally<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

/** Gaps the summary counts; each links to its section on the health page. */
const GAPS: { id: SectionId; label: string }[] = [
  { id: 'problems', label: 'problems' },
  { id: 'undocumented', label: 'undocumented names' },
  { id: 'ambiguous', label: 'ambiguous names' },
  { id: 'wrong-kind', label: 'wrong-kind references' },
  { id: 'one-sided', label: 'one-sided links' },
  { id: 'unlinked', label: 'unlinked datasets' },
  { id: 'direct-links', label: 'links with no pipeline' },
];

/** What the indexer found, for the landing view. */
export function Summary({ data }: { data: GraphResponse }) {
  const { graph } = data;
  const nodes = tally(
    graph.nodes.filter((node) => node.kind !== 'external'),
    (node) => node.kind,
  );
  const report = healthReport(graph);
  return (
    <section className="summary">
      <p className="muted">
        Viewing <code>{data.docsPath}</code>
      </p>
      <dl className="stats">
        {nodes.map(([kind, count]) => (
          <div key={kind}>
            <dt>{`${kind}s`}</dt>
            <dd>{count}</dd>
          </div>
        ))}
        <div>
          <dt>edges</dt>
          <dd>{graph.edges.length}</dd>
        </div>
        <div>
          <dt>references</dt>
          <dd>{graph.references.length}</dd>
        </div>
      </dl>
      <p className="summary-gaps">
        <span className="muted">Docs health: </span>
        {GAPS.map(({ id, label }, index) => {
          const count = sectionCount(report, id);
          return (
            <span key={id}>
              {index > 0 && <span className="muted"> · </span>}
              <a
                href={healthHash(id)}
                className={count > 0 ? 'summary-gap has-issues' : 'summary-gap'}
              >
                <strong className="tabular">{count}</strong> {label}
              </a>
            </span>
          );
        })}
      </p>
    </section>
  );
}
