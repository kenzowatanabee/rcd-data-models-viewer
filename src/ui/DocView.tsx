import { useEffect, useState } from 'react';

import type { GraphResponse } from '../server/api';
import { fetchDoc, type Loaded } from './api';
import { headerFields, splitFrontMatter } from './frontMatter';
import { LineagePanel } from './LineagePanel';
import { Markdown } from './Markdown';
import { Summary } from './Summary';

interface Props {
  file: string;
  anchor: string | null;
  data: GraphResponse | null;
  /** Goes up when the docs change on disk, to refetch. */
  version: number;
  /** Show the indexer summary above the doc (the landing view). */
  landing?: boolean;
}

export function DocView({ file, anchor, data, version, landing }: Props) {
  const [loaded, setLoaded] = useState<{
    file: string;
    result: Loaded<string>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDoc(file).then((result) => {
      if (!cancelled) setLoaded({ file, result });
    });
    return () => {
      cancelled = true;
    };
  }, [file, version]);

  // A refetch after an edit keeps the old text on screen until the new arrives
  const current = loaded?.file === file ? loaded.result : null;
  const text = current?.ok ? current.value : null;
  const hasText = text !== null;

  // Only on navigation, so a live refresh keeps the reader's place
  useEffect(() => {
    if (!hasText) return;
    if (anchor === null) {
      window.scrollTo(0, 0);
    } else {
      document.getElementById(anchor)?.scrollIntoView();
    }
  }, [file, anchor, hasText]);

  useEffect(() => {
    document.title = landing ? 'RCD data models' : `${file} · RCD data models`;
  }, [file, landing]);

  const node = data?.graph.nodes.find((candidate) => candidate.id === file);
  const doc = text === null ? null : splitFrontMatter(text);
  const fields = headerFields(doc?.data ?? null);

  return (
    <div className={node ? 'doc-page with-lineage' : 'doc-page'}>
      <article className="doc">
        {landing && data && <Summary data={data} />}
        <header className="doc-header">
          <div className="doc-path">{file}</div>
          {fields.length > 0 && (
            <dl className="fields">
              {fields.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {doc?.error && (
            <p className="error">Front-matter could not be read: {doc.error}</p>
          )}
        </header>
        {current === null && <p className="muted">Loading…</p>}
        {current?.ok === false && (
          <p className="error">
            Could not load {file}: {current.error}
          </p>
        )}
        {doc && <Markdown file={file} body={doc.body} />}
      </article>
      {node && data && <LineagePanel graph={data.graph} node={node} />}
    </div>
  );
}
