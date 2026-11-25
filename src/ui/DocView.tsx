import {
  ArrowUp,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import type { GraphResponse } from '../server/api';
import { fetchDoc, type Loaded } from './api';
import { ModalDialog } from './Dialog';
import { DocHeader } from './DocHeader';
import { docHeader } from './docHeaderModel';
import { FlowDocsContext } from './FlowDiagram';
import { docLinker } from './flowTrace';
import { splitFrontMatter } from './frontMatter';
import { LineagePanel } from './LineagePanel';
import type { Placement } from './layoutModel';
import { Markdown } from './Markdown';
import { sourceHeadings } from './markdownSource';
import { OutlinePanel, useScrollSpy } from './OutlinePanel';
import {
  plainTitle,
  sameOutline,
  splitTitle,
  type OutlineItem,
} from './outline';
import { ResizeHandle } from './ResizeHandle';
import { docHash } from './route';
import {
  ASIDE_DEFAULT,
  ASIDE_MAX,
  ASIDE_MIN,
  SESSION_KEYS,
  STORAGE_KEYS,
  parseStringList,
} from './settings';
import { Keys, useShortcut } from './ShortcutLayer';
import { githubSlug } from './slug';
import { SourceView } from './SourceView';
import { StateView } from './State';
import {
  readSession,
  readSetting,
  useReducedMotion,
  writeSession,
  writeSetting,
} from './storage';
import { useDocScroll } from './useDocScroll';

export interface AsideLayout {
  placement: Placement;
  width: number;
  clampWidth: (width: number) => number;
  onWidth: (width: number) => void;
  collapsed: boolean;
  onCollapsed: (collapsed: boolean) => void;
}

interface Props {
  file: string;
  anchor: string | null;
  /** Show the Markdown source instead of the rendered page. */
  source: boolean;
  line: number | null;
  data: GraphResponse | null;
  /** Goes up when the docs change on disk, to refetch. */
  version: number;
  /** The start page: `home` goes above the README. */
  landing?: boolean;
  home?: ReactNode;
  /** Section › group, for the context line above the doc. */
  trail: string[];
  pinned: boolean;
  onTogglePin: (() => void) | null;
  aside: AsideLayout;
}

/** Outlines with fewer entries than this are not worth a panel. */
const MIN_OUTLINE = 2;
/** Height of the sticky doc bar, for the scroll spy. */
const DOC_BAR = 44;

// Last text of each doc, so back/forward paint at once while refetching
const textCache = new Map<string, string>();

/** Docs left in the Markdown view in this tab. */
function sourceDocs(): Set<string> {
  return new Set(parseStringList(readSession(SESSION_KEYS.sourceDocs)));
}

function rememberSource(file: string, on: boolean) {
  const docs = sourceDocs();
  if (on) docs.add(file);
  else docs.delete(file);
  writeSession(SESSION_KEYS.sourceDocs, JSON.stringify([...docs]));
}

/**
 * Changes the address in place (no new history entry: switching views is
 * not navigation), with a fresh scroll entry so the new view is placed by
 * its anchor rather than by the other view's position.
 */
function replaceHash(hash: string) {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function DocSkeleton() {
  return (
    <div className="doc-loading" role="status">
      <span className="visually-hidden">Loading the doc…</span>
      {[40, 90, 85, 95, 60, 0, 80, 90, 70].map((width, index) =>
        width === 0 ? (
          <span key={index} style={{ height: 12 }} />
        ) : (
          <span
            key={index}
            className="skeleton"
            style={{ width: `${width}%`, height: index === 0 ? 24 : 14 }}
          />
        ),
      )}
    </div>
  );
}

function BackToTop({
  scrollRef,
  onTop,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  onTop: () => void;
}) {
  const [shown, setShown] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const update = () =>
      setShown(scroller.scrollTop > Math.max(600, scroller.clientHeight));
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, [scrollRef]);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="btn back-to-top"
      onClick={() => {
        scrollRef.current?.scrollTo({
          top: 0,
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
        onTop();
      }}
      title="Back to top"
    >
      <ArrowUp size={14} aria-hidden="true" />
      Top
    </button>
  );
}

export function DocView({
  file,
  anchor,
  source,
  line,
  data,
  version,
  landing,
  home,
  trail,
  pinned,
  onTogglePin,
  aside,
}: Props) {
  const [loaded, setLoaded] = useState<{
    file: string;
    result: Loaded<string>;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wrap, setWrap] = useState(
    () => readSetting(STORAGE_KEYS.sourceWrap) !== 'false',
  );
  const reducedMotion = useReducedMotion();
  const docked = aside.placement === 'docked';

  useEffect(() => {
    let cancelled = false;
    void fetchDoc(file).then((result) => {
      if (cancelled) return;
      if (result.ok) textCache.set(file, result.value);
      setLoaded({ file, result });
    });
    return () => {
      cancelled = true;
    };
  }, [file, version]);

  // A refetch after an edit keeps the old text on screen until the new arrives
  const cached = textCache.get(file);
  const current: Loaded<string> | null =
    loaded?.file === file
      ? loaded.result
      : cached !== undefined
        ? { ok: true, value: cached }
        : null;
  const text = current?.ok ? current.value : null;

  useEffect(() => {
    document.title = landing ? 'RCD data models' : `${file} · RCD data models`;
  }, [file, landing]);

  // A doc left in the Markdown view in this tab opens in it again
  useEffect(() => {
    if (!source && !landing && sourceDocs().has(file)) {
      replaceHash(docHash(file, anchor, { source: true }));
    }
    // Only on arriving at a doc, not when the reader switches back
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Navigating, or picking a section in the drawer, closes it
  const place = `${file}#${anchor}#${line}`;
  const [shownPlace, setShownPlace] = useState(place);
  if (place !== shownPlace) {
    setShownPlace(place);
    setDrawerOpen(false);
  }

  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const onOutline = useCallback((items: OutlineItem[]) => {
    setOutline((previous) => (sameOutline(previous, items) ? previous : items));
  }, []);

  const scrollTo = useDocScroll({
    scrollRef,
    rootRef: articleRef,
    file,
    anchor: source && line !== null ? `L${line}` : anchor,
    ready: text !== null,
    view: source ? 'source' : 'rendered',
  });

  const node = data?.graph.nodes.find((candidate) => candidate.id === file);
  // Flowchart nodes that name a doc link to it
  const graphNodes = data?.graph.nodes;
  const linkDoc = useMemo(
    () => (graphNodes === undefined ? null : docLinker(graphNodes)),
    [graphNodes],
  );
  const doc = text === null ? null : splitFrontMatter(text);
  const split = doc === null ? null : splitTitle(doc.body);
  const title = split?.title ?? null;
  const titleText = title === null ? null : plainTitle(title);
  const sourceOutline = useMemo(
    () =>
      text === null
        ? []
        : sourceHeadings(text)
            .filter((h) => h.depth === 2 || h.depth === 3)
            .map((h) => ({ id: h.id, text: h.text, depth: h.depth as 2 | 3 })),
    [text],
  );
  const baseOutline = source ? sourceOutline : outline;
  const shownOutline =
    doc !== null && baseOutline.length >= MIN_OUTLINE ? baseOutline : [];
  const hasOutline = shownOutline.length > 0;

  const active = useScrollSpy(
    scrollRef,
    articleRef,
    shownOutline,
    DOC_BAR + 40,
  );

  const lineage = node && data && (
    <LineagePanel graph={data.graph} node={node} />
  );
  const outlineProps = {
    file,
    items: shownOutline,
    active,
    onSelect: scrollTo,
  };
  // Links in the outline keep the view the reader is in
  const outlineHref = (id: string) => docHash(file, id, { source });
  const hasAside = Boolean(lineage) || hasOutline;
  const showDocked = docked && hasAside && !aside.collapsed;

  const togglePanel = () => {
    if (docked) aside.onCollapsed(!aside.collapsed);
    else setDrawerOpen((open) => !open);
  };
  useShortcut('toggle-panel', hasAside ? togglePanel : null);
  useShortcut('top', () => {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    titleRef.current?.focus({ preventScroll: true });
  });

  const setView = (next: boolean) => {
    if (next === source) return;
    rememberSource(file, next);
    // The section being read stays in view across the switch
    replaceHash(docHash(file, active, { source: next }));
  };
  useShortcut(
    'toggle-source',
    text !== null && !landing ? () => setView(!source) : null,
  );

  const panelLabel = docked
    ? aside.collapsed
      ? 'Show lineage and sections'
      : 'Hide lineage and sections'
    : 'Lineage and sections';

  const panelBody = (
    <>
      {lineage}
      {hasOutline && <OutlinePanel {...outlineProps} hrefOf={outlineHref} />}
    </>
  );

  return (
    <div className="doc-layout">
      <div className="doc-main">
        <div className="doc-scroll" ref={scrollRef}>
          <div className="doc-bar">
            <div className="doc-bar-inner">
              <nav className="crumbs" aria-label="Where this doc is">
                <ol>
                  {landing ? (
                    <li aria-current="page">Home</li>
                  ) : (
                    <>
                      {trail.map((part, index) => (
                        <li key={index}>
                          {part}
                          <ChevronRight size={12} aria-hidden="true" />
                        </li>
                      ))}
                      <li aria-current="page" className="is-name" title={file}>
                        {node?.name ?? file.slice(file.lastIndexOf('/') + 1)}
                      </li>
                    </>
                  )}
                </ol>
              </nav>
              <div className="doc-bar-actions">
                {!landing && text !== null && (
                  <div
                    className="segmented segmented-sm"
                    role="group"
                    aria-label="Show the doc as"
                  >
                    <button
                      type="button"
                      aria-pressed={!source}
                      onClick={() => setView(false)}
                      title="The rendered page (m)"
                    >
                      Rendered
                    </button>
                    <button
                      type="button"
                      aria-pressed={source}
                      onClick={() => setView(true)}
                      title="The Markdown file as on disk (m)"
                      aria-keyshortcuts="m"
                    >
                      Markdown
                    </button>
                  </div>
                )}
                {!landing && text !== null && (
                  <span className="doc-bar-key" aria-hidden="true">
                    <Keys chord="m" />
                  </span>
                )}
                {onTogglePin !== null && (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-icon btn-sm${pinned ? ' is-on' : ''}`}
                    aria-pressed={pinned}
                    aria-label={pinned ? 'Unpin this doc' : 'Pin this doc'}
                    title={
                      pinned
                        ? 'Unpin from the sidebar'
                        : 'Pin to the top of the sidebar'
                    }
                    onClick={onTogglePin}
                  >
                    {pinned ? (
                      <PinOff size={14} aria-hidden="true" />
                    ) : (
                      <Pin size={14} aria-hidden="true" />
                    )}
                  </button>
                )}
                {hasAside && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={panelLabel}
                    title={`${panelLabel} (])`}
                    aria-keyshortcuts="]"
                    aria-expanded={docked ? showDocked : drawerOpen}
                    aria-controls={docked ? 'doc-aside' : undefined}
                    onClick={togglePanel}
                  >
                    {(docked ? showDocked : drawerOpen) ? (
                      <PanelRightClose size={15} aria-hidden="true" />
                    ) : (
                      <PanelRightOpen size={15} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
          <article className="doc" ref={articleRef}>
            {landing && home}
            {current === null && <DocSkeleton />}
            {current?.ok === false && (
              <StateView
                kind="error"
                title={`Could not open ${file}`}
                detail={current.error}
                actions={
                  <a className="btn" href="#/">
                    Go to the start page
                  </a>
                }
              >
                <p>
                  The file may have been moved, renamed or deleted in the docs
                  folder. Pick another doc in the sidebar, or fix the link that
                  led here.
                </p>
              </StateView>
            )}
            {doc && split && text !== null && (
              <>
                <DocHeader
                  file={file}
                  title={title}
                  titleId={
                    titleText === null || source ? null : githubSlug(titleText)
                  }
                  model={docHeader(doc.data)}
                  graphNode={node?.file ? node.id : null}
                  linkName={node?.name ?? titleText ?? null}
                  frontMatterError={doc.error}
                  titleRef={titleRef}
                />
                {source ? (
                  <SourceView
                    file={file}
                    text={text}
                    line={line}
                    wrap={wrap}
                    onWrap={(next) => {
                      setWrap(next);
                      writeSetting(STORAGE_KEYS.sourceWrap, String(next));
                    }}
                  />
                ) : (
                  <FlowDocsContext.Provider value={linkDoc}>
                    <Markdown
                      file={file}
                      body={split.body}
                      title={titleText}
                      onOutline={onOutline}
                    />
                  </FlowDocsContext.Provider>
                )}
              </>
            )}
          </article>
        </div>
        <BackToTop
          scrollRef={scrollRef}
          onTop={() => titleRef.current?.focus({ preventScroll: true })}
        />
      </div>
      {showDocked && (
        <aside
          id="doc-aside"
          className="doc-aside"
          aria-label="Lineage and sections"
          style={{ width: aside.width }}
        >
          <ResizeHandle
            edge="left"
            width={aside.width}
            min={ASIDE_MIN}
            max={ASIDE_MAX}
            clamp={aside.clampWidth}
            onWidth={aside.onWidth}
            onReset={() => aside.onWidth(aside.clampWidth(ASIDE_DEFAULT))}
            label="Resize the lineage and sections column"
            controls="doc-aside"
          />
          {panelBody}
        </aside>
      )}
      {docked && hasAside && aside.collapsed && (
        <button
          type="button"
          className="aside-reopen"
          aria-label="Show lineage and sections"
          title="Show lineage and sections (])"
          onClick={() => aside.onCollapsed(false)}
        >
          <PanelRightOpen size={14} aria-hidden="true" />
        </button>
      )}
      {!docked && drawerOpen && hasAside && (
        <ModalDialog
          className="drawer drawer-right"
          label="Lineage and sections"
          onClose={() => setDrawerOpen(false)}
          closeOnBackdrop
        >
          <div className="drawer-panel">
            <div className="drawer-header">
              <h2>Lineage and sections</h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Close"
                title="Close (Esc)"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="drawer-body doc-aside-content">{panelBody}</div>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
