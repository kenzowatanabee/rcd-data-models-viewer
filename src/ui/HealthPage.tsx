import {
  ChevronDown,
  CircleCheck,
  Search,
  TriangleExclamationPoint,
  Waypoints,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type { GraphResponse } from '../server/api';
import { CopyButton } from './CopyButton';
import { matchesFilter } from './filter';
import {
  SECTION_IDS,
  SECTION_TITLES,
  checklist,
  healthReport,
  issueCount,
  sectionCount,
  sectionLines,
  type HealthReport,
  type NodeRef,
  type SectionId,
} from './health';
import type { DocRef } from './lineage';
import { markerOf } from './paletteItems';
import { docHash, graphHash, healthHash } from './route';
import { StateView } from './State';

interface Props {
  data: GraphResponse | null;
  /** Section named in the address, to scroll to. */
  section: string | null;
  /** A filter from the address, such as a doc's path from the sidebar. */
  query?: string | null;
}

function DocLink({ doc }: { doc: { file: string | null; name: string } }) {
  if (doc.file === null) return <span>{doc.name}</span>;
  return (
    <a href={docHash(doc.file)} title={doc.file}>
      {doc.name}
    </a>
  );
}

function FieldRef({ at }: { at: DocRef }) {
  return (
    <span className="health-ref">
      <DocLink doc={at} /> <code>{at.field}</code>
    </span>
  );
}

function GraphLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      className="health-graph-link"
      href={graphHash({ focus: id, node: id })}
      title={`Show ${label} in the lineage graph`}
      aria-label={`Show ${label} in the lineage graph`}
    >
      <Waypoints size={13} aria-hidden="true" />
    </a>
  );
}

function NodeName({
  node,
  kind,
  layer,
}: {
  node: NodeRef;
  kind: 'dataset' | 'pipeline' | 'external';
  layer?: string | null;
}) {
  const marker = markerOf({ kind, layer: layer ?? null });
  return (
    <span className="health-node">
      {marker !== null && (
        <span className={`layer-marker ${marker}`} aria-hidden="true" />
      )}
      <DocLink doc={node} />
      <GraphLink id={node.id} label={node.name} />
    </span>
  );
}

function Refs({ refs }: { refs: DocRef[] }) {
  return (
    <ul className="health-refs">
      {refs.map((ref) => (
        <li key={`${ref.file}#${ref.field}`}>
          <FieldRef at={ref} />
        </li>
      ))}
    </ul>
  );
}

interface Row {
  key: string;
  cells: ReactNode[];
}

interface SectionView {
  intro: ReactNode;
  columns: string[];
  rows: Row[];
  /** Shown when the section has nothing in it. */
  good: string;
  extra?: ReactNode;
}

