import { RotateCw, TriangleExclamationPoint } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { GraphResponse, HeadingsResponse } from '../server/api';
import { inAppHref, linkIntent, onNavigate } from './address';
import { fetchGraph, fetchHeadings, useDocsVersion } from './api';
import type { BranchList, BranchTarget } from '../desktop/gitTypes';
import { BranchPicker } from './BranchPicker';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ModalDialog } from './Dialog';
import { desktop } from './desktop';
import { DocView } from './DocView';
import { FolderControl } from './FolderControl';
import { GraphPage } from './GraphPage';
import { healthReport, issueCount, issuesByFile } from './health';
import { HealthPage } from './HealthPage';
import { CONTENT_MIN, fitColumns, layoutMode } from './layoutModel';
import { Palette } from './Palette';
import {
  adjacentDoc,
  branchItemId,
  branchItems,
  commandItems,
  contentItems,
  markerOf,
  parseRecent,
  pushRecent,
  type PaletteItem,
} from './paletteItems';
import { Rail, type RailSection } from './Rail';
import { docHash, graphHash, healthHash, parseHash } from './route';
import { recalledScroll, rememberScroll } from './scrollMemory';
import {
  ASIDE_MAX,
  ASIDE_MIN,
  STORAGE_KEYS,
  clampSidebarWidth,
  parseAsideWidth,
  parseDensity,
  parseFlag,
  parseGroupBy,
  parseHiddenByDefault,
  parsePinned,
  parseSidebarWidth,
  parseStartup,
  togglePinned,
  type Density,
  type GroupBy,
  type Startup,
} from './settings';
import { SettingsDialog, type SettingsSection } from './SettingsDialog';
import {
  IS_MAC,
  PaneActiveContext,
  ShortcutHelp,
  formatSequence,
  keymap,
  useKeyHint,
  useShortcut,
} from './ShortcutLayer';
import type { ShortcutId } from './shortcuts';
import { Sidebar } from './Sidebar';
import {
  familyBands,
  navOrder,
  prefixOf,
  sharedPrefixes,
  sidebarDocs,
  trailOf,
} from './sidebarModel';
import { StateView } from './State';
import { readSetting, writeSetting } from './storage';
import { Summary } from './Summary';
import {
  activeTab,
  canGoBack,
  canGoForward,
  current,
  currentHash,
  kindOf,
  mountedIds,
  normaliseHash,
  parseStoredTabs,
  serialiseTabs,
  startupTabs,
  tabsReducer,
  tabsStorageKey,
  type Tab,
  type TabsAction,
} from './tabsModel';
import { TabStrip, type TabView } from './TabStrip';
import { useTheme } from './theme';
import { TopBar } from './TopBar';

const LANDING_DOC = 'README.md';
/** The icon rail's width; also --rail-w in layout.css. */
const RAIL_W = 44;
/**
 * Tabs kept mounted (hidden) so switching back keeps everything: scroll,
 * table filters, open details, diagram zoom, the graph's viewport. Older
 * ones are rebuilt from their address and scroll position.
 */
const MOUNTED_MAX = 6;

type SidebarScope = 'docs' | 'graph' | 'health';

const SIDEBAR_KEYS: Record<SidebarScope, string> = {
  docs: STORAGE_KEYS.sidebarCollapsed,
  graph: STORAGE_KEYS.sidebarCollapsedGraph,
  health: STORAGE_KEYS.sidebarCollapsedHealth,
};

function useViewportWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

const sectionOf = (hash: string): SidebarScope => {
  const kind = kindOf(hash);
  return kind === 'graph' || kind === 'health' ? kind : 'docs';
};

function initialTabs(folderKey: string) {
  const restore = parseStartup(readSetting(STORAGE_KEYS.startup)) === 'restore';
  const start = startupTabs(
    parseStoredTabs(readSetting(tabsStorageKey(folderKey))),
    window.location.hash,
    restore,
  );
  for (const [key, top] of start.scrolls) rememberScroll(key, top);
  return start.state;
}

interface Props {
  /** Names the docs folder: tabs are kept per folder. */
  folderKey: string;
  onClone: () => void;
}

