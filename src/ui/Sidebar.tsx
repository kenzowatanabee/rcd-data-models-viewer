import {
  ChevronDown,
  CircleCheck,
  ListFilter,
  PencilLine,
  Pin,
  PinOff,
  Search,
  TriangleExclamationPoint,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { toneOf } from './docHeaderModel';
import { fold } from './filter';
import { highlightParts } from './quickMatch';
import { ResizeHandle } from './ResizeHandle';
import { docHash, healthHash } from './route';
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  STORAGE_KEYS,
  nextIndex,
  parseCollapsedGroups,
  parseFlag,
  serialiseCollapsedGroups,
  type GroupBy,
} from './settings';
import {
  LAYER_ORDER,
  NO_CHIPS,
  buildNav,
  chipsActive,
  fitLabel,
  labelRoom,
  markerClass,
  shownCount,
  type Chips,
  type FamilyBand,
  type NavGroup,
  type NavRow,
  type SidebarDoc,
} from './sidebarModel';
import { ShortcutKeys, useAriaKeys } from './ShortcutLayer';
import { StateView } from './State';
import { readSetting, writeSetting } from './storage';

const GROUP_BY: { value: GroupBy; label: string; title: string }[] = [
  { value: 'layer', label: 'Layer', title: 'Datasets by layer, source first' },
  { value: 'az', label: 'A–Z', title: 'Datasets in one list, A–Z' },
  {
    value: 'family',
    label: 'Family',
    title: 'Datasets and pipelines in the lineage graph’s families',
  },
];

const LAYER_LABELS: Record<string, string> = {
  source: 'Source',
  dimension: 'Dimension',
  intermediate: 'Intermediate',
  output: 'Output',
};

/** Type-ahead letters typed within this time add up. */
const TYPEAHEAD_MS = 700;

const docKey = (scope: string, file: string) => `doc:${scope}:${file}`;
const groupKey = (id: string) => `group:${id}`;