function sectionView(
  report: HealthReport,
  id: SectionId,
  kindOf: (id: string) => 'dataset' | 'pipeline' | 'external',
): SectionView {
  switch (id) {
    case 'problems':
      return {
        intro: (
          <p>
            These files are skipped by the indexer, so they are missing from the
            graph and the lineage panels. Fix the front-matter at the top of
            each file.
          </p>
        ),
        columns: ['File', 'Problem', 'What to change'],
        rows: report.problems.map((problem) => ({
          key: `${problem.kind}:${problem.files.join('|')}`,
          cells: [
            <ul className="health-refs" key="files">
              {problem.files.map((file) => (
                <li key={file}>
                  <a href={docHash(file)}>{file}</a>
                </li>
              ))}
            </ul>,
            <>
              <span className="tag">{problem.kind}</span>
              {problem.detail !== '' && (
                <span className="health-detail"> {problem.detail}</span>
              )}
            </>,
            <Markdownish key="fix" text={problem.fix} />,
          ],
        })),
        good: 'Every doc has front-matter the indexer can read.',
      };
    case 'ambiguous':
      return {
        intro: (
          <p>
            A name that two docs share links to neither, so no edge is drawn. In
            each doc listed under “Docs with this name”, give it a unique{' '}
            <code>name</code> and keep the shared name under{' '}
            <code>aliases</code>; then change the fields that name it to the
            unique name.
          </p>
        ),
        columns: ['Name', 'Docs with this name', 'Named in'],
        rows: report.ambiguous.map((name) => ({
          key: `${name.ref}:${name.candidates.map((c) => c.file).join('|')}`,
          cells: [
            <code key="ref">{name.ref}</code>,
            <ul className="health-refs" key="candidates">
              {name.candidates.map((candidate) => (
                <li key={candidate.file}>
                  <DocLink doc={candidate} />
                </li>
              ))}
            </ul>,
            <Refs key="mentions" refs={name.mentions} />,
          ],
        })),
        good: 'No name is shared by two docs.',
      };
    case 'wrong-kind':
      return {
        intro: (
          <p>
            The field names a doc of the other kind: a <code>pipeline</code> or{' '}
            <code>downstream</code> field must name pipelines, and{' '}
            <code>upstream</code>, <code>inputs</code> and <code>outputs</code>{' '}
            must name datasets. Correct the name in that field.
          </p>
        ),
        columns: ['Field', 'Name', 'Is a', 'Field expects'],
        rows: report.wrongKind.map((gap) => ({
          key: `${gap.at.file}#${gap.at.field}:${gap.ref}`,
          cells: [
            <FieldRef key="at" at={gap.at} />,
            <code key="ref">{gap.ref}</code>,
            gap.actual ?? '?',
            gap.expected ?? '?',
          ],
        })),
        good: 'Every field names the right kind of doc.',
      };
    case 'undocumented':
      return {
        intro: (
          <p>
            Names the docs mention that no doc has as its <code>name</code> or
            an alias. Either add a doc for it in <code>docs/datasets</code> or{' '}
            <code>docs/pipelines</code>, or add the name to the{' '}
            <code>aliases</code> of the doc it means. The ones with the most
            downstream nodes fill in the most lineage; they are listed first.
          </p>
        ),
        columns: ['Name', 'Downstream nodes', 'Named in'],
        rows: report.undocumented.map((name) => ({
          key: name.id,
          cells: [
            <span className="health-node" key="name">
              <span className="layer-marker kind-external" aria-hidden="true" />
              <span>{name.name}</span>
              <GraphLink id={name.id} label={name.name} />
            </span>,
            <span className="tabular" key="count">
              {name.downstream}
            </span>,
            <Refs key="mentions" refs={name.mentions} />,
          ],
        })),
        good: 'Every name the docs mention has a doc.',
      };
    case 'one-sided':
      return {
        intro: (
          <p>
            A dataset and a pipeline should both declare the link between them.
            Add the name shown to the field on the doc in “Missing on”. A link
            marked uncertain may already be there under a name two docs share;
            fix that ambiguous reference first.
          </p>
        ),
        columns: ['Declared by', 'Missing on', 'Add'],
        rows: report.oneSided.map((gap) => ({
          key: `${gap.from}>${gap.to}`,
          cells: [
            <FieldRef key="declared" at={gap.declared} />,
            <span key="missing">
              <FieldRef at={gap.missing} />
              {gap.uncertain && (
                <span className="tag status-ambiguous health-flag">
                  uncertain
                </span>
              )}
            </span>,
            <code key="add">{gap.declared.name}</code>,
          ],
        })),
        good: 'Every dataset–pipeline link is declared on both sides.',
      };
    case 'unlinked':
      return {
        intro: (
          <p>
            These datasets have no lineage at all. Add <code>pipeline</code>,{' '}
            <code>upstream</code> or <code>downstream</code> to their
            front-matter, or name them in a pipeline’s <code>inputs</code> or{' '}
            <code>outputs</code>. If a dataset really stands alone, this is only
            a reminder.
          </p>
        ),
        columns: ['Dataset', 'Layer', 'File'],
        rows: report.unlinked.map((node) => ({
          key: node.id,
          cells: [
            <NodeName
              key="name"
              node={node}
              kind="dataset"
              layer={node.layer}
            />,
            node.layer ?? '—',
            <code key="file">{node.file}</code>,
          ],
        })),
        good: 'Every dataset is linked to something.',
      };
    case 'direct-links':
      return {
        intro: (
          <p>
            A dataset lists another in <code>upstream</code>, but no pipeline
            reads the one and writes the other. There is probably a pipeline in
            between that has no doc yet: document it, with the first dataset in
            its <code>inputs</code> and the second in its <code>outputs</code>,
            and set the second dataset’s <code>pipeline</code> to it.
          </p>
        ),
        columns: ['From', 'To', 'Declared by'],
        rows: report.directLinks.map((link) => ({
          key: `${link.from.id}>${link.to.id}`,
          cells: [
            <NodeName
              key="from"
              node={link.from}
              kind={kindOf(link.from.id)}
            />,
            <NodeName key="to" node={link.to} kind={kindOf(link.to.id)} />,
            <Refs key="declared" refs={link.declaredBy} />,
          ],
        })),
        good: 'Every direct dataset link has a pipeline behind it.',
      };
    case 'status':
      return {
        intro: (
          <p>
            Docs are <code>draft</code> until someone has checked them against
            Domo; set <code>status: reviewed</code> in the front-matter when
            that is done, and update <code>last_updated</code>. The docs updated
            longest ago are listed as a staleness hint.
          </p>
        ),
        columns: ['Doc', 'Kind', 'Last updated', 'Status'],
        rows: report.oldest.map((doc) => ({
          key: doc.id,
          cells: [
            <NodeName key="name" node={doc} kind={doc.kind} />,
            doc.kind,
            <span className="tabular" key="date">
              {doc.lastUpdated}
            </span>,
            doc.status ?? '—',
          ],
        })),
        good: 'No doc has a last_updated date.',
        extra: (
          <>
            <table className="health-table health-status">
              <caption className="visually-hidden">Status by kind</caption>
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">draft</th>
                  <th scope="col">reviewed</th>
                  <th scope="col">other</th>
                  <th scope="col">no status</th>
                </tr>
              </thead>
              <tbody>
                {report.status.map((row) => (
                  <tr key={row.kind}>
                    <th scope="row">{row.kind}s</th>
                    <td className="tabular">{row.draft}</td>
                    <td className="tabular">{row.reviewed}</td>
                    <td className="tabular">{row.other}</td>
                    <td className="tabular">{row.none}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.undated.length > 0 && (
              <p className="muted">
                {report.undated.length} docs have no <code>last_updated</code>.
              </p>
            )}
            <h3 className="health-subtitle">Updated longest ago</h3>
          </>
        ),
      };
  }
}

/** Renders `code` spans in the fixed explanations. */
function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, index) =>
          part.startsWith('`') ? (
            <code key={index}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </>
  );
}