export function App({ folderKey, onClone }: Props) {
  const [tabs, dispatch] = useReducer(tabsReducer, folderKey, initialTabs);
  const active = activeTab(tabs);
  const hash = currentHash(active);
  const route = parseHash(hash);
  const section = sectionOf(hash);

  // The address shows the active tab; no browser history entry is added,
  // since back and forward are per tab
  useLayoutEffect(() => {
    if (normaliseHash(window.location.hash) !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [hash]);

  const tabsRef = useRef(tabs);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
  });
  const storageKey = tabsStorageKey(folderKey);
  useEffect(() => {
    writeSetting(storageKey, serialiseTabs(tabs, recalledScroll));
  }, [tabs, storageKey]);
  useEffect(() => {
    // Scrolling changes no state: save it on the way out too
    const save = () =>
      writeSetting(storageKey, serialiseTabs(tabsRef.current, recalledScroll));
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [storageKey]);

  useEffect(() => {
    // A typed or pasted address navigates the active tab
    const onHashChange = () =>
      dispatch({ type: 'navigate', hash: window.location.hash });
    window.addEventListener('hashchange', onHashChange);
    const off = onNavigate(({ hash: to, replace, newTab }) =>
      dispatch(
        newTab === null
          ? { type: 'navigate', hash: to, replace }
          : { type: 'open', hash: to, background: newTab === 'background' },
      ),
    );
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      off();
    };
  }, []);

  // In-app links: here, or in a new tab with Ctrl/⌘, Shift or the middle
  // button; mouse back/forward buttons step the active tab's history
  useEffect(() => {
    const linkOf = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a[href]') ?? null;
      if (link === null || link.hasAttribute('download')) return null;
      if (link.getAttribute('target') === '_blank') return null;
      return inAppHref(link.getAttribute('href'));
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const href = linkOf(event);
      const intent = href === null ? null : linkIntent(event, IS_MAC);
      if (href === null || intent === null) return;
      event.preventDefault();
      dispatch(
        intent === 'here'
          ? { type: 'navigate', hash: href }
          : { type: 'open', hash: href, background: intent === 'background' },
      );
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 1 && linkOf(event) !== null) event.preventDefault();
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      dispatch({ type: event.button === 3 ? 'back' : 'forward' });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('auxclick', onClick);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('auxclick', onClick);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
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

  const viewport = useViewportWidth();
  const mode = layoutMode(viewport);
  const room = viewport - RAIL_W;
  const [storedWidth, setStoredWidth] = useState(() =>
    parseSidebarWidth(readSetting(STORAGE_KEYS.sidebarWidth)),
  );
  // Shown or hidden, remembered apart for docs, the graph and health
  const [collapsedBy, setCollapsedBy] = useState<Record<SidebarScope, boolean>>(
    () => ({
      docs: parseFlag(readSetting(SIDEBAR_KEYS.docs)),
      graph: parseHiddenByDefault(readSetting(SIDEBAR_KEYS.graph)),
      health: parseHiddenByDefault(readSetting(SIDEBAR_KEYS.health)),
    }),
  );
  const collapsed = collapsedBy[section];
  const [storedAside, setStoredAside] = useState(() =>
    parseAsideWidth(readSetting(STORAGE_KEYS.docAsideWidth)),
  );
  const [asideCollapsed, setAsideCollapsedState] = useState(() =>
    parseFlag(readSetting(STORAGE_KEYS.docAsideCollapsed)),
  );
  const sidebarDocked = mode.sidebar === 'docked';
  const asideDocked = section === 'docs' && mode.aside === 'docked';
  const columns = fitColumns(
    room,
    sidebarDocked && !collapsed ? storedWidth : null,
    asideDocked && !asideCollapsed ? storedAside : null,
  );
  const sidebarWidth = sidebarDocked
    ? columns.sidebar
    : clampSidebarWidth(storedWidth, room);
  const setSidebarWidth = useCallback((width: number) => {
    setStoredWidth(width);
    writeSetting(STORAGE_KEYS.sidebarWidth, String(width));
  }, []);
  // Widths the drag may reach: what leaves the content its minimum
  const clampSidebar = (width: number) =>
    fitColumns(
      room,
      width,
      asideDocked && !asideCollapsed ? columns.aside : null,
    ).sidebar;
  const clampAside = (width: number) => {
    const left =
      room - CONTENT_MIN - (sidebarDocked && !collapsed ? columns.sidebar : 0);
    const value = Number.isFinite(width) ? width : ASIDE_MIN;
    return Math.round(Math.max(ASIDE_MIN, Math.min(ASIDE_MAX, left, value)));
  };
  const setAsideWidth = (width: number) => {
    setStoredAside(width);
    writeSetting(STORAGE_KEYS.docAsideWidth, String(width));
  };
  const setAsideCollapsed = (value: boolean) => {
    setAsideCollapsedState(value);
    writeSetting(STORAGE_KEYS.docAsideCollapsed, String(value));
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Opening a doc from the drawer closes it
  const [drawerHash, setDrawerHash] = useState(hash);
  if (drawerHash !== hash) {
    setDrawerHash(hash);
    setDrawerOpen(false);
  }
  const sidebarDrawer = mode.sidebar === 'drawer';
  const setSidebarCollapsed = (value: boolean) => {
    if (sidebarDrawer) {
      setDrawerOpen(!value);
      return;
    }
    // Hiding the sidebar with focus in it would drop focus to the page
    if (
      value &&
      document.getElementById('sidebar')?.contains(document.activeElement)
    ) {
      document.getElementById('main')?.focus();
    }
    setCollapsedBy((old) => ({ ...old, [section]: value }));
    writeSetting(SIDEBAR_KEYS[section], String(value));
  };
  const sidebarHidden = sidebarDrawer ? !drawerOpen : collapsed;

  const [groupBy, setGroupByState] = useState(() =>
    parseGroupBy(readSetting(STORAGE_KEYS.groupBy)),
  );
  const setGroupBy = (value: GroupBy) => {
    setGroupByState(value);
    writeSetting(STORAGE_KEYS.groupBy, value);
  };
  const [pinned, setPinned] = useState(() =>
    parsePinned(readSetting(STORAGE_KEYS.pinned)),
  );
  const togglePin = (file: string) => {
    const next = togglePinned(pinned, file);
    setPinned(next);
    writeSetting(STORAGE_KEYS.pinned, JSON.stringify(next));
  };
  const [density, setDensityState] = useState(() =>
    parseDensity(readSetting(STORAGE_KEYS.density)),
  );
  const setDensity = (value: Density) => {
    setDensityState(value);
    writeSetting(STORAGE_KEYS.density, value);
  };
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
  const [startup, setStartupState] = useState(() =>
    parseStartup(readSetting(STORAGE_KEYS.startup)),
  );
  const setStartup = (value: Startup) => {
    setStartupState(value);
    writeSetting(STORAGE_KEYS.startup, value);
  };

  const filterRef = useRef<HTMLInputElement>(null);
  const [focusFilter, setFocusFilter] = useState(0);
  useEffect(() => {
    if (focusFilter > 0) filterRef.current?.focus();
  }, [focusFilter]);
  // "Reveal in sidebar": the open doc's row takes focus once shown
  const [revealRow, setRevealRow] = useState(0);
  useEffect(() => {
    if (revealRow === 0) return;
    const row = document.querySelector<HTMLElement>(
      '#sidebar [data-scope="main"][aria-current="page"]',
    );
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus();
  }, [revealRow]);

  const inActivePane = (id: string) =>
    document.querySelector<HTMLElement>(`.tab-pane.is-active #${id}`);
  useShortcut('filter', () => {
    if (section === 'graph') return inActivePane('graph-find-input')?.focus();
    if (section === 'health') {
      return inActivePane('health-filter-input')?.focus();
    }
    // Opens a collapsed sidebar first; the filter is focused once shown
    setSidebarCollapsed(false);
    if (!sidebarDrawer) setFocusFilter((n) => n + 1);
  });

  const go = (to: string) => dispatch({ type: 'navigate', hash: to });
  const show = (target: RailSection) => {
    const action: TabsAction =
      target === 'docs'
        ? { type: 'show-kind', kinds: ['doc', 'home'], hash: '#/' }
        : target === 'graph'
          ? { type: 'show-kind', kinds: ['graph'], hash: graphHash() }
          : { type: 'show-kind', kinds: ['health'], hash: healthHash() };
    dispatch(action);
  };
  useShortcut('go-docs', () => show('docs'));
  useShortcut('go-graph', () => show('graph'));
  useShortcut('go-health', () => show('health'));
  useShortcut('toggle-sidebar', () => setSidebarCollapsed(!sidebarHidden));
  useShortcut('new-tab', () => dispatch({ type: 'open', hash: '#/' }));
  useShortcut('close-tab', () => dispatch({ type: 'close', id: tabs.active }));
  useShortcut('reopen-tab', () => dispatch({ type: 'reopen' }));
  useShortcut('next-tab', () => dispatch({ type: 'cycle', by: 1 }));
  useShortcut('previous-tab', () => dispatch({ type: 'cycle', by: -1 }));
  useShortcut('back', () => dispatch({ type: 'back' }));
  useShortcut('forward', () => dispatch({ type: 'forward' }));
  const toTab = (index: number) => () =>
    dispatch({ type: 'activate-index', index });
  useShortcut('tab-1', toTab(1));
  useShortcut('tab-2', toTab(2));
  useShortcut('tab-3', toTab(3));
  useShortcut('tab-4', toTab(4));
  useShortcut('tab-5', toTab(5));
  useShortcut('tab-6', toTab(6));
  useShortcut('tab-7', toTab(7));
  useShortcut('tab-8', toTab(8));
  useShortcut('tab-9', toTab(9));

  const docs = useMemo(
    () => (data === null ? null : sidebarDocs(data)),
    [data],
  );
  const bands = useMemo(
    () => (data === null ? [] : familyBands(data.graph)),
    [data],
  );
  const order = useMemo(
    () => (docs === null ? [] : navOrder(docs, groupBy, bands)),
    [docs, groupBy, bands],
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
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  useShortcut('settings', () => setSettings('general'));

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
  // Every doc opened counts as recent, in the store quick open also uses
  const openFile = route.view === 'doc' ? route.file : null;
  const [recordedFile, setRecordedFile] = useState<string | null>(null);
  if (openFile !== null && openFile !== recordedFile) {
    setRecordedFile(openFile);
    if (recent[0] !== openFile) {
      const next = pushRecent(recent, openFile);
      setRecent(next);
      writeSetting(STORAGE_KEYS.recent, JSON.stringify(next));
    }
  }
  // The desktop app's branch picker, and branches as quick open results
  const [branchPicker, setBranchPicker] = useState<{
    target: BranchTarget | null;
  } | null>(null);
  const [branchList, setBranchList] = useState<BranchList | null>(null);
  useEffect(() => {
    if (desktop === null) return;
    // Repository → Switch Branch… in the menu
    return desktop.onOpenBranches(() => {
      setPaletteOpen(false);
      setBranchPicker({ target: null });
    });
  }, []);
  const openPalette = () => {
    setPaletteOpen(true);
    if (desktop !== null) {
      void desktop.gitListBranches().then((result) => {
        setBranchList(result.status === 'ok' ? result.list : null);
      });
    }
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
    () => [
      ...(data === null ? [] : contentItems(data, headingIndex)),
      ...(branchList === null
        ? []
        : branchItems(branchList.branches, branchList.remote)),
    ],
    [data, headingIndex, branchList],
  );
  const nodeById = useMemo(
    () => new Map((data?.graph.nodes ?? []).map((node) => [node.id, node])),
    [data],
  );
  const graphNode =
    route.view === 'graph'
      ? route.node
      : route.view === 'doc' && nodeById.has(route.file)
        ? route.file
        : null;
  const nodeFile =
    route.view === 'graph' && route.node !== null
      ? (nodeById.get(route.node)?.file ?? null)
      : null;
  const hintOf = (id: ShortcutId) => {
    const sequence = keymap.get()[id][0];
    return sequence === undefined ? null : formatSequence(sequence);
  };
  const commands = commandItems({
    section,
    file: route.view === 'doc' ? route.file : null,
    node: graphNode,
    nodeFile,
    sidebarCollapsed: sidebarHidden,
    hint: hintOf,
    canSwitchBranch: desktop !== null,
    // The menu's accelerator (menu.ts GIT_ACCELERATORS.switchBranch)
    switchBranchHint: formatSequence(['mod+shift+b']),
  });
  const runItem = (item: PaletteItem, inGraph: boolean) => {
    setPaletteOpen(false);
    if (item.kind === 'branch') {
      const branch = branchList?.branches.find(
        (entry) => branchItemId(entry) === item.id,
      );
      if (branch !== undefined) {
        setBranchPicker({ target: { kind: branch.kind, name: branch.name } });
      }
      return;
    }
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
        return show('docs');
      case 'go-graph':
        return show('graph');
      case 'go-health':
        return show('health');
      case 'settings':
        return setSettings('general');
      case 'shortcuts':
        return setHelpOpen(true);
      case 'new-tab':
        return dispatch({ type: 'open', hash: '#/' });
      case 'close-tab':
        return dispatch({ type: 'close', id: tabs.active });
      case 'reopen-tab':
        return dispatch({ type: 'reopen' });
      case 'theme-light':
        return setPreference('light');
      case 'theme-dark':
        return setPreference('dark');
      case 'theme-system':
        return setPreference('system');
      case 'density-comfortable':
        return setDensity('comfortable');
      case 'density-compact':
        return setDensity('compact');
      case 'toggle-sidebar':
        return setSidebarCollapsed(!sidebarHidden);
      case 'show-in-graph':
        if (graphNode !== null)
          go(graphHash({ focus: graphNode, node: graphNode }));
        return;
      case 'open-doc':
        if (nodeFile !== null) go(docHash(nodeFile));
        return;
      case 'switch-branch':
        return setBranchPicker({ target: null });
      case 'copy-path':
        if (route.view === 'doc') {
          void navigator.clipboard.writeText(route.file).catch(() => undefined);
        }
        return;
      case null:
        return;
    }
  };

  const report = useMemo(
    () => (data === null ? null : healthReport(data.graph)),
    [data],
  );
  const issues = report === null ? null : issueCount(report);
  const issuesOf = useMemo(
    () =>
      report === null || docs === null
        ? new Map<string, number>()
        : issuesByFile(
            report,
            docs.map((doc) => doc.file),
          ),
    [report, docs],
  );
  const docByFile = useMemo(
    () => new Map((docs ?? []).map((doc) => [doc.file, doc])),
    [docs],
  );
  const prefixes = useMemo(
    () => sharedPrefixes((docs ?? []).map((doc) => doc.name)),
    [docs],
  );

  const fileOf = (tab: Tab) => {
    const at = parseHash(currentHash(tab));
    return at.view === 'doc' ? at.file : null;
  };
  const openFiles = useMemo(
    () =>
      new Set(
        tabs.tabs.flatMap((tab) => {
          const file = fileOf(tab);
          return file === null ? [] : [file];
        }),
      ),
    [tabs.tabs],
  );

  // The window title follows the active tab
  const windowName =
    route.view === 'doc'
      ? route.file
      : route.view === 'graph'
        ? 'Lineage graph'
        : route.view === 'health'
          ? 'Docs health'
          : null;
  useEffect(() => {
    document.title =
      windowName === null
        ? 'RCD data models'
        : `${windowName} · RCD data models`;
  }, [windowName]);

  const viewOf = (tab: Tab): TabView => {
    const at = parseHash(currentHash(tab));
    const base = { id: tab.id, pinned: tab.pinned, kind: at.view, lead: '' };
    if (at.view === 'doc') {
      const node = nodeById.get(at.file);
      const doc = docByFile.get(at.file);
      const title =
        node?.name ??
        at.file.slice(at.file.lastIndexOf('/') + 1).replace(/\.md$/, '');
      return {
        ...base,
        title,
        lead: doc === undefined ? '' : prefixOf(doc.name, prefixes),
        detail:
          docs !== null && doc === undefined ? `${at.file} (gone)` : at.file,
        marker: node === undefined ? null : markerOf(node),
      };
    }
    if (at.view === 'graph') {
      const focus = at.focus === null ? null : nodeById.get(at.focus);
      return {
        ...base,
        title: focus ? `Lineage: ${focus.name}` : 'Lineage graph',
        detail: 'Lineage graph',
        marker: null,
      };
    }
    if (at.view === 'health') {
      return {
        ...base,
        title: 'Docs health',
        detail: 'Docs health',
        marker: null,
      };
    }
    return {
      ...base,
      title: 'Home',
      detail: 'Home: the docs at a glance',
      marker: null,
    };
  };

  const closeHint = useKeyHint('close-tab');
  const newTabHint = useKeyHint('new-tab');
  const menuFor = (id: string): MenuItem[] => {
    const tab = tabs.tabs.find((other) => other.id === id);
    if (tab === undefined) return [];
    const at = tabs.tabs.indexOf(tab);
    const file = fileOf(tab);
    const items: MenuItem[] = [
      {
        label: 'Close',
        hint: hintOf('close-tab') ?? undefined,
        onSelect: () => dispatch({ type: 'close', id }),
      },
      {
        label: 'Close others',
        disabled: tabs.tabs.every((other) => other.id === id || other.pinned),
        onSelect: () => dispatch({ type: 'close-others', id }),
      },
      {
        label: 'Close to the right',
        disabled: tabs.tabs.slice(at + 1).every((other) => other.pinned),
        onSelect: () => dispatch({ type: 'close-right', id }),
      },
      {
        label: tab.pinned ? 'Unpin tab' : 'Pin tab',
        separator: true,
        onSelect: () => dispatch({ type: 'pin', id, pinned: !tab.pinned }),
      },
    ];
    if (file !== null) {
      items.push(
        {
          label: 'Copy path',
          separator: true,
          onSelect: () =>
            void navigator.clipboard.writeText(file).catch(() => undefined),
        },
        {
          label: 'Reveal in sidebar',
          onSelect: () => {
            dispatch({ type: 'activate', id });
            if (sidebarDrawer) setDrawerOpen(true);
            else {
              setCollapsedBy((old) => ({ ...old, docs: false }));
              writeSetting(SIDEBAR_KEYS.docs, 'false');
            }
            setRevealRow((n) => n + 1);
          },
        },
      );
    }
    return items;
  };

  const [rowMenu, setRowMenu] = useState<{
    file: string;
    x: number;
    y: number;
  } | null>(null);

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

  const docsPath = data?.docsPath ?? null;
  const folderIn = (placement: 'sidebar' | 'rail') => (
    <FolderControl
      docsPath={docsPath}
      placement={placement}
      onClone={onClone}
      {...(desktop === null
        ? {}
        : { onSwitchBranch: () => setBranchPicker({ target: null }) })}
    />
  );

  const sidebar = (width: number | null) => (
    <Sidebar
      docs={docs}
      bands={bands}
      issues={issuesOf}
      failed={data === null && graphError !== null}
      current={route.view === 'doc' ? route.file : null}
      filterRef={filterRef}
      width={width}
      clampWidth={clampSidebar}
      onWidth={setSidebarWidth}
      hidden={width !== null && collapsed}
      groupBy={groupBy}
      onGroupBy={setGroupBy}
      pinned={pinned}
      onTogglePin={togglePin}
      open={openFiles}
      onRowMenu={(file, x, y) => setRowMenu({ file, x, y })}
      footer={folderIn('sidebar')}
    />
  );

  const renderView = (tab: Tab): ReactNode => {
    const at = parseHash(currentHash(tab));
    if (at.view === 'graph') return <GraphPage data={data} route={at} />;
    if (at.view === 'health') {
      return <HealthPage data={data} section={at.section} query={at.query} />;
    }
    const file = at.view === 'doc' ? at.file : LANDING_DOC;
    const doc = at.view === 'doc' ? (docByFile.get(file) ?? null) : null;
    const trail =
      doc === null ? ['Docs'] : ['Docs', ...trailOf(doc, groupBy, bands)];
    return (
      <DocView
        file={file}
        anchor={at.view === 'doc' ? at.anchor : null}
        source={at.view === 'doc' && at.source}
        line={at.view === 'doc' ? at.line : null}
        data={data}
        version={version}
        landing={at.view === 'home'}
        home={
          data !== null &&
          docs !== null && (
            <Summary data={data} docs={docs} pinned={pinned} recent={recent} />
          )
        }
        trail={trail}
        pinned={pinned.includes(file)}
        onTogglePin={
          at.view === 'doc' && doc !== null ? () => togglePin(file) : null
        }
        aside={{
          placement: mode.aside,
          width: columns.aside || clampAside(storedAside),
          clampWidth: clampAside,
          onWidth: setAsideWidth,
          collapsed: asideCollapsed,
          onCollapsed: setAsideCollapsed,
        }}
        scrollKey={current(tab).key}
        onCloseTab={() => dispatch({ type: 'close', id: tab.id })}
      />
    );
  };

  // Panes stay in creation order: moving a mounted pane in the DOM would
  // lose its scroll positions
  const mounted = mountedIds(tabs, MOUNTED_MAX);
  const panes = tabs.tabs
    .filter((tab) => mounted.has(tab.id))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

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
        <Rail
          section={section}
          issues={issues}
          onSection={(target) => {
            if (target === 'docs' && section === 'docs') {
              setSidebarCollapsed(!sidebarHidden);
            } else show(target);
          }}
          onPalette={openPalette}
          onSettings={() => setSettings('general')}
          onHelp={() => setHelpOpen(true)}
          folder={sidebarHidden ? folderIn('rail') : null}
        />
        <TopBar
          sidebar={{
            collapsed: sidebarHidden,
            drawer: sidebarDrawer,
            onToggle: () => setSidebarCollapsed(!sidebarHidden),
          }}
          canBack={canGoBack(active)}
          canForward={canGoForward(active)}
          onBack={() => dispatch({ type: 'back' })}
          onForward={() => dispatch({ type: 'forward' })}
          onPalette={openPalette}
        >
          <TabStrip
            tabs={tabs.tabs.map(viewOf)}
            active={tabs.active}
            onActivate={(id) => dispatch({ type: 'activate', id })}
            onClose={(id) => dispatch({ type: 'close', id })}
            onNew={() => dispatch({ type: 'open', hash: '#/' })}
            onMove={(id, to) => dispatch({ type: 'move', id, to })}
            menuFor={menuFor}
            newTabHint={newTabHint}
            closeHint={closeHint}
          />
        </TopBar>
        <div className="frame">
          {!sidebarDrawer && sidebar(sidebarWidth)}
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
                actions={
                  desktop === null ? (
                    retry
                  ) : (
                    <>
                      {retry}
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void desktop?.chooseFolder()}
                      >
                        Choose another folder…
                      </button>
                    </>
                  )
                }
              >
                <p>
                  Check that the folder
                  {desktop === null && (
                    <>
                      {' '}
                      given to <code>pnpm start</code>
                    </>
                  )}{' '}
                  is a clone of the docs repo with <code>docs/datasets</code>{' '}
                  and <code>docs/pipelines</code>, and that its front-matter
                  parses. Then try again.
                </p>
              </StateView>
            ) : (
              <div className="tab-panes">
                {panes.map((tab) => {
                  const shown = tab.id === tabs.active;
                  return (
                    <PaneActiveContext.Provider key={tab.id} value={shown}>
                      <div
                        id={`pane-${tab.id}`}
                        role="tabpanel"
                        aria-labelledby={`tab-${tab.id}`}
                        className={`tab-pane${shown ? ' is-active' : ''}`}
                        ref={(element) => {
                          if (element !== null) element.inert = !shown;
                        }}
                      >
                        {renderView(tab)}
                      </div>
                    </PaneActiveContext.Provider>
                  );
                })}
              </div>
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
          open={openFiles}
        />
      )}
      {branchPicker !== null && (
        <BranchPicker
          initialTarget={branchPicker.target}
          onClose={() => setBranchPicker(null)}
        />
      )}
      {helpOpen && (
        <ShortcutHelp
          onClose={() => setHelpOpen(false)}
          onSettings={() => {
            setHelpOpen(false);
            setSettings('shortcuts');
          }}
        />
      )}
      {settings !== null && (
        <SettingsDialog
          section={settings}
          onSection={setSettings}
          onClose={() => setSettings(null)}
          docsPath={docsPath}
          onClone={() => {
            setSettings(null);
            onClone();
          }}
          density={density}
          onDensity={setDensity}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          startup={startup}
          onStartup={setStartup}
        />
      )}
      {rowMenu !== null && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          label="Doc"
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: 'Open',
              onSelect: () => go(docHash(rowMenu.file)),
            },
            {
              label: 'Open in new tab',
              onSelect: () =>
                dispatch({ type: 'open', hash: docHash(rowMenu.file) }),
            },
            {
              label: pinned.includes(rowMenu.file)
                ? 'Unpin from the sidebar'
                : 'Pin to the sidebar',
              separator: true,
              onSelect: () => togglePin(rowMenu.file),
            },
            {
              label: 'Copy path',
              onSelect: () =>
                void navigator.clipboard
                  .writeText(rowMenu.file)
                  .catch(() => undefined),
            },
          ]}
        />
      )}
      {sidebarDrawer && drawerOpen && (
        <ModalDialog
          className="drawer drawer-left"
          label="Docs"
          onClose={() => setDrawerOpen(false)}
          closeOnBackdrop
          initialFocus={filterRef}
        >
          {sidebar(null)}
        </ModalDialog>
      )}
    </>
  );
}
