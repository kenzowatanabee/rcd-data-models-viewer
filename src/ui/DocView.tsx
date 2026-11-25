import { ArrowUp } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { GraphResponse } from '../server/api';
import { fetchDoc, type Loaded } from './api';
import { DocHeader } from './DocHeader';
import { docHeader } from './docHeaderModel';
import { FlowDocsContext } from './FlowDiagram';
import { docLinker } from './flowTrace';
import { splitFrontMatter } from './frontMatter';
import { LineagePanel } from './LineagePanel';
import { Markdown } from './Markdown';
import { OutlineMenu, OutlinePanel, useScrollSpy } from './OutlinePanel';
import {
  plainTitle,
  sameOutline,
  splitTitle,
  type OutlineItem,
} from './outline';
import { STORAGE_KEYS, parseFlag } from './settings';
import { useShortcut } from './ShortcutLayer';
import { githubSlug } from './slug';
import { StateView } from './State';
import {
  readSetting,
  useMediaQuery,
  useReducedMotion,
  writeSetting,
} from './storage';
import { Summary } from './Summary';
import { useDocScroll } from './useDocScroll';

interface Props {
  file: string;
  anchor: string | null;
  data: GraphResponse | null;
  /** Goes up when the docs change on disk, to refetch. */
  version: number;
  /** Show the indexer summary above the doc (the landing view). */
  landing?: boolean;
}

/** Wide enough for the doc and a right-hand column side by side. */
const WIDE = '(min-width: 1200px)';
/** Outlines with fewer entries than this are not worth a panel. */
const MIN_OUTLINE = 2;
/** Height of the sticky "On this page" bar on narrow windows. */
const STICKY_BAR = 44;

// Last text of each doc, so back/forward paint at once while refetching
const textCache = new Map<string, string>();

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

export function DocView({ file, anchor, data, version, landing }: Props) {
  const [loaded, setLoaded] = useState<{
    file: string;
    result: Loaded<string>;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wideWindow = useMediaQuery(WIDE);
  // `]` folds the right-hand column away; the doc then uses the narrow
  // layout, with the lineage above it and the outline as a menu
  const [asideHidden, setAsideHidden] = useState(() =>
    parseFlag(readSetting(STORAGE_KEYS.docAsideCollapsed)),
  );
  const wide = wideWindow && !asideHidden;
  const reducedMotion = useReducedMotion();

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

  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const onOutline = useCallback((items: OutlineItem[]) => {
    setOutline((previous) => (sameOutline(previous, items) ? previous : items));
  }, []);

  const scrollTo = useDocScroll({
    scrollRef,
    rootRef: articleRef,
    file,
    anchor,
    ready: text !== null,
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
  const shownOutline =
    doc !== null && outline.length >= MIN_OUTLINE ? outline : [];
  const hasOutline = shownOutline.length > 0;

  const spyOffset = (wide ? 0 : STICKY_BAR) + 40;
  const active = useScrollSpy(scrollRef, articleRef, shownOutline, spyOffset);

  const lineage = node && data && (
    <LineagePanel graph={data.graph} node={node} />
  );
  const outlineProps = {
    file,
    items: shownOutline,
    active,
    onSelect: scrollTo,
  };
  const aside = wide && (lineage || hasOutline);
  useShortcut(
    'toggle-panel',
    wideWindow && (lineage || hasOutline)
      ? () => {
          setAsideHidden(!asideHidden);
          writeSetting(STORAGE_KEYS.docAsideCollapsed, String(!asideHidden));
        }
      : null,
  );
  useShortcut('top', () => {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    titleRef.current?.focus({ preventScroll: true });
  });

  return (
    <div className={`doc-layout${aside ? ' with-aside' : ''}`}>
      <div className="doc-main">
        <div
          className={`doc-scroll${wide ? '' : ' is-narrow'}`}
          ref={scrollRef}
        >
          {!wide && lineage && <div className="doc-lineage-top">{lineage}</div>}
          <article className="doc" ref={articleRef}>
            {!wide && hasOutline && <OutlineMenu {...outlineProps} />}
            {landing && data && <Summary data={data} />}
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
            {doc && split && (
              <>
                <DocHeader
                  file={file}
                  title={title}
                  titleId={titleText === null ? null : githubSlug(titleText)}
                  model={docHeader(doc.data)}
                  graphNode={node?.file ? node.id : null}
                  frontMatterError={doc.error}
                  titleRef={titleRef}
                />
                <FlowDocsContext.Provider value={linkDoc}>
                  <Markdown
                    file={file}
                    body={split.body}
                    title={titleText}
                    onOutline={onOutline}
                  />
                </FlowDocsContext.Provider>
              </>
            )}
          </article>
        </div>
        <BackToTop
          scrollRef={scrollRef}
          onTop={() => titleRef.current?.focus({ preventScroll: true })}
        />
      </div>
      {aside && (
        <aside className="doc-aside" aria-label="Lineage and sections">
          {lineage}
          {hasOutline && <OutlinePanel {...outlineProps} />}
        </aside>
      )}
    </div>
  );
}
