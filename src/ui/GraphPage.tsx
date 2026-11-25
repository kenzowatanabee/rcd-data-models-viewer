import '@xyflow/react/dist/style.css';

import {
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  getViewportForBounds,
  useReactFlow,
  useViewportStore,
} from '@xyflow/react';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { GraphResponse } from '../server/api';
import { GraphDetails } from './GraphDetails';
import { GraphFind } from './GraphFind';
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
  type Depth,
  type VisibleGraph,
} from './graphModel';
import { CAPTION_FONT, LABEL_FONT, placeGraph } from './graphNodes';
import {
  BandFrames,
  BandList,
  edgeTypes,
  Legend,
  miniMapClass,
  nodeTypes,
  type BandFrame,
  type LineageNode,
  type RoutedEdge,
} from './GraphParts';
import { graphHash, type GraphRoute } from './route';
import { motionDuration } from './settings';
import { StateView } from './State';
import { useReducedMotion } from './storage';

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

/** Room left around what is fitted to the window, in screen pixels. */
const FIT_PADDING = '36px';

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

function GraphView({ data, route }: Props) {
  const { focus, depth, showExternal, showRedundant, lookupWires } = route;
  const fontsReady = useNodeFontsReady();
  const graph = fontsReady ? (data?.graph ?? null) : null;
  const reducedMotion = useReducedMotion();

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
  const frames = useMemo(
    (): BandFrame[] =>
      arrangement.bands.flatMap((band) => {
        const rect = placed.layout.bands.get(band.id);
        return rect === undefined
          ? []
          : [
              {
                ...rect,
                id: band.id,
                title: band.title,
                kind: band.kind,
                count: band.nodes.length,
              },
            ];
      }),
    [arrangement, placed],
  );
  const [openTag, setOpenTag] = useState<string | null>(null);

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

  // Rebuilt each render: the tags carry handlers that close over the route
  const nodes = ((): LineageNode[] => {
    const byId = new Map(shown.nodes.map((n) => [n.id, n]));
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
        },
        // An open tag's list must sit above the nodes around it
        zIndex: openTag === node.id ? 10 : 0,
        className: state(node.id),
        ariaLabel: node.name,
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
      const className = state(edge.key);
      return {
        id: edge.key,
        source: edge.from,
        target: edge.to,
        type: 'routed',
        data: {
          points: placed.layout.routes.get(edge.key) ?? [],
          redundant: edge.redundant,
          curved: placed.layout.curved.has(edge.key),
          lookup: lookups.has(edge.from),
        },
        className,
      };
    });
  }, [shown, placed, lineage, path, lookups, lookupWires, selected]);

  const { setViewport, setCenter, getZoom } = useReactFlow();
  const width = useViewportStore((state) => state.width);
  const height = useViewportStore((state) => state.height);
  // Fits a rectangle of the layout, frames included, with room around it
  const fitRect = (rect: Rect, maxZoom: number, duration: number) => {
    if (width === 0 || height === 0 || rect.width === 0) return;
    void setViewport(
      getViewportForBounds(rect, width, height, 0.05, maxZoom, FIT_PADDING),
      { duration: motionDuration(duration, reducedMotion) },
    );
  };
  const bounds = placed.layout.bounds;
  const ready = width > 0 && height > 0 && nodes.length > 0;
  const viewKey = `${focus}|${depth}|${showExternal}|${showRedundant}|${ready}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitRect(bounds, 1.2, 0));
    return () => cancelAnimationFrame(frame);
    // Refit when the view changes, not on every new bounds object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  // Set by find; the view centres once the node is laid out
  const [centreOn, setCentreOn] = useState<string | null>(null);
  useEffect(() => {
    if (centreOn === null) return;
    const position = placed.layout.positions.get(centreOn);
    const box = placed.boxes.get(centreOn);
    if (position === undefined || box === undefined) return;
    const frame = requestAnimationFrame(() => {
      void setCenter(position.x + box.width / 2, position.y + box.height / 2, {
        zoom: Math.max(getZoom(), 1),
        duration: motionDuration(300, reducedMotion),
      });
      setCentreOn(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [centreOn, placed, setCenter, getZoom, reducedMotion]);

  function select(id: string | null, to: string | null = null) {
    setOpenTag(null);
    go({ ...route, node: id ?? focus, to }, true);
  }

  const find = (id: string) => {
    const node = graph?.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    setCentreOn(id);
    if (shown.nodes.some((n) => n.id === id)) {
      select(id);
      return;
    }
    // Not in this view: show the whole graph, with undocumented nodes if needed
    go({
      ...route,
      focus: null,
      node: id,
      to: null,
      showExternal: showExternal || node.kind === 'external',
    });
  };

  const setView = (change: Partial<GraphRoute>) => go({ ...route, ...change });

  const tagged = shown.edges.filter((e) => lookups.has(e.from)).length;
  const counts =
    lookupWires || tagged === 0
      ? `${shown.nodes.length} nodes · ${shown.edges.length} links`
      : `${shown.nodes.length} nodes · ${shown.edges.length - tagged} links + ${tagged} as lookup tags`;

  return (
    <div className="graph-page">
      <div className="graph-toolbar" role="toolbar" aria-label="Graph view">
        <h1 className="visually-hidden">Lineage graph</h1>
        <GraphFind nodes={graph?.nodes ?? []} onPick={find} />
        <div className="segmented" role="group" aria-label="What to lay out">
          <button
            type="button"
            aria-pressed={focus === null}
            onClick={() => setView({ focus: null })}
          >
            Whole graph
          </button>
          <button
            type="button"
            aria-pressed={focus !== null}
            disabled={focus === null && selected === null}
            title={
              selected === null && focus === null
                ? 'Select a node first'
                : undefined
            }
            onClick={() =>
              setView({
                focus: selected?.id ?? focus,
                node: selected?.id ?? focus,
                to: null,
              })
            }
          >
            Only this lineage
          </button>
        </div>
        <label className="graph-option">
          Depth
          <span className="select-wrap">
            <select
              className="select"
              value={depth ?? 'all'}
              onChange={(event) =>
                setView({
                  depth: (event.target.value === 'all'
                    ? null
                    : Number(event.target.value)) as Depth,
                })
              }
            >
              <option value="all">all</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
        <label className="graph-option checkbox">
          <input
            type="checkbox"
            checked={showExternal}
            onChange={(event) =>
              setView({ showExternal: event.target.checked })
            }
          />
          Undocumented names
        </label>
        <label
          className="graph-option checkbox"
          title="Dataset to dataset links that a pipeline between the same datasets also declares"
        >
          <input
            type="checkbox"
            checked={showRedundant}
            onChange={(event) =>
              setView({ showRedundant: event.target.checked })
            }
          />
          Direct links a pipeline also gives
        </label>
        <label
          className="graph-option checkbox"
          title="Draw the links of the shared lookups instead of a tag on each reader"
        >
          <input
            type="checkbox"
            checked={lookupWires}
            onChange={(event) => setView({ lookupWires: event.target.checked })}
          />
          Wires for shared lookups
        </label>
        {graph !== null && (
          <span className="graph-counts" data-testid="graph-counts">
            {counts}
          </span>
        )}
      </div>
      <div className="graph-body">
        <div className="graph-canvas">
          {graph === null ? (
            <StateView kind="loading" centred title="Loading the graph…" />
          ) : focus !== null && focusNode === null ? (
            <StateView
              kind="empty"
              centred
              title={`This node is not in the graph${
                !showExternal && focus.startsWith('external:')
                  ? ' while undocumented names are hidden'
                  : ''
              }`}
              detail={focus}
            >
              <p>
                {!showExternal && focus.startsWith('external:') && (
                  <>
                    <a href={graphHash({ ...route, showExternal: true })}>
                      Show undocumented names
                    </a>{' '}
                    or{' '}
                  </>
                )}
                <a
                  href={graphHash({
                    ...route,
                    focus: null,
                    node: null,
                    to: null,
                  })}
                >
                  see the whole graph
                </a>
                .
              </p>
            </StateView>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={(event, node) => {
                if (
                  event.shiftKey &&
                  selected !== null &&
                  node.id !== selected.id
                ) {
                  select(selected.id, node.id);
                } else {
                  select(node.id);
                }
              }}
              onPaneClick={() =>
                openTag !== null ? setOpenTag(null) : select(null)
              }
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              edgesFocusable={false}
              minZoom={0.05}
              maxZoom={2.5}
              attributionPosition="top-right"
            >
              <ViewportPortal>
                <BandFrames frames={frames} />
              </ViewportPortal>
              <Controls showInteractive={false} position="top-left" />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                nodeClassName={(node) =>
                  miniMapClass((node as LineageNode).data.node)
                }
              />
            </ReactFlow>
          )}
        </div>
        <aside className="panel graph-side" aria-label="Graph details">
          {selected !== null && lineage !== null && graph !== null ? (
            <GraphDetails
              graph={graph}
              shown={shown}
              node={selected}
              lookups={lookups}
              reads={reads.get(selected.id) ?? []}
              lineage={lineage}
              path={path}
              focused={focus !== null && focus === selected.id}
              onSelect={(id) => {
                select(id);
                setCentreOn(id);
              }}
              onFocus={() =>
                setView({ focus: selected.id, node: selected.id, to: null })
              }
              onClose={() => select(null)}
            />
          ) : (
            <>
              <div className="panel-header">
                <h2>Overview</h2>
              </div>
              <div className="panel-section">
                <p className="panel-hint">
                  Click a node to trace everything upstream and downstream of
                  it.
                </p>
              </div>
              {frames.length > 0 && (
                <BandList
                  frames={frames}
                  onPick={(frame) => fitRect(frame, 1.5, 300)}
                />
              )}
            </>
          )}
          <Legend />
        </aside>
      </div>
    </div>
  );
}
