import { useEffect, useState } from 'react';

import type { GraphResponse } from '../server/api';
import { fetchGraph, useDocsVersion } from './api';
import { DocView } from './DocView';
import { GraphPage } from './GraphPage';
import { parseHash } from './route';
import { Sidebar } from './Sidebar';

const LANDING_DOC = 'README.md';

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const version = useDocsVersion();
  const [data, setData] = useState<GraphResponse | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchGraph().then((result) => {
      if (cancelled) return;
      // Keep the last good graph if a half-saved doc breaks indexing
      if (result.ok) setData(result.value);
      setGraphError(result.ok ? null : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const route = parseHash(hash);
  if (route.view === 'graph') {
    return (
      <div className="app app-graph">
        <GraphPage data={data} route={route} graphError={graphError} />
      </div>
    );
  }
  const file = route.view === 'doc' ? route.file : LANDING_DOC;

  return (
    <div className="app">
      {data ? (
        <Sidebar data={data} current={route.view === 'doc' ? file : null} />
      ) : (
        <nav className="sidebar">
          <p className="muted">Loading the index…</p>
        </nav>
      )}
      <main>
        {graphError !== null && (
          <p className="error">Could not index the docs: {graphError}</p>
        )}
        <DocView
          file={file}
          anchor={route.view === 'doc' ? route.anchor : null}
          data={data}
          version={version}
          landing={route.view === 'home'}
        />
      </main>
    </div>
  );
}
