import { RotateCw, TriangleExclamationPoint } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GraphResponse, HeadingsResponse } from '../server/api';
import { fetchGraph, fetchHeadings, useDocsVersion } from './api';
import { DocView } from './DocView';
import { GraphPage } from './GraphPage';
import { healthReport, issueCount } from './health';
import { HealthPage } from './HealthPage';
import { Palette } from './Palette';
import {
  adjacentDoc,
  commandItems,
  contentItems,
  parseRecent,
  pushRecent,
  sidebarOrder,
  type PaletteItem,
} from './paletteItems';
import { docHash, graphHash, healthHash, parseHash } from './route';
import {
  STORAGE_KEYS,
  clampSidebarWidth,
  parseFlag,
  parseSidebarWidth,
} from './settings';
import { ShortcutHelp, useShortcut } from './ShortcutLayer';
import { Sidebar } from './Sidebar';
import { StateView } from './State';
import { readSetting, writeSetting } from './storage';
import { useTheme } from './theme';
import { TopBar } from './TopBar';

const LANDING_DOC = 'README.md';

/** The address to keep for "Docs": `hash` unless it is another section. */
function docsHashOf(hash: string, last: string): string {
  const { view } = parseHash(hash);
  if (view === 'graph' || view === 'health') return last;
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
  const section =
    route.view === 'graph'
      ? 'graph'
      : route.view === 'health'
        ? 'health'
        : 'docs';

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
    // Hiding the sidebar with focus in it would drop focus to the page
    if (
      value &&
      document.getElementById('sidebar')?.contains(document.activeElement)
    ) {
      document.getElementById('main')?.focus();
    }
    setCollapsed(value);
    writeSetting(STORAGE_KEYS.sidebarCollapsed, String(value));
  };

  const filterRef = useRef<HTMLInputElement>(null);
  const [focusFilter, setFocusFilter] = useState(0);
  useEffect(() => {
    if (focusFilter > 0) filterRef.current?.focus();
  }, [focusFilter]);

  useShortcut('filter', () => {
    if (section === 'graph') {
      document.getElementById('graph-find-input')?.focus();
      return;
    }
    if (section === 'health') {
      document.getElementById('health-filter-input')?.focus();
      return;
    }
    // Opens a collapsed sidebar first; the filter is focused once shown
    setSidebarCollapsed(false);
    setFocusFilter((n) => n + 1);
  });

  const go = (to: string) => {
    window.location.hash = to;
  };
  const graphHref = section === 'graph' ? hash : graphHash();
  useShortcut('go-docs', () => go(lastDocHash));
  useShortcut('go-graph', () => go(graphHref));
  useShortcut('go-health', () => go(healthHash()));
  useShortcut(
    'toggle-sidebar',
    section === 'docs' ? () => setSidebarCollapsed(!collapsed) : null,
  );
  const order = useMemo(
    () => (data === null ? [] : sidebarOrder(data)),
    [data],
  );
  const step = (by: 1 | -1) => {
    const next = adjacentDoc(
      order,
      route.view === 'doc' ? route.file : null,
      by,
    );
    if (next !== null) go(docHash(next));
  };
  useShortcut('next-doc', section === 'docs' ? () => step(1) : null);
  useShortcut('previous-doc', section === 'docs' ? () => step(-1) : null);

  const [helpOpen, setHelpOpen] = useState(false);
  useShortcut('help', () => setHelpOpen(true));

  // Quick open; the heading index is fetched when it opens and is stale
  const { setPreference } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [headings, setHeadings] = useState<{
    version: number;
    value: HeadingsResponse;
  } | null>(null);
  const [recent, setRecent] = useState(() =>
    parseRecent(readSetting(STORAGE_KEYS.recent)),
  );
  const openPalette = () => {
    setPaletteOpen(true);
    if (headings?.version === version) return;
    const asked = version;
    void fetchHeadings().then((result) => {
      if (result.ok) setHeadings({ version: asked, value: result.value });
    });
  };
  useShortcut('palette', () => {
    if (paletteOpen) setPaletteOpen(false);
    else openPalette();
  });
  const headingIndex = headings?.value ?? null;
  const items = useMemo(
    () => (data === null ? [] : contentItems(data, headingIndex)),
    [data, headingIndex],
  );
  const graphNode =
    route.view === 'graph'
      ? route.node
      : route.view === 'doc' &&
          data?.graph.nodes.some((node) => node.id === route.file)
        ? route.file
        : null;
  const nodeFile =
    route.view === 'graph' && route.node !== null
      ? (data?.graph.nodes.find((node) => node.id === route.node)?.file ?? null)
      : null;
  const commands = commandItems({
    section,
    file: route.view === 'doc' ? route.file : null,
    node: graphNode,
    nodeFile,
    sidebarCollapsed: collapsed,
  });
  const runItem = (item: PaletteItem, inGraph: boolean) => {
    setPaletteOpen(false);
    if (item.command === null) {
      const next = pushRecent(recent, item.id);
      setRecent(next);
      writeSetting(STORAGE_KEYS.recent, JSON.stringify(next));
    }
    if (item.node !== null && (inGraph || item.kind === 'external')) {
      go(graphHash({ focus: item.node, node: item.node }));
      return;
    }
    if (item.file !== null) {
      go(docHash(item.file, item.anchor));
      return;
    }
    switch (item.command) {
      case 'go-docs':
        return go(lastDocHash);
      case 'go-graph':
        return go(graphHref);
      case 'go-health':
        return go(healthHash());
      case 'theme-light':
        return setPreference('light');
      case 'theme-dark':
        return setPreference('dark');
      case 'theme-system':
        return setPreference('system');
      case 'toggle-sidebar':
        return setSidebarCollapsed(!collapsed);
      case 'show-in-graph':
        if (graphNode !== null)
          go(graphHash({ focus: graphNode, node: graphNode }));
        return;
      case 'open-doc':
        if (nodeFile !== null) go(docHash(nodeFile));
        return;
      case 'copy-path':
        if (route.view === 'doc') {
          void navigator.clipboard.writeText(route.file).catch(() => undefined);
        }
        return;
      case null:
        return;
    }
  };

  const issues = useMemo(
    () => (data === null ? null : issueCount(healthReport(data.graph))),
    [data],
  );

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
          graphHref={graphHref}
          healthHref={section === 'health' ? hash : healthHash()}
          issues={issues}
          onPalette={openPalette}
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
            ) : route.view === 'health' ? (
              <HealthPage data={data} section={route.section} />
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
      {paletteOpen && (
        <Palette
          items={items}
          commands={commands}
          recent={recent}
          headingsPending={headings?.version !== version}
          onRun={runItem}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </>
  );
}
