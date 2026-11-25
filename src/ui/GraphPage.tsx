import '@xyflow/react/dist/style.css';

import {
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  getViewportForBounds,
  useReactFlow,
  useViewportStore,
} from '@xyflow/react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import type { GraphResponse } from '../server/api';
import {
  MINIMAP_MIN_WIDTH,
  clampPanelWidth,
  fitPadding,
  isInView,
  isStep,
  parsePanelWidth,
  stepNode,
  withPending,
  type Pending,
} from './graphChrome';
import { CanvasControls } from './GraphControls';
import { GraphOverview, NodeDetails, PathDetails } from './GraphDetails';
import {
  arrange,
  lookupsRead,
  sharedFeeds,
  sharedLookups,
} from './graphFamilies';
import type { Rect } from './graphLayout';
import {
  between,
  edgeKey,
  lineageOf,
  trace,
  visibleGraph,
  type VisibleGraph,
} from './graphModel';
import { CAPTION_FONT, LABEL_FONT, captionOf, placeGraph } from './graphNodes';
import {
  BandFrames,
  edgeTypes,
  miniMapClass,
  nodeTypes,
  type BandFrame,
  type LineageNode,
  type RoutedEdge,
} from './GraphParts';
import { GraphToolbar } from './GraphToolbar';
import { graphHash, type GraphRoute } from './route';
import { STORAGE_KEYS, motionDuration, parseFlag } from './settings';
import { StateView } from './State';
import { readSetting, useReducedMotion, writeSetting } from './storage';

/**
 * Selection changes replace the history entry so back does not step
 * through every click; view changes (focus, depth, toggles) push one.
 */