function Highlighted({ text, at }: { text: string; at: readonly number[] }) {
  if (at.length === 0) return <>{text}</>;
  return (
    <>
      {highlightParts(text, at).map((part, index) =>
        part.hit ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

interface RowProps {
  row: NavRow;
  scope: string;
  current: string | null;
  showLayer: boolean;
  pinned: boolean;
  tabbable: string;
  onTogglePin: (file: string) => void;
  /** Docs open in a tab. */
  open: ReadonlySet<string>;
  onRowMenu: (file: string, x: number, y: number) => void;
  /** Sidebar width, to decide whether the shared prefix fits. */
  width: number;
  depth: number;
}

function Row({
  row,
  scope,
  current,
  showLayer,
  pinned,
  tabbable,
  onTogglePin,
  open,
  onRowMenu,
  width,
  depth,
}: RowProps) {
  const isOpen = open.has(row.doc.file);
  const { doc, prefix, hits, issues } = row;
  const key = docKey(scope, doc.file);
  const marker = markerClass(doc);
  const tone = doc.status === null ? null : toneOf(doc.status);
  const meta = showLayer && doc.layer !== null;
  const { lead, stem, elided } = fitLabel(
    doc.name,
    prefix,
    labelRoom(width, { depth, issues: issues > 0, meta }),
  );
  const prefixHits = elided ? [] : hits.filter((i) => i < prefix.length);
  const stemHits = hits
    .filter((i) => i >= prefix.length)
    .map((i) => i - prefix.length);
  const title = [
    doc.name,
    doc.title,
    doc.file,
    doc.layer === null ? null : `layer: ${doc.layer}`,
    doc.status === null ? null : `status: ${doc.status}`,
    ...doc.aliases.map((alias) => `alias: ${alias}`),
  ]
    .filter(Boolean)
    .join('\n');
  const described = [
    doc.name,
    doc.kind === 'dataset' && doc.layer !== null ? doc.layer : null,
    doc.status,
    issues > 0 ? `${issues} to fix` : null,
    pinned ? 'pinned' : null,
    isOpen ? 'open in a tab' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <li className={`nav-item${issues > 0 ? ' has-issues' : ''}`}>
      <a
        className={`nav-row${isOpen ? ' is-open' : ''}`}
        data-nav-item={key}
        data-scope={scope}
        data-stem={fold(stem)}
        data-name={fold(doc.name)}
        href={docHash(doc.file)}
        title={title}
        aria-label={described}
        aria-current={doc.file === current ? 'page' : undefined}
        tabIndex={key === tabbable ? 0 : -1}
        onClick={(event) => {
          // A row that keeps focus takes letter keys for type-ahead, which
          // silences j, k, m and the g sequences. After a mouse click the
          // reader is in the doc, so focus goes there; keyboard activation
          // (detail 0) stays in the list.
          if (event.detail === 0 || event.ctrlKey || event.metaKey) return;
          requestAnimationFrame(() =>
            document.getElementById('main')?.focus({ preventScroll: true }),
          );
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onRowMenu(doc.file, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'ContextMenu' ||
            (event.key === 'F10' && event.shiftKey)
          ) {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            onRowMenu(doc.file, box.left + 24, box.bottom);
          }
        }}
      >
        {marker !== null && (
          <span className={`layer-marker ${marker}`} aria-hidden="true" />
        )}
        <span className="nav-name">
          {lead !== '' && (
            <span className="nav-prefix">
              <Highlighted text={lead} at={prefixHits} />
            </span>
          )}
          <span className="nav-stem">
            {doc.kind === 'doc' && doc.folder !== '' && scope !== 'main' && (
              <span className="nav-path">{doc.folder}/</span>
            )}
            <Highlighted text={stem} at={stemHits} />
          </span>
        </span>
        {isOpen && <span className="nav-open" aria-hidden="true" />}
        {meta && <span className="nav-meta">{doc.layer}</span>}
        {tone === 'draft' ? (
          // A dashed ring: draft, by shape as well as colour
          <span className="nav-status is-draft" aria-hidden="true" />
        ) : tone === 'reviewed' ? (
          <CircleCheck
            size={12}
            className="nav-status is-reviewed"
            aria-hidden="true"
          />
        ) : null}
      </a>
      {issues > 0 && (
        <a
          className="nav-issues tabular"
          href={healthHash(null, doc.file)}
          tabIndex={-1}
          title={`${issues} ${issues === 1 ? 'thing' : 'things'} to fix: open in Docs health`}
          aria-label={`${issues} to fix in ${doc.name}: open in Docs health`}
        >
          <TriangleExclamationPoint size={11} aria-hidden="true" />
          {issues}
        </a>
      )}
      <button
        type="button"
        className={`nav-pin${pinned ? ' is-pinned' : ''}`}
        tabIndex={-1}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${doc.name}` : `Pin ${doc.name}`}
        title={pinned ? 'Unpin (p)' : 'Pin to the top of the sidebar (p)'}
        onClick={() => onTogglePin(doc.file)}
      >
        {pinned ? (
          <PinOff size={12} aria-hidden="true" />
        ) : (
          <Pin size={12} aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

interface GroupProps {
  group: NavGroup;
  depth: number;
  scope: string;
  filtering: boolean;
  icon?: ReactNode;
  isCollapsed: (id: string) => boolean;
  onToggle: (id: string) => void;
  rowProps: Omit<
    RowProps,
    'row' | 'scope' | 'pinned' | 'showLayer' | 'depth'
  > & {
    pinned: ReadonlySet<string>;
    showLayer: boolean;
  };
}

function Group({
  group,
  depth,
  scope,
  filtering,
  icon,
  isCollapsed,
  onToggle,
  rowProps,
}: GroupProps) {
  const collapsed = isCollapsed(group.id);
  const bodyId = `nav-${scope}-${group.id}`.replace(/[^\w-]/g, '_');
  const shown = shownCount(group);
  const Heading = depth === 0 ? 'h2' : 'h3';
  return (
    <section className={`nav-group depth-${depth}`}>
      <Heading className="nav-group-heading">
        <button
          type="button"
          className="nav-group-header"
          data-nav-item={groupKey(`${scope}:${group.id}`)}
          data-group={group.id}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          tabIndex={
            groupKey(`${scope}:${group.id}`) === rowProps.tabbable ? 0 : -1
          }
          onClick={() => onToggle(group.id)}
        >
          <ChevronDown size={14} aria-hidden="true" className="chevron" />
          {icon}
          {group.marker !== null && (
            <span
              className={`layer-marker ${group.marker}`}
              aria-hidden="true"
            />
          )}
          <span className="nav-group-title">{group.title}</span>
          <span className="count">
            {filtering && shown !== group.total ? (
              <>
                <span className="nav-count-hit">{shown}</span> / {group.total}
              </>
            ) : (
              group.total
            )}
          </span>
        </button>
      </Heading>
      <div id={bodyId} hidden={collapsed}>
        {group.rows.length > 0 && (
          <ul>
            {group.rows.map((row) => (
              <Row
                key={row.doc.file}
                row={row}
                scope={scope}
                {...rowProps}
                depth={depth}
                pinned={rowProps.pinned.has(row.doc.file)}
              />
            ))}
          </ul>
        )}
        {group.children.map((child) => (
          <Group
            key={child.id}
            group={child}
            depth={depth + 1}
            scope={scope}
            filtering={filtering}
            isCollapsed={isCollapsed}
            onToggle={onToggle}
            rowProps={rowProps}
          />
        ))}
      </div>
    </section>
  );
}

/** Keys of the items a reader can reach, in order, given what is folded. */
function visibleKeys(
  groups: readonly { group: NavGroup; scope: string }[],
  isCollapsed: (id: string) => boolean,
): string[] {
  const walk = (group: NavGroup, scope: string): string[] => [
    groupKey(`${scope}:${group.id}`),
    ...(isCollapsed(group.id)
      ? []
      : [
          ...group.rows.map((row) => docKey(scope, row.doc.file)),
          ...group.children.flatMap((child) => walk(child, scope)),
        ]),
  ];
  return groups.flatMap(({ group, scope }) => walk(group, scope));
}

interface Props {
  docs: readonly SidebarDoc[] | null;
  bands: readonly FamilyBand[];
  issues: ReadonlyMap<string, number>;
  /** The index could not be loaded; the main area says why. */
  failed: boolean;
  current: string | null;
  filterRef: RefObject<HTMLInputElement>;
  /** Null in the drawer, where the sidebar is not resized. */
  width: number | null;
  clampWidth: (width: number) => number;
  onWidth: (width: number) => void;
  hidden: boolean;
  groupBy: GroupBy;
  onGroupBy: (value: GroupBy) => void;
  pinned: readonly string[];
  onTogglePin: (file: string) => void;
  /** Docs open in a tab, marked in the list. */
  open: ReadonlySet<string>;
  onRowMenu: (file: string, x: number, y: number) => void;
  /** The folder control at the bottom. */
  footer: ReactNode;
}

export function Sidebar({
  docs,
  bands,
  issues,
  failed,
  current,
  filterRef,
  width,
  clampWidth,
  onWidth,
  hidden,
  groupBy,
  onGroupBy,
  pinned,
  onTogglePin,
  open,
  onRowMenu,
  footer,
}: Props) {
  const filterKeys = useAriaKeys('filter');
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<Chips>(NO_CHIPS);
  const [collapsed, setCollapsed] = useState(() =>
    parseCollapsedGroups(readSetting(STORAGE_KEYS.collapsedGroups)),
  );
  // While filtering every group with a match is open; folding one then is
  // forgotten when the filter is cleared, restoring the reader's own state
  const [filterCollapsed, setFilterCollapsed] = useState<Set<string>>(
    () => new Set(),
  );
  const [filtersOpen, setFiltersOpen] = useState(() =>
    parseFlag(readSetting(STORAGE_KEYS.sidebarFilters)),
  );
  const activeChips =
    chips.layers.length + (chips.draft ? 1 : 0) + (chips.issues ? 1 : 0);
  const chipsShown = filtersOpen || activeChips > 0;
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const filtering = query.trim() !== '' || chipsActive(chips);
  const isCollapsed = (id: string) =>
    filtering ? filterCollapsed.has(id) : collapsed.has(id);

  const toggle = (id: string) => {
    if (filtering) {
      const next = new Set(filterCollapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setFilterCollapsed(next);
      return;
    }
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    writeSetting(STORAGE_KEYS.collapsedGroups, serialiseCollapsedGroups(next));
  };

  const clearFilters = () => {
    setQuery('');
    setChips(NO_CHIPS);
    setFilterCollapsed(new Set());
    filterRef.current?.focus();
  };

  const groups =
    docs === null
      ? null
      : buildNav(docs, { groupBy, query, chips, issues, bands });
  const pinnedSet = new Set(pinned);
  const byFile = new Map((docs ?? []).map((doc) => [doc.file, doc]));
  const quickGroup = (
    id: string,
    title: string,
    files: readonly string[],
  ): NavGroup => {
    const rows = files.flatMap((file) => {
      const doc = byFile.get(file);
      return doc === undefined
        ? []
        : [{ doc, prefix: '', hits: [], issues: issues.get(file) ?? 0 }];
    });
    return { id, title, marker: null, total: rows.length, rows, children: [] };
  };
  const pinnedGroup = quickGroup('pinned', 'Pinned', pinned);
  const quick = filtering
    ? []
    : [{ group: pinnedGroup, scope: 'pinned', icon: Pin }].filter(
        ({ group }) => group.rows.length > 0,
      );
  const main = (groups ?? []).map((group) => ({ group, scope: 'main' }));
  const keys = visibleKeys([...quick, ...main], isCollapsed);
  const currentKey = current === null ? null : docKey('main', current);
  const tabbable =
    focusKey !== null && keys.includes(focusKey)
      ? focusKey
      : currentKey !== null && keys.includes(currentKey)
        ? currentKey
        : (keys[0] ?? '');

  // Keeps the open doc in sight when it changes, including from links; sticky
  // headers are cleared through the rows' scroll margin
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-scope="main"][aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current, docs, hidden, groupBy]);

  const items = () =>
    [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ??
        []),
    ].filter((item) => item.offsetParent !== null);

  const focusAt = (element: HTMLElement | undefined) => {
    if (element === undefined) return;
    setFocusKey(element.dataset.navItem ?? null);
    element.focus();
    element.scrollIntoView({ block: 'nearest' });
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const list = items();
    const active = document.activeElement as HTMLElement | null;
    const at = list.indexOf(active as HTMLElement);
    const isHeader = active?.classList.contains('nav-group-header') ?? false;
    const parentHeader = () =>
      active
        ?.closest('.nav-group')
        ?.parentElement?.closest('.nav-group')
        ?.querySelector<HTMLElement>(':scope > .nav-group-heading > button');
    const ownHeader = () =>
      active
        ?.closest('.nav-group')
        ?.querySelector<HTMLElement>(':scope > .nav-group-heading > button');
    const key = event.key;
    if (key === 'ArrowRight' && isHeader && active) {
      event.preventDefault();
      const id = active.dataset.group ?? '';
      if (isCollapsed(id)) toggle(id);
      else focusAt(list[at + 1]);
      return;
    }
    if (key === 'ArrowLeft' && active) {
      event.preventDefault();
      const id = active.dataset.group ?? '';
      if (isHeader && !isCollapsed(id)) toggle(id);
      else focusAt((isHeader ? parentHeader() : ownHeader()) ?? undefined);
      return;
    }
    if (key === 'p' && !isHeader && active?.classList.contains('nav-row')) {
      event.preventDefault();
      const file = active.dataset.navItem?.split(':').slice(2).join(':');
      if (file) onTogglePin(file);
      return;
    }
    if (/^[\p{L}\p{N}]$/u.test(key) && !event.shiftKey) {
      // Type-ahead: the start of a name, or of the part after its prefix
      event.preventDefault();
      const now = event.timeStamp;
      const state = typeahead.current;
      state.text =
        now - state.at < TYPEAHEAD_MS ? state.text + fold(key) : fold(key);
      state.at = now;
      const wanted = state.text;
      const rows = list.filter((item) => item.dataset.stem !== undefined);
      const from = Math.max(0, rows.indexOf(active as HTMLElement));
      const order = [
        ...rows.slice(wanted.length > 1 ? from : from + 1),
        ...rows.slice(0, from + 1),
      ];
      focusAt(
        order.find(
          (row) =>
            (row.dataset.stem ?? '').startsWith(wanted) ||
            (row.dataset.name ?? '').startsWith(wanted),
        ),
      );
      return;
    }
    const next = nextIndex(at, list.length, key);
    if (next === null) return;
    event.preventDefault();
    focusAt(list[next]);
  };

  const onFilterKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && (query !== '' || chipsActive(chips))) {
      event.preventDefault();
      // Esc clears the text first, then the chips
      if (query !== '') setQuery('');
      else clearFilters();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusAt(
        items().find((item) => item.classList.contains('nav-row')) ??
          items()[0],
      );
    }
  };

  const toggleLayer = (layer: string) =>
    setChips((previous) => ({
      ...previous,
      layers: previous.layers.includes(layer)
        ? previous.layers.filter((other) => other !== layer)
        : [...previous.layers, layer],
    }));

  const nothing =
    groups !== null && groups.every((group) => shownCount(group) === 0);
  const rowProps = {
    width: width ?? 340,
    current,
    tabbable,
    onTogglePin,
    pinned: pinnedSet,
    open,
    onRowMenu,
  };

  return (
    <nav
      id="sidebar"
      className="sidebar"
      aria-label="Docs"
      hidden={hidden}
      style={width === null ? undefined : { width }}
    >
      <div className="sidebar-head">
        <div className="search-field">
          <Search size={14} aria-hidden="true" />
          <input
            ref={filterRef}
            type="search"
            className="input"
            placeholder="Filter docs"
            aria-label="Filter docs by name or alias"
            aria-keyshortcuts={filterKeys}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value === '' && !chipsActive(chips)) {
                setFilterCollapsed(new Set());
              }
            }}
            onKeyDown={onFilterKey}
          />
          <span className="search-field-end">
            {query === '' ? (
              <ShortcutKeys id="filter" />
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
        <div className="sidebar-tools">
          <span className="sidebar-tools-label" id="group-by-label">
            Group
          </span>
          <div
            className="segmented segmented-sm"
            role="group"
            aria-labelledby="group-by-label"
          >
            {GROUP_BY.map(({ value, label, title }) => (
              <button
                key={value}
                type="button"
                aria-pressed={groupBy === value}
                title={title}
                onClick={() => onGroupBy(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`btn btn-ghost btn-sm sidebar-filters${activeChips > 0 ? ' is-on' : ''}`}
            aria-expanded={chipsShown}
            aria-controls="sidebar-chips"
            title="Quick filters: layer, draft, has issues"
            onClick={() => {
              const next = !filtersOpen;
              setFiltersOpen(next);
              writeSetting(STORAGE_KEYS.sidebarFilters, String(next));
            }}
          >
            <ListFilter size={13} aria-hidden="true" />
            Filters
            {activeChips > 0 && (
              <span className="sidebar-filters-count tabular">
                {activeChips}
              </span>
            )}
          </button>
        </div>
        {chipsShown && (
          <div
            className="chips"
            id="sidebar-chips"
            role="group"
            aria-label="Show only"
          >
            {LAYER_ORDER.map((layer) => (
              <button
                key={layer}
                type="button"
                className="chip"
                aria-pressed={chips.layers.includes(layer)}
                onClick={() => toggleLayer(layer)}
                title={`Only ${layer} datasets`}
              >
                <span
                  className={`layer-marker layer-${layer}`}
                  aria-hidden="true"
                />
                {LAYER_LABELS[layer]}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              aria-pressed={chips.draft}
              onClick={() => setChips((c) => ({ ...c, draft: !c.draft }))}
              title="Only docs with status: draft"
            >
              <PencilLine size={11} aria-hidden="true" />
              Draft
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={chips.issues}
              onClick={() => setChips((c) => ({ ...c, issues: !c.issues }))}
              title="Only docs named in Docs health"
            >
              <TriangleExclamationPoint size={11} aria-hidden="true" />
              Has issues
            </button>
          </div>
        )}
      </div>
      <div
        className="sidebar-scroll"
        ref={listRef}
        onKeyDown={onListKey}
        onFocus={(event) => {
          const key = (event.target as HTMLElement).dataset.navItem;
          if (key !== undefined) setFocusKey(key);
        }}
      >
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
              detail={[
                query.trim(),
                ...chips.layers,
                chips.draft ? 'draft' : '',
                chips.issues ? 'has issues' : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              actions={
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              }
            >
              <p>The filter looks at names and aliases.</p>
            </StateView>
          </div>
        ) : (
          <>
            {quick.map(({ group, scope, icon: Icon }) => (
              <Group
                key={scope}
                group={group}
                depth={0}
                scope={scope}
                filtering={false}
                icon={
                  <Icon
                    size={12}
                    aria-hidden="true"
                    className="nav-group-icon"
                  />
                }
                isCollapsed={isCollapsed}
                onToggle={toggle}
                rowProps={{ ...rowProps, showLayer: false }}
              />
            ))}
            {main.map(({ group }) => (
              <Group
                key={group.id}
                group={group}
                depth={0}
                scope="main"
                filtering={filtering}
                isCollapsed={isCollapsed}
                onToggle={toggle}
                rowProps={{ ...rowProps, showLayer: groupBy !== 'layer' }}
              />
            ))}
          </>
        )}
      </div>
      <footer className="sidebar-foot">{footer}</footer>
      {width !== null && (
        <ResizeHandle
          edge="right"
          width={width}
          min={SIDEBAR_MIN}
          max={SIDEBAR_MAX}
          clamp={clampWidth}
          onWidth={onWidth}
          onReset={() => onWidth(clampWidth(NaN))}
          label="Resize the sidebar"
          controls="sidebar"
        />
      )}
    </nav>
  );
}
