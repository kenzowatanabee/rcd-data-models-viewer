import { RotateCw, TriangleExclamationPoint } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GraphResponse } from '../server/api';
import { fetchGraph, useDocsVersion } from './api';
import { DocView } from './DocView';
import { GraphPage } from './GraphPage';
import { graphHash, parseHash } from './route';
import {
  STORAGE_KEYS,
  clampSidebarWidth,
  isFilterShortcut,
  parseFlag,
  parseSidebarWidth,
} from './settings';
import { Sidebar } from './Sidebar';
import { StateView } from './State';
import { readSetting, writeSetting } from './storage';
import { TopBar } from './TopBar';

const LANDING_DOC = 'README.md';

/** The address to keep for "Docs": `hash` unless it is a graph view. */
function docsHashOf(hash: string, last: string): string {
  if (parseHash(hash).view === 'graph') return last;
  return hash === '' ? '#/' : hash;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  // "Docs" in the top bar returns to the last doc, not the landing page
  const [lastDocHash, setLastDocHash] = useState(() =>
    docsHashOf(window.location.hash, '#/'),
  );
  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash;
      setHash(next);
      setLastDocHash((last) => docsHashOf(next, last));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const version = useDocsVersion();
  const [retries, setRetries] = useState(0);
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
  }, [version, retries]);

  const route = parseHash(hash);
  const section = route.view === 'graph' ? 'graph' : 'docs';

  const viewport = useViewportWidth();
  const [storedWidth, setStoredWidth] = useState(() =>
    parseSidebarWidth(readSetting(STORAGE_KEYS.sidebarWidth)),
  );
  const sidebarWidth = clampSidebarWidth(storedWidth, viewport);
  const setSidebarWidth = useCallback((width: number) => {
    setStoredWidth(width);
    writeSetting(STORAGE_KEYS.sidebarWidth, String(width));
  }, []);
  const [collapsed, setCollapsed] = useState(() =>
    parseFlag(readSetting(STORAGE_KEYS.sidebarCollapsed)),
  );
  const setSidebarCollapsed = (value: boolean) => {
    setCollapsed(value);
    writeSetting(STORAGE_KEYS.sidebarCollapsed, String(value));
  };

  const filterRef = useRef<HTMLInputElement>(null);
  const [focusFilter, setFocusFilter] = useState(0);
  useEffect(() => {
    if (focusFilter > 0) filterRef.current?.focus();
  }, [focusFilter]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const shortcut = isFilterShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTag: target?.tagName ?? '',
        targetEditable: target?.isContentEditable ?? false,
      });
      if (!shortcut) return;
      event.preventDefault();
      if (section === 'graph') {
        document.getElementById('graph-find-input')?.focus();
        return;
      }
      // Opens a collapsed sidebar first; the filter is focused once shown
      setCollapsed(false);
      writeSetting(STORAGE_KEYS.sidebarCollapsed, 'false');
      setFocusFilter((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section]);

  const file = route.view === 'doc' ? route.file : LANDING_DOC;
  const retry = (
    <button
      type="button"
      className="btn"
      onClick={() => setRetries((n) => n + 1)}
    >
      <RotateCw size={14} aria-hidden="true" />
      Try again
    </button>
  );

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        // The hash is the route, so move focus without touching it
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="app">
        <TopBar
          section={section}
          docsHref={lastDocHash}
          graphHref={section === 'graph' ? hash : graphHash()}
          docsPath={data?.docsPath ?? null}
          sidebar={
            section === 'docs'
              ? {
                  collapsed,
                  onToggle: () => setSidebarCollapsed(!collapsed),
                }
              : null
          }
        />
        <div className="frame">
          {section === 'docs' && (
            <Sidebar
              data={data}
              failed={data === null && graphError !== null}
              current={route.view === 'doc' ? file : null}
              filterRef={filterRef}
              width={sidebarWidth}
              onWidth={setSidebarWidth}
              hidden={collapsed}
            />
          )}
          <main id="main" className="main" tabIndex={-1}>
            {graphError !== null && data !== null && (
              <div className="banner" role="alert">
                <TriangleExclamationPoint size={16} aria-hidden="true" />
                <span>
                  The docs could not be re-indexed, so this is the last good
                  index: {graphError}
                </span>
              </div>
            )}
            {data === null && graphError !== null ? (
              <StateView
                kind="error"
                centred
                title="Could not load the docs index"
                detail={graphError}
                actions={retry}
              >
                <p>
                  Check that the folder given to <code>pnpm start</code> is a
                  clone of the docs repo with <code>docs/datasets</code> and{' '}
                  <code>docs/pipelines</code>, and that its front-matter parses.
                  Then try again.
                </p>
              </StateView>
            ) : route.view === 'graph' ? (
              <GraphPage data={data} route={route} />
            ) : (
              <DocView
                file={file}
                anchor={route.view === 'doc' ? route.anchor : null}
                data={data}
                version={version}
                landing={route.view === 'home'}
              />
            )}
          </main>
        </div>
      </div>
    </>
  );
}
