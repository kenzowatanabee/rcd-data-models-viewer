import '@xyflow/react/dist/style.css';

import {
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
} from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';

import type { GraphResponse } from '../server/api';
import { GraphDetails } from './GraphDetails';
import { GraphFind } from './GraphFind';
import {
  between,
  lineageOf,
  trace,
  visibleGraph,
  type Depth,
  type VisibleGraph,
} from './graphModel';
import { placeGraph } from './graphNodes';
import {
  edgeTypes,
  Legend,
  miniMapClass,
  nodeTypes,
  type LineageNode,
  type RoutedEdge,
} from './GraphParts';
import { graphHash, type GraphRoute } from './route';

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

interface Props {
  data: GraphResponse | null;
  route: GraphRoute;
  graphError: string | null;
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

function GraphView({ data, route, graphError }: Props) {
  const { focus, depth, showExternal, showRedundant } = route;
  const graph = data?.graph ?? null;

  const visible = useMemo(
    () =>
      graph === null
        ? EMPTY
        : visibleGraph(graph, { showExternal, showRedundant }),
    [graph, showExternal, showRedundant],
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
  // Only reruns when the drawn nodes or edges change, never on pan or zoom
  const placed = useMemo(() => placeGraph(shown), [shown]);

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

  const nodes = useMemo((): LineageNode[] => {
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
        },
        className: state(node.id),
        ariaLabel: node.name,
      };
    });
  }, [shown, placed, selected, lineage, path]);

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
    // Lit edges last, so they are drawn over dimmed ones (still under nodes)
    const ordered = [...shown.edges].sort(
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
        },
        className,
      };
    });
  }, [shown, placed, lineage, path]);

  const { fitView, setCenter, getZoom } = useReactFlow();
  const viewKey = `${focus}|${depth}|${showExternal}|${showRedundant}|${nodes.length > 0}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.04, maxZoom: 1.2, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [viewKey, fitView]);

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
        duration: 300,
      });
      setCentreOn(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [centreOn, placed, setCenter, getZoom]);

  const select = (id: string | null, to: string | null = null) =>
    go({ ...route, node: id ?? focus, to }, true);

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

  const counts = `${shown.nodes.length} nodes · ${shown.edges.length} links`;
  const unlinkedCount = shown.nodes.filter(
    (n) => !shown.edges.some((e) => e.from === n.id || e.to === n.id),
  ).length;

  return (
    <div className="graph-page">
      <header className="graph-toolbar">
        <a className="home-link" href="#/">
          RCD data models
        </a>
        <h1>Lineage graph</h1>
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
          Depth{' '}
          <select
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
        </label>
        <label className="graph-option">
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
          className="graph-option"
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
        <span className="graph-counts muted" data-testid="graph-counts">
          {counts}
        </span>
      </header>
      {graphError !== null && (
        <p className="error">Could not index the docs: {graphError}</p>
      )}
      <div className="graph-body">
        <div className="graph-canvas">
          {data === null ? (
            <p className="muted graph-message">Loading the index…</p>
          ) : focus !== null && focusNode === null ? (
            <div className="graph-message">
              <p>
                <code>{focus}</code> is not in the graph
                {!showExternal && focus.startsWith('external:')
                  ? ' while undocumented names are hidden'
                  : ''}
                .
              </p>
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
            </div>
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
              onPaneClick={() => select(null)}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              edgesFocusable={false}
              minZoom={0.05}
              maxZoom={2.5}
              fitView
              fitViewOptions={{ padding: 0.04, maxZoom: 1.2 }}
              attributionPosition="top-right"
            >
              {placed.layout.unlinkedRow !== null && (
                <ViewportPortal>
                  <div
                    className="graph-unlinked-caption"
                    style={{
                      transform: `translate(${placed.layout.unlinkedRow.x}px, ${placed.layout.unlinkedRow.y}px)`,
                    }}
                  >
                    Not linked to anything ({unlinkedCount})
                  </div>
                </ViewportPortal>
              )}
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
        <div className="graph-side">
          {selected !== null && lineage !== null && graph !== null ? (
            <GraphDetails
              graph={graph}
              shown={shown}
              node={selected}
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
            <p className="muted graph-hint">
              Click a node to trace everything upstream and downstream of it.
            </p>
          )}
          <Legend />
        </div>
      </div>
    </div>
  );
}
