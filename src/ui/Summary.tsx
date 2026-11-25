import { CircleCheck, Clock, HeartPulse, Pin } from 'lucide-react';
import type { ReactNode } from 'react';

import type { GraphResponse } from '../server/api';
import {
  healthReport,
  issueCount,
  sectionCount,
  type SectionId,
} from './health';
import { docHash, healthHash } from './route';
import { markerClass, type SidebarDoc } from './sidebarModel';

/** Gaps the summary counts; each links to its section on the health page. */
const GAPS: { id: SectionId; label: string }[] = [
  { id: 'problems', label: 'Docs the indexer could not read' },
  { id: 'undocumented', label: 'Undocumented names' },
  { id: 'ambiguous', label: 'Ambiguous names' },
  { id: 'wrong-kind', label: 'Wrong-kind references' },
  { id: 'one-sided', label: 'One-sided links' },
  { id: 'unlinked', label: 'Unlinked datasets' },
  { id: 'direct-links', label: 'Links with no pipeline' },
];

function Card({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="home-card">
      <header className="home-card-header">
        {icon}
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function DocList({
  files,
  byFile,
  empty,
}: {
  files: readonly string[];
  byFile: ReadonlyMap<string, SidebarDoc>;
  empty: string;
}) {
  const docs = files.flatMap((file) => {
    const doc = byFile.get(file);
    return doc === undefined ? [] : [doc];
  });
  if (docs.length === 0) return <p className="home-empty">{empty}</p>;
  return (
    <ul className="home-list">
      {docs.map((doc) => {
        const marker = markerClass(doc);
        return (
          <li key={doc.file}>
            <a href={docHash(doc.file)} title={doc.file}>
              {marker !== null && (
                <span className={`layer-marker ${marker}`} aria-hidden="true" />
              )}
              <span className="home-list-name">{doc.name}</span>
              <span className="home-list-meta">
                {doc.kind === 'dataset'
                  ? (doc.layer ?? 'dataset')
                  : doc.kind === 'pipeline'
                    ? 'pipeline'
                    : doc.folder || 'root'}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  data: GraphResponse;
  docs: readonly SidebarDoc[];
  pinned: readonly string[];
  recent: readonly string[];
}

/** The start page: what is in the index, where the reader was, what to fix. */
export function Summary({ data, docs, pinned, recent }: Props) {
  const { graph } = data;
  const report = healthReport(graph);
  const total = issueCount(report);
  const byFile = new Map(docs.map((doc) => [doc.file, doc]));
  const stats = [
    ['Datasets', docs.filter((d) => d.kind === 'dataset').length],
    ['Pipelines', docs.filter((d) => d.kind === 'pipeline').length],
    ['Other docs', docs.filter((d) => d.kind === 'doc').length],
    ['Edges', graph.edges.length],
    ['References', graph.references.length],
  ] as const;
  return (
    <section className="home" aria-labelledby="home-title">
      <div className="home-head">
        <h1 id="home-title">RCD data models</h1>
        <p className="muted">
          Viewing <code>{data.docsPath}</code>
        </p>
      </div>
      <dl className="home-stats">
        {stats.map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="tabular">{count}</dd>
          </div>
        ))}
      </dl>
      <div className="home-grid">
        <Card icon={<Pin size={14} aria-hidden="true" />} title="Pinned">
          <DocList
            files={pinned}
            byFile={byFile}
            empty="Pin docs from the sidebar or a doc’s header to keep them here."
          />
        </Card>
        <Card icon={<Clock size={14} aria-hidden="true" />} title="Recent">
          <DocList
            files={recent.filter((file) => byFile.has(file)).slice(0, 6)}
            byFile={byFile}
            empty="Docs you open show up here."
          />
        </Card>
        <Card
          icon={<HeartPulse size={14} aria-hidden="true" />}
          title="Docs health"
          action={
            <a className="home-card-action" href={healthHash()}>
              Open
            </a>
          }
        >
          {total === 0 ? (
            <p className="home-empty">
              <CircleCheck size={14} aria-hidden="true" /> Nothing to fix.
            </p>
          ) : (
            <ul className="home-health">
              {GAPS.map(({ id, label }) => {
                const count = sectionCount(report, id);
                return (
                  <li key={id}>
                    <a
                      href={healthHash(id)}
                      className={count > 0 ? 'has-issues' : 'is-good'}
                    >
                      <span className="home-health-count tabular">{count}</span>
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <p className="home-readme-label">README.md</p>
    </section>
  );
}
