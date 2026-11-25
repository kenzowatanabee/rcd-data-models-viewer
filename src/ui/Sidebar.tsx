import { ChevronDown, Search, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

import type { GraphNode } from '../indexer/types';
import type { GraphResponse } from '../server/api';
import { matchesFilter } from './filter';
import { docHash } from './route';
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  STORAGE_KEYS,
  clampSidebarWidth,
  nextIndex,
  parseCollapsedGroups,
  serialiseCollapsedGroups,
  type GroupId,
} from './settings';
import { StateView } from './State';
import { readSetting, writeSetting } from './storage';

/** Layers with their own colour; anything else gets the grey marker. */
const LAYERS = new Set(['source', 'dimension', 'intermediate', 'output']);

interface Item {
  file: string;
  label: string;
  title: string;
  /** Marker class and text shown after the name. */
  marker: string | null;
  meta: string | null;
  /** Directory part shown muted before the label, for other docs. */
  prefix: string | null;
}

function Group({
  id,
  title,
  items,
  total,
  current,
  collapsed,
  onToggle,
}: {
  id: GroupId;
  title: string;
  items: Item[];
  total: number;
  current: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const listId = `nav-group-${id}`;
  return (
    <section className="nav-group">
      <h2>
        <button
          type="button"
          className="nav-group-header"
          data-nav-item
          aria-expanded={!collapsed}
          aria-controls={listId}
          onClick={onToggle}
        >
          <ChevronDown size={14} aria-hidden="true" />
          {title}
          <span className="count">
            {items.length === total ? total : `${items.length} / ${total}`}
          </span>
        </button>
      </h2>
      <ul id={listId} hidden={collapsed}>
        {items.map((item) => (
          <li key={item.file}>
            <a
              className="nav-row"
              data-nav-item
              href={docHash(item.file)}
              title={item.title}
              aria-current={item.file === current ? 'page' : undefined}
            >
              {item.marker !== null && (
                <span
                  className={`layer-marker ${item.marker}`}
                  aria-hidden="true"
                />
              )}
              <span className="nav-label">
                {item.prefix !== null && (
                  <span className="nav-path">{item.prefix}</span>
                )}
                {item.label}
              </span>
              {item.meta !== null && (
                <span className="nav-meta">{item.meta}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

const byLabel = (a: Item, b: Item) => a.label.localeCompare(b.label);

function nodeItems(nodes: GraphNode[], query: string) {
  const all = nodes
    .filter((node): node is GraphNode & { file: string } => node.file !== null)
    .map((node) => {
      const pipeline = node.kind === 'pipeline';
      const layer = node.layer;
      return {
        file: node.file,
        label: node.name,
        title: [
          node.name,
          node.title,
          node.file,
          ...node.aliases.map((a) => `alias: ${a}`),
        ]
          .filter(Boolean)
          .join('\n'),
        marker: pipeline
          ? 'kind-pipeline'
          : layer === null
            ? null
            : `layer-${LAYERS.has(layer) ? layer : 'other'}`,
        meta: pipeline ? null : layer,
        prefix: null,
        texts: [node.name, ...node.aliases],
      };
    });
  return {
    total: all.length,
    items: all.filter((item) => matchesFilter(query, item.texts)).sort(byLabel),
  };
}

function otherItem(file: string): Item {
  const cut = file.lastIndexOf('/');
  return {
    file,
    label: file.slice(cut + 1),
    title: file,
    marker: null,
    meta: null,
    prefix: cut === -1 ? null : file.slice(0, cut + 1),
  };
}

interface Props {
  data: GraphResponse | null;
  /** The index could not be loaded; the main area says why. */
  failed: boolean;
  current: string | null;
  filterRef: RefObject<HTMLInputElement>;
  width: number;
  onWidth: (width: number) => void;
  hidden: boolean;
}

export function Sidebar({
  data,
  failed,
  current,
  filterRef,
  width,
  onWidth,
  hidden,
}: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() =>
    parseCollapsedGroups(readSetting(STORAGE_KEYS.collapsedGroups)),
  );
  const listRef = useRef<HTMLDivElement>(null);

  const toggle = (id: GroupId) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    writeSetting(STORAGE_KEYS.collapsedGroups, serialiseCollapsedGroups(next));
  };

  // Keeps the open doc in sight when it changes, including from links
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current, data, hidden]);

  const focusItem = (key: string) => {
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ??
        []),
    ].filter((item) => item.offsetParent !== null);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = nextIndex(at, items.length, key);
    if (next === null) return false;
    items[next]?.focus();
    return true;
  };

  const onListKey = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (focusItem(event.key)) event.preventDefault();
  };

  const onFilterKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem('Home');
    }
  };

  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: globalThis.PointerEvent) =>
      onWidth(
        clampSidebarWidth(startWidth + e.clientX - startX, window.innerWidth),
      );
    const end = () => {
      handle.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onResizeKey = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 48 : 16;
    const delta =
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    onWidth(clampSidebarWidth(width + delta, window.innerWidth));
  };

  const groups = data === null ? null : groupsOf(data, query);
  const nothing =
    groups !== null && groups.every((group) => group.items.length === 0);

  return (
    <nav
      id="sidebar"
      className="sidebar"
      aria-label="Docs"
      hidden={hidden}
      style={{ width }}
    >
      <div className="sidebar-search">
        <div className="search-field">
          <Search size={14} aria-hidden="true" />
          <input
            ref={filterRef}
            type="search"
            className="input"
            placeholder="Filter by name or alias"
            aria-label="Filter docs by name or alias"
            aria-keyshortcuts="/"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onFilterKey}
          />
          <span className="search-field-end">
            {query === '' ? (
              <kbd title="Press / to filter">/</kbd>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Clear the filter"
                title="Clear the filter (Esc)"
                onClick={() => {
                  setQuery('');
                  filterRef.current?.focus();
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      </div>
      <div className="sidebar-scroll" ref={listRef} onKeyDown={onListKey}>
        {groups === null && failed ? (
          <p className="sidebar-empty muted">No index to list.</p>
        ) : groups === null ? (
          <div className="sidebar-skeleton" role="status">
            <span className="visually-hidden">Loading the index…</span>
            {[70, 55, 80, 45, 65, 60, 75, 50].map((w, i) => (
              <span key={i} className="skeleton" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : nothing ? (
          <div className="sidebar-empty">
            <StateView
              kind="empty"
              title="No docs match"
              detail={query}
              actions={
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setQuery('');
                    filterRef.current?.focus();
                  }}
                >
                  Clear the filter
                </button>
              }
            >
              <p>The filter looks at names and aliases.</p>
            </StateView>
          </div>
        ) : (
          groups
            .filter((group) => query === '' || group.items.length > 0)
            .map((group) => (
              <Group
                key={group.id}
                {...group}
                current={current}
                collapsed={collapsed.has(group.id)}
                onToggle={() => toggle(group.id)}
              />
            ))
        )}
      </div>
      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the sidebar"
        aria-controls="sidebar"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        tabIndex={0}
        title="Drag to resize; arrow keys work too"
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKey}
        onDoubleClick={() => onWidth(clampSidebarWidth(NaN, window.innerWidth))}
      />
    </nav>
  );
}

function groupsOf(data: GraphResponse, query: string) {
  const datasets = nodeItems(
    data.graph.nodes.filter((node) => node.kind === 'dataset'),
    query,
  );
  const pipelines = nodeItems(
    data.graph.nodes.filter((node) => node.kind === 'pipeline'),
    query,
  );
  const others = data.otherDocs
    .filter((file) => matchesFilter(query, [file]))
    .map(otherItem);
  return [
    { id: 'datasets' as const, title: 'Datasets', ...datasets },
    { id: 'pipelines' as const, title: 'Pipelines', ...pipelines },
    {
      id: 'other' as const,
      title: 'Other docs',
      items: others,
      total: data.otherDocs.length,
    },
  ];
}