function go(route: GraphRoute, replace = false): void {
  const hash = graphHash(route);
  if (hash === window.location.hash) return;
  if (replace) {
    window.history.replaceState(null, '', hash);
    // replaceState fires no event; the app follows the hash through it
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

const EMPTY: VisibleGraph = { nodes: [], edges: [] };
const NO_IDS: ReadonlySet<string> = new Set();

interface Props {
  data: GraphResponse | null;
  route: GraphRoute;
}

/**
 * Node sizes are measured on a canvas, which falls back to another font
 * until the bundled one has loaded; laying out before that would misfit.
 */
function useNodeFontsReady(): boolean {
  const [ready, setReady] = useState(
    () =>
      document.fonts.check(LABEL_FONT) && document.fonts.check(CAPTION_FONT),
  );
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    // Lay out anyway if the font cannot load, rather than never
    Promise.all([
      document.fonts.load(LABEL_FONT),
      document.fonts.load(CAPTION_FONT),
    ]).then(done, done);
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/** The side panel's width and whether it is hidden, kept between sessions. */
function usePanel() {
  const windowWidth = useWindowWidth();
  const [stored, setStored] = useState(() =>
    parsePanelWidth(readSetting(STORAGE_KEYS.graphPanelWidth)),
  );
  const [collapsed, setCollapsedState] = useState(() =>
    parseFlag(readSetting(STORAGE_KEYS.graphPanelCollapsed)),
  );
  return {
    width: clampPanelWidth(stored, windowWidth),
    setWidth: (value: number) => {
      const next = clampPanelWidth(value, window.innerWidth);
      setStored(next);
      writeSetting(STORAGE_KEYS.graphPanelWidth, String(next));
    },
    collapsed,
    setCollapsed: (value: boolean) => {
      setCollapsedState(value);
      writeSetting(STORAGE_KEYS.graphPanelCollapsed, String(value));
    },
  };
}

/** The last part of a node id, to name a node the graph does not have. */
const idName = (id: string) =>
  id
    .replace(/^external:/, '')
    .replace(/^.*\//, '')
    .replace(/\.md$/, '');

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

interface Notice {
  text: string;
  actions: { label: string; run: () => void }[];
}

export function GraphPage(props: Props) {
  useEffect(() => {
    document.title = 'Lineage graph · RCD data models';
  }, []);
  return (
    <ReactFlowProvider>
      <GraphView {...props} />
    </ReactFlowProvider>
  );
}

function GraphView({ data, route: address }: Props) {
  // A control's change shows at once, before the address catches up
  const addressHash = graphHash(address);
  const [pending, setPending] = useState<Pending | null>(null);
  const route = useMemo(
    () => withPending(address, addressHash, pending),
    [address, addressHash, pending],
  );
  const { focus, depth, showExternal, showRedundant, lookupWires } = route;

  const fontsReady = useNodeFontsReady();
  const graph = fontsReady ? (data?.graph ?? null) : null;
  const reducedMotion = useReducedMotion();
  const panel = usePanel();
  const canvasRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () =>
      graph === null
        ? EMPTY
        : visibleGraph(graph, { showExternal, showRedundant }),
    [graph, showExternal, showRedundant],
  );
  // Classified on everything visible, so focusing does not change them
  const lookups = useMemo(() => sharedLookups(visible), [visible]);
  const feeds = useMemo(
    () => sharedFeeds(visible, lookups),
    [visible, lookups],
  );
  const focusNode =
    focus === null ? null : (visible.nodes.find((n) => n.id === focus) ?? null);
  const shown = useMemo(
    () =>
      focusNode === null
        ? visible
        : lineageOf(visible, trace(visible, focusNode.id, depth)),
    [visible, focusNode, depth],
  );
  // One lineage reads best as one family, so focus does not split feeds off
  const arrangement = useMemo(
    () =>
      arrange(shown, { lookups, feeds: focusNode === null ? feeds : NO_IDS }),
    [shown, lookups, feeds, focusNode],
  );
  const reads = useMemo(
    () => lookupsRead(shown.edges, lookups),
    [shown, lookups],
  );
  // The tag's room is kept with wires on too, so toggling moves nothing
  const tags = useMemo(
    () =>
      new Map(
        [...reads].map(([id, list]) => [
          id,
          `${list.length} ${list.length === 1 ? 'lookup' : 'lookups'}`,
        ]),
      ),
    [reads],
  );
  // Only reruns when the drawn nodes or edges change, never on pan or zoom
  const placed = useMemo(
    () => placeGraph(shown, arrangement.groups, tags),
    [shown, arrangement, tags],
  );
  const byId = useMemo(
    () => new Map(shown.nodes.map((n) => [n.id, n])),
    [shown],
  );
  const boxes = useMemo(() => {
    const result = new Map<string, Rect>();
    for (const [id, at] of placed.layout.positions) {
      const box = placed.boxes.get(id);
      if (box !== undefined) result.set(id, { ...at, ...box });
    }
    return result;
  }, [placed]);
  const bandOf = useMemo(
    () =>
      new Map(
        arrangement.bands.flatMap((band) =>
          band.nodes.map((id) => [id, band.id] as const),
        ),
      ),
    [arrangement],
  );
  const frames = useMemo(
    (): BandFrame[] =>
      arrangement.bands.flatMap((band) => {
        const rect = placed.layout.bands.get(band.id);
        if (rect === undefined) return [];
        const names = band.nodes
          .map((id) => byId.get(id)?.name ?? id)
          .sort((a, b) => a.localeCompare(b));
        return [
          {
            ...rect,
            id: band.id,
            title: band.title,
            detail: band.detail,
            kind: band.kind,
            count: band.nodes.length,
            members: `${band.title}${band.detail === null ? '' : ` (${band.detail})`}\n${names.join('\n')}`,
          },
        ];
      }),
    [arrangement, placed, byId],
  );
  // The feeds each reader reads, for its hover text
  const feedsRead = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const edge of shown.edges) {
      if (!feeds.has(edge.from)) continue;
      const list = result.get(edge.to) ?? [];
      list.push(byId.get(edge.from)?.name ?? edge.from);
      result.set(edge.to, list);
    }
    return result;
  }, [shown, feeds, byId]);

  const [openTag, setOpenTag] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredBand, setHoveredBand] = useState<string | null>(null);

  const selected = shown.nodes.find((n) => n.id === route.node) ?? null;
  const other = shown.nodes.find((n) => n.id === route.to) ?? null;
  const lineage = useMemo(
    () => (selected === null ? null : trace(shown, selected.id, depth)),
    [shown, selected, depth],
  );
  const path = useMemo(
    () =>
      selected === null || other === null || other.id === selected.id
        ? null
        : { to: other, between: between(shown, selected.id, other.id) },
    [shown, selected, other],
  );

  const litEdge = (key: string): boolean => {
    if (path !== null) return path.between.edges.has(key);
    if (lineage === null) return false;
    return lineage.upstreamEdges.has(key) || lineage.downstreamEdges.has(key);
  };

  // Keyboard: one node is in the tab order; arrow keys move it
  const [cursor, setCursor] = useState<string | null>(null);
  const firstNode = useMemo(
    () =>
      [...boxes].sort(([, a], [, b]) => a.y - b.y || a.x - b.x)[0]?.[0] ?? null,
    [boxes],
  );
  const tabStop =
    cursor !== null && boxes.has(cursor)
      ? cursor
      : selected !== null
        ? selected.id
        : firstNode;

  // Rebuilt each render: the tags carry handlers that close over the route
  const nodes = ((): LineageNode[] => {
    const tagOf = (id: string): LineageNode['data']['tag'] => {
      const list = reads.get(id);
      const text = tags.get(id);
      if (lookupWires || list === undefined || text === undefined) return null;
      return {
        text,
        lookups: list
          .map((from) => ({ id: from, name: byId.get(from)?.name ?? from }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        open: openTag === id,
        lit: list.some((from) => litEdge(edgeKey({ from, to: id }))),
        onToggle: () => setOpenTag(openTag === id ? null : id),
        onPick: (lookup) => {
          setOpenTag(null);
          select(lookup);
        },
      };
    };
    const state = (id: string): string => {
      if (id === selected?.id) return 'is-selected';
      if (path !== null) {
        if (id === path.to.id) return 'is-selected';
        return path.between.nodes.has(id) ? 'is-between' : 'is-dim';
      }
      if (lineage === null) return '';
      const up = lineage.upstream.has(id);
      const down = lineage.downstream.has(id);
      if (up && down) return 'is-up is-down';
      if (up) return 'is-up';
      if (down) return 'is-down';
      return 'is-dim';
    };
    return shown.nodes.map((node) => {
      const box = placed.boxes.get(node.id);
      const position = placed.layout.positions.get(node.id) ?? { x: 0, y: 0 };
      const fed = feedsRead.get(node.id);
      const tooltip = [
        node.name,
        node.kind === 'dataset'
          ? `dataset · ${captionOf(node)}`
          : captionOf(node),
        node.file === null ? 'No doc has this name' : node.file,
        fed === undefined ? null : `Reads the shared feed ${fed.join(', ')}`,
      ]
        .filter((line) => line !== null)
        .join('\n');
      return {
        id: node.id,
        type: 'lineage',
        position,
        width: box?.width,
        height: box?.height,
        data: {
          node,
          lines: box?.lines ?? [node.name],
          caption: box?.caption ?? '',
          tag: tagOf(node.id),
          tooltip,
        },
        // An open tag's list must sit above the nodes around it
        zIndex: openTag === node.id ? 10 : 0,
        className: state(node.id),
        ariaLabel: `${node.name}, ${captionOf(node)}`,
        focusable: node.id === tabStop,
      };
    });
  })();

  const edges = useMemo((): RoutedEdge[] => {
    const state = (key: string): string => {
      if (path !== null)
        return path.between.edges.has(key) ? 'is-between' : 'is-dim';
      if (lineage === null) return '';
      if (lineage.upstreamEdges.has(key)) return 'is-up';
      if (lineage.downstreamEdges.has(key)) return 'is-down';
      return 'is-dim';
    };
    const lit = (key: string) => !['', 'is-dim'].includes(state(key));
    // A feed's long curves stay faint unless the feed, a reader, or a band
    // at either end is pointed at; tracing lights them like any other link
    const hot = (from: string, to: string) =>
      hoveredNode === from ||
      hoveredNode === to ||
      (hoveredBand !== null &&
        (bandOf.get(from) === hoveredBand || bandOf.get(to) === hoveredBand));
    // A lookup's links are tags unless asked for; selecting the lookup, or
    // a path through it, draws them. Other selections light the tags.
    const drawn = shown.edges.filter(
      (edge) =>
        lookupWires ||
        !lookups.has(edge.from) ||
        (lit(edge.key) && (path !== null || edge.from === selected?.id)),
    );
    // Lit edges last, so they are drawn over dimmed ones (still under nodes)
    const ordered = drawn.sort(
      (a, b) => Number(lit(a.key)) - Number(lit(b.key)),
    );
    return ordered.map((edge) => {
      const curved = placed.layout.curved.has(edge.key);
      const feed = curved && feeds.has(edge.from);
      let className = state(edge.key);
      if (feed && className === '') {
        className = hot(edge.from, edge.to) ? 'is-hot' : 'is-quiet';
      }
      return {
        id: edge.key,
        source: edge.from,
        target: edge.to,
        type: 'routed',
        data: {
          points: placed.layout.routes.get(edge.key) ?? [],
          redundant: edge.redundant,
          curved,
          lookup: lookups.has(edge.from),
          feed,
        },
        className,
      };
    });
  }, [
    shown,
    placed,
    lineage,
    path,
    lookups,
    feeds,
    lookupWires,
    selected,
    hoveredNode,
    hoveredBand,
    bandOf,
  ]);

  const { setViewport, setCenter, getViewport } = useReactFlow();
  const width = useViewportStore((state) => state.width);
  const height = useViewportStore((state) => state.height);
  const minimap = width >= MINIMAP_MIN_WIDTH;
  // True while the view is the fitted whole, so a resize refits it
  const fitted = useRef(false);
  // Fits a rectangle of the layout, frames included, clear of the controls
  const fitRect = (rect: Rect, maxZoom: number, duration: number) => {
    if (width === 0 || height === 0 || rect.width === 0) return;
    void setViewport(
      getViewportForBounds(
        rect,
        width,
        height,
        0.05,
        maxZoom,
        fitPadding(minimap),
      ),
      { duration: motionDuration(duration, reducedMotion) },
    );
  };
  const bounds = placed.layout.bounds;
  const fitAll = (duration: number) => {
    fitRect(bounds, 1.2, duration);
    fitted.current = true;
  };
  const ready = width > 0 && height > 0 && nodes.length > 0;
  const viewKey = `${focus}|${depth}|${showExternal}|${showRedundant}|${ready}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitAll(0));
    return () => cancelAnimationFrame(frame);
    // Refit when the view changes, not on every new bounds object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  // The panel or window changed size: refit a fitted view, otherwise keep
  // what was in the middle in the middle
  const lastSize = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const before = lastSize.current;
    lastSize.current = { width, height };
    if (before === null || before.width === 0 || width === 0) return;
    if (before.width === width && before.height === height) return;
    if (fitted.current) {
      fitAll(0);
      return;
    }
    const view = getViewport();
    void setViewport({
      x: view.x + (width - before.width) / 2,
      y: view.y + (height - before.height) / 2,
      zoom: view.zoom,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Centring: find and the panel lists always centre (closer for find);
  // other selections (the address, a lookup tag) only when off screen
  const [centreOn, setCentreOn] = useState<{
    id: string;
    zoom: number;
  } | null>(null);
  const centre = (id: string, minZoom: number) => {
    const box = boxes.get(id);
    if (box === undefined) return false;
    const zoom = Math.max(getViewport().zoom, minZoom);
    fitted.current = false;
    void setCenter(box.x + box.width / 2, box.y + box.height / 2, {
      zoom,
      duration: motionDuration(300, reducedMotion),
    });
    return true;
  };
  useEffect(() => {
    if (centreOn === null || !ready) return;
    const frame = requestAnimationFrame(() => {
      if (centre(centreOn.id, centreOn.zoom)) setCentreOn(null);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreOn, boxes, ready]);

  const seen = useRef<string | null | undefined>(undefined);
  const quiet = useRef<string | null>(null);
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!ready || seen.current === selectedId) return;
    const first = seen.current === undefined;
    seen.current = selectedId;
    if (selectedId === null) return;
    // Clicked on the canvas, or centred by find or the panel already
    if (quiet.current === selectedId) {
      quiet.current = null;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const box = boxes.get(selectedId);
      if (box === undefined) return;
      // Opened at a selection in the whole graph: go close enough to read
      if (first && focus === null) {
        centre(selectedId, 1);
        return;
      }
      if (!isInView(box, getViewport(), { width, height })) {
        centre(selectedId, 0);
      }
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  // Moves keyboard focus to the node the arrow keys picked
  useEffect(() => {
    if (cursor === null) return;
    const frame = requestAnimationFrame(() => {
      canvasRef.current
        ?.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(cursor)}"]`,
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [cursor]);

  function select(id: string | null, to: string | null = null) {
    setOpenTag(null);
    go({ ...route, node: id ?? focus, to }, true);
  }

  const setView = (change: Partial<GraphRoute>) => {
    setPending({ base: addressHash, change });
    go({ ...route, ...change });
  };

  // Esc steps back: the open tag, then the second node, then the selection
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')) {
        return;
      }
      if (openTag !== null) setOpenTag(null);
      else if (route.to !== null) select(route.node, null);
      else if (route.node !== null && route.node !== focus) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const find = (id: string) => {
    const node = graph?.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    quiet.current = id;
    setCentreOn({ id, zoom: 1 });
    setCursor(id);
    if (shown.nodes.some((n) => n.id === id)) {
      select(id);
      return;
    }
    // Not in this view: show the whole graph, with undocumented nodes if needed
    setView({
      focus: null,
      node: id,
      to: null,
      showExternal: showExternal || node.kind === 'external',
    });
  };

  const pickFromPanel = (id: string) => {
    quiet.current = id;
    setCentreOn({ id, zoom: 0.6 });
    setCursor(id);
    select(id);
  };

  const onCanvasKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const element = target.closest<HTMLElement>('.react-flow__node');
    const id = element?.dataset.id;
    if (id === undefined || target !== element) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setCursor(id);
      if (event.shiftKey && selected !== null && id !== selected.id) {
        select(selected.id, id);
      } else {
        quiet.current = id;
        select(id);
      }
    } else if (isStep(event.key)) {
      const next = stepNode(id, event.key, shown.edges, boxes);
      event.preventDefault();
      if (next !== null) setCursor(next);
    }
  };

  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    const startX = event.clientX;
    const startWidth = panel.width;
    const move = (e: globalThis.PointerEvent) =>
      panel.setWidth(startWidth - (e.clientX - startX));
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
      event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    panel.setWidth(panel.width + delta);
  };

  const tagged = lookupWires
    ? 0
    : shown.edges.filter((e) => lookups.has(e.from)).length;
  const hiddenExternal =
    graph === null || showExternal
      ? 0
      : graph.nodes.filter((n) => n.kind === 'external').length;
  const kindCount = (kind: string) =>
    shown.nodes.filter((n) => n.kind === kind).length;
  const summary = `${plural(shown.nodes.length, 'node')} in ${plural(frames.length, 'band')}: ${plural(kindCount('dataset'), 'dataset')}, ${plural(kindCount('pipeline'), 'pipeline')}${
    kindCount('external') > 0 ? `, ${kindCount('external')} undocumented` : ''
  }. ${plural(shown.edges.length - tagged, 'link')} drawn${
    tagged > 0 ? `, ${tagged} more as lookup tags` : ''
  }.`;

  // What to say when the address names something this view cannot show
  const notice = ((): Notice | null => {
    if (graph === null || (focus !== null && focusNode === null)) return null;
    const missing = (id: string, second: boolean): Notice => {
      const known = graph.nodes.find((n) => n.id === id);
      const name = `“${known?.name ?? idName(id)}”`;
      const clear = {
        label: second ? 'Clear the second node' : 'Clear the selection',
        run: () => (second ? select(route.node) : select(null)),
      };
      if (known === undefined) {
        return {
          text: `There is no node ${name} in the graph; its doc may have been renamed or removed.`,
          actions: [clear],
        };
      }
      if (known.kind === 'external' && !showExternal) {
        return {
          text: `${name} is an undocumented name, and those are hidden.`,
          actions: [
            {
              label: 'Show undocumented names',
              run: () => setView({ showExternal: true }),
            },
            clear,
          ],
        };
      }
      return {
        text: `${name} is not in this lineage.`,
        actions: [
          {
            label: 'Show the whole graph',
            run: () => setView({ focus: null }),
          },
          clear,
        ],
      };
    };
    if (route.node !== null && selected === null)
      return missing(route.node, false);
    if (route.to !== null && other === null) return missing(route.to, true);
    if (focusNode !== null && shown.nodes.length === 1) {
      return {
        text: `${focusNode.name} has no links in this view: nothing feeds it and nothing reads it.`,
        actions: [
          {
            label: 'Back to the whole graph',
            run: () => setView({ focus: null }),
          },
        ],
      };
    }
    return null;
  })();

  let canvas;
  if (graph === null) {
    canvas = <StateView kind="loading" centred title="Loading the graph…" />;
  } else if (focus !== null && focusNode === null) {
    const known = graph.nodes.find((n) => n.id === focus);
    const hidden = known?.kind === 'external' && !showExternal;
    canvas = (
      <StateView
        kind="empty"
        centred
        title={
          hidden
            ? `${known.name} is an undocumented name, and those are hidden`
            : known === undefined
              ? 'This node is not in the graph'
              : `${known.name} is not in this view`
        }
        detail={focus}
      >
        <p>
          {hidden && (
            <>
              <a href={graphHash({ ...route, showExternal: true })}>
                Show undocumented names
              </a>{' '}
              or{' '}
            </>
          )}
          <a href={graphHash({ ...route, focus: null, node: null, to: null })}>
            see the whole graph
          </a>
          .
        </p>
      </StateView>
    );
  } else if (shown.nodes.length === 0) {
    canvas = (
      <StateView kind="empty" centred title="Nothing to show">
        <p>
          {hiddenExternal > 0 ? (
            <>
              The docs only mention undocumented names, and those are hidden.{' '}
              <a href={graphHash({ ...route, showExternal: true })}>
                Show undocumented names
              </a>
              .
            </>
          ) : (
            'No dataset or pipeline docs were found.'
          )}
        </p>
      </StateView>
    );
  } else {
    canvas = (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(event, node) => {
          setCursor(node.id);
          if (event.shiftKey && selected !== null && node.id !== selected.id) {
            select(selected.id, node.id);
          } else {
            quiet.current = node.id;
            select(node.id);
          }
        }}
        onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
        onNodeMouseLeave={() => setHoveredNode(null)}
        onPaneClick={() => (openTag !== null ? setOpenTag(null) : select(null))}
        onMoveStart={(event) => {
          // Only the reader's own panning and zooming unfits the view
          if (event !== null) fitted.current = false;
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        minZoom={0.05}
        maxZoom={2.5}
        attributionPosition="top-right"
      >
        <ViewportPortal>
          <BandFrames frames={frames} hot={hoveredBand} />
        </ViewportPortal>
        <CanvasControls
          canvasRef={canvasRef}
          reducedMotion={reducedMotion}
          onFit={() => fitAll(300)}
        />
        {minimap && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            ariaLabel="Minimap"
            nodeClassName={(node) =>
              miniMapClass((node as LineageNode).data.node)
            }
          />
        )}
      </ReactFlow>
    );
  }

  return (
    <div className="graph-page">
      <GraphToolbar
        nodes={graph?.nodes ?? []}
        route={route}
        target={selected?.id ?? focus}
        depthApplies={selected !== null || focus !== null}
        counts={
          graph === null
            ? null
            : {
                nodes: shown.nodes.length,
                links: shown.edges.length - tagged,
                tags: tagged,
              }
        }
        panelCollapsed={panel.collapsed}
        onFind={find}
        onView={setView}
        onTogglePanel={() => panel.setCollapsed(!panel.collapsed)}
      />
      <div className="graph-body">
        <div
          className="graph-canvas"
          ref={canvasRef}
          onKeyDown={onCanvasKey}
          data-zoom="detail"
        >
          {canvas}
          {notice !== null && (
            <div className="graph-notice" role="status">
              <p>{notice.text}</p>
              <div className="graph-notice-actions">
                {notice.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="btn btn-sm"
                    onClick={action.run}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {!panel.collapsed && (
          <div
            className="resizer graph-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the side panel"
            aria-controls="graph-panel"
            aria-valuenow={panel.width}
            tabIndex={0}
            title="Drag to resize; arrow keys work too"
            onPointerDown={onResizeStart}
            onKeyDown={onResizeKey}
          />
        )}
        <aside
          id="graph-panel"
          className="panel graph-side"
          aria-label="Graph details"
          hidden={panel.collapsed}
          style={{ width: panel.width }}
        >
          {graph === null ? null : selected !== null &&
            path !== null &&
            lineage !== null ? (
            <PathDetails
              shown={shown}
              from={selected}
              to={path.to}
              path={path.between}
              onSelect={pickFromPanel}
              onSwap={() => select(path.to.id, selected.id)}
              onClearSecond={() => select(selected.id)}
              onClose={() => select(null)}
            />
          ) : selected !== null && lineage !== null ? (
            <NodeDetails
              graph={graph}
              shown={shown}
              node={selected}
              lookups={lookups}
              feeds={feeds}
              lineage={lineage}
              focused={focus !== null && focus === selected.id}
              onSelect={pickFromPanel}
              onFocus={() =>
                setView({ focus: selected.id, node: selected.id, to: null })
              }
              onWhole={() => setView({ focus: null })}
              onClose={() => select(null)}
            />
          ) : (
            <GraphOverview
              frames={frames}
              summary={summary}
              hiddenExternal={hiddenExternal}
              onShowExternal={() => setView({ showExternal: true })}
              onPickBand={(frame) => {
                fitted.current = false;
                fitRect(frame, 1.5, 300);
              }}
              onHoverBand={setHoveredBand}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