function Section({
  id,
  report,
  view,
  query,
  open,
  onToggle,
}: {
  id: SectionId;
  report: HealthReport;
  view: SectionView;
  query: string;
  open: boolean;
  onToggle: () => void;
}) {
  const lines = sectionLines(report, id);
  const rows = view.rows.filter((_, index) =>
    matchesFilter(query, [lines[index] ?? '']),
  );
  const count = id === 'status' ? null : sectionCount(report, id);
  const filtering = query.trim() !== '';
  // While filtering, only sections with a match are listed
  if (filtering && rows.length === 0) return null;
  const shown = open || (filtering && rows.length > 0);
  const bodyId = `health-body-${id}`;
  const tone = count === null ? '' : count > 0 ? ' has-issues' : ' is-good';
  return (
    <section
      id={`health-${id}`}
      className={`health-section${tone}`}
      aria-labelledby={`health-title-${id}`}
    >
      <header className="health-section-header">
        <h2 id={`health-title-${id}`}>
          <button
            type="button"
            aria-expanded={shown}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            <ChevronDown size={14} aria-hidden="true" />
            {SECTION_TITLES[id]}
            {count !== null && (
              <span className="health-count tabular">
                {filtering && rows.length !== count
                  ? `${rows.length} / ${count}`
                  : count}
              </span>
            )}
            {id === 'undocumented' && report.unresolvedCount > 0 && (
              <span className="muted health-sub-count">
                {report.unresolvedCount} references
              </span>
            )}
          </button>
        </h2>
        {count === 0 && (
          <span className="health-good-note">
            <CircleCheck size={14} aria-hidden="true" />
            All good
          </span>
        )}
        {lines.length > 0 && (
          <CopyButton
            text={checklist(report, id)}
            label={`Copy “${SECTION_TITLES[id]}” as a Markdown checklist`}
            className="health-copy"
          >
            Copy as checklist
          </CopyButton>
        )}
      </header>
      <div id={bodyId} className="health-body" hidden={!shown}>
        <div className="health-intro">{view.intro}</div>
        {view.extra}
        {view.rows.length === 0 ? (
          <p className="health-good">
            <CircleCheck size={14} aria-hidden="true" />
            {view.good}
          </p>
        ) : rows.length === 0 ? (
          <p className="muted">Nothing here matches the filter.</p>
        ) : (
          <div className="health-table-wrap">
            <table className="health-table">
              <thead>
                <tr>
                  {view.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    {row.cells.map((cell, index) => (
                      <td key={index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** Every gap in the docs as a to-do list, refreshed when a doc changes. */
export function HealthPage({ data, section, query: asked = null }: Props) {
  const report = useMemo(
    () => (data === null ? null : healthReport(data.graph)),
    [data],
  );
  const [query, setQuery] = useState(asked ?? '');
  // A new filter in the address replaces the one typed
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    setQuery(asked ?? '');
  }
  // Sections the reader opened or closed, against their default
  const [flipped, setFlipped] = useState<Set<SectionId>>(() => new Set());

  useEffect(() => {
    document.title = 'Docs health · RCD data models';
  }, []);

  // Arriving at a section from the address opens it and brings it into view
  const target = SECTION_IDS.find((candidate) => candidate === section);
  const [arrived, setArrived] = useState<SectionId | undefined>(undefined);
  if (report !== null && target !== arrived) {
    setArrived(target);
    if (target !== undefined) {
      const openByDefault =
        target === 'status' || sectionCount(report, target) > 0;
      setFlipped((previous) => {
        const next = new Set(previous);
        if (openByDefault) next.delete(target);
        else next.add(target);
        return next;
      });
    }
  }
  useEffect(() => {
    if (arrived === undefined) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`health-${arrived}`)?.scrollIntoView(),
    );
    return () => cancelAnimationFrame(frame);
  }, [arrived]);

  if (report === null) {
    return <StateView kind="loading" centred title="Reading the docs…" />;
  }
  const nodes = new Map(data?.graph.nodes.map((node) => [node.id, node.kind]));
  const kindOf = (id: string) => nodes.get(id) ?? 'external';
  const total = issueCount(report);
  const toggle = (id: SectionId) =>
    setFlipped((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Sections with nothing to do start folded
  const isOpen = (id: SectionId) =>
    (id === 'status' || sectionCount(report, id) > 0) !== flipped.has(id);

  return (
    <div className="health-scroll">
      <div className="health">
        <header className="health-header">
          <div>
            <h1>Docs health</h1>
            <p className="muted">
              What to fix in the docs, with the file and front-matter field for
              each. It updates as you save.
            </p>
          </div>
          <div className="search-field health-filter">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              className="input"
              id="health-filter-input"
              placeholder="Filter every section"
              aria-label="Filter every section"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query !== '') {
                  event.preventDefault();
                  setQuery('');
                }
              }}
            />
            {query !== '' && (
              <span className="search-field-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label="Clear the filter"
                  onClick={() => setQuery('')}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </header>
        {total === 0 ? (
          <p className="health-banner is-good" role="status">
            <CircleCheck size={16} aria-hidden="true" />
            All good: the indexer found nothing to fix.
          </p>
        ) : (
          <p className="health-banner has-issues">
            <TriangleExclamationPoint size={16} aria-hidden="true" />
            {total} things to look at across{' '}
            {
              SECTION_IDS.filter(
                (id) => id !== 'status' && sectionCount(report, id) > 0,
              ).length
            }{' '}
            sections.
          </p>
        )}
        <nav className="health-summary" aria-label="Sections">
          {SECTION_IDS.filter((id) => id !== 'status').map((id) => {
            const count = sectionCount(report, id);
            return (
              <a
                key={id}
                href={healthHash(id)}
                className={count > 0 ? 'has-issues' : 'is-good'}
              >
                <span className="health-summary-count tabular">{count}</span>
                <span>{SECTION_TITLES[id]}</span>
              </a>
            );
          })}
        </nav>
        {query.trim() !== '' &&
          SECTION_IDS.every((id) =>
            sectionLines(report, id).every(
              (line) => !matchesFilter(query, [line]),
            ),
          ) && (
            <StateView
              kind="empty"
              title="Nothing in any section matches the filter"
              detail={query.trim()}
            />
          )}
        {SECTION_IDS.map((id) => (
          <Section
            key={id}
            id={id}
            report={report}
            view={sectionView(report, id, kindOf)}
            query={query}
            open={isOpen(id)}
            onToggle={() => toggle(id)}
          />
        ))}
      </div>
    </div>
  );
}
