import {
  ExternalLink,
  Expand,
  Minus,
  Plus,
  Scan,
  Search,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import type { GraphNode } from '../indexer/types';
import { Lightbox, type LightboxApi } from './Lightbox';
import { fold } from './filter';
import { plainText, type LabelLine } from './flowLabel';
import {
  arrivalFrom,
  flowPath,
  shapePaths,
  startScroll,
  textCentre,
  type Point,
  type Rect,
  type TextBox,
} from './flowGeometry';
import {
  FRAME_PAD,
  type Axis,
  TITLE_TOP,
  layoutFlow,
  type FlowLayout,
} from './flowLayout';
import type { EdgeEnd, FlowChart, FlowEdge } from './flowParse';
import { paintFor, type Paint, type Rgb } from './flowStyle';
import { EDGE_LABEL_PAD, TEXT, sizeChart, type TextRole } from './flowSize';
import { traceFlow, type FlowTrace } from './flowTrace';
import { arrowPath } from './graphLayout';
import { navigate } from './address';
import { docHash } from './route';
import type { Theme } from './settings';
import { useTheme } from './theme';

/** Room around the drawing inside the SVG. */
const MARGIN = 8;
/** Below this, text is too small to read; inline diagrams scroll instead. */
const READABLE = 0.72;
/** A diagram that fits at this zoom or more is fitted rather than scrolled. */
const FITS = 0.64;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

export const FONT_FAMILY =
  '"Inter Variable", "Segoe UI", system-ui, sans-serif';

const fontFor = (role: TextRole, italic: boolean, bold: boolean) =>
  `${italic ? 'italic ' : ''}${bold || role === 'title' ? 600 : 400} ${TEXT[role].size}px ${FONT_FAMILY}`;

/** Resolves a node's label to the doc it names; set by the doc page. */
export const FlowDocsContext = createContext<
  ((label: LabelLine[]) => GraphNode | null) | null
>(null);

export interface FlowModel {
  chart: FlowChart;
  layout: FlowLayout;
  nodeText: Map<string, TextBox>;
  edgeText: Map<number, TextBox>;
  titleText: Map<string, TextBox>;
}

let canvas: CanvasRenderingContext2D | null | undefined;

function measureText(
  text: string,
  style: { italic: boolean; bold: boolean; role: TextRole },
): number {
  canvas ??= document.createElement('canvas').getContext('2d');
  if (canvas === null) return text.length * TEXT[style.role].size * 0.55;
  canvas.font = fontFor(style.role, style.italic, style.bold);
  // A little slack, so text never touches the outline
  return canvas.measureText(text).width + 1;
}

// Layouts by source: they do not depend on the theme, and a live refresh
// that leaves a diagram alone finds it here
const layouts = new Map<string, FlowModel>();
const CACHE_SIZE = 48;

export function flowModel(source: string, chart: FlowChart): FlowModel {
  const known = layouts.get(source);
  if (known !== undefined) {
    layouts.delete(source);
    layouts.set(source, known);
    return known;
  }
  const sized = sizeChart(chart, measureText);
  const model: FlowModel = {
    chart,
    layout: layoutFlow(sized.input),
    nodeText: sized.nodeText,
    edgeText: sized.edgeText,
    titleText: sized.titleText,
  };
  layouts.set(source, model);
  if (layouts.size > CACHE_SIZE) {
    const oldest = layouts.keys().next().value;
    if (oldest !== undefined) layouts.delete(oldest);
  }
  return model;
}

export const hasFlowModel = (source: string) => layouts.has(source);

const FONTS = [fontFor('node', false, false), fontFor('title', false, true)];

/** Text is measured on a canvas, so wait for the bundled font first. */
export function useFlowFontsReady(): boolean {
  const [ready, setReady] = useState(() =>
    FONTS.every((font) => document.fonts.check(font)),
  );
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    // Lay out anyway if the font cannot load, rather than never
    Promise.all(FONTS.map((font) => document.fonts.load(font))).then(
      done,
      done,
    );
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

/** The theme's own node fill, for the contrast of a doc's text colour. */
const NODE_FILL: Record<Theme, Rgb> = {
  light: { r: 0xf6, g: 0xf7, b: 0xf9 },
  dark: { r: 0x26, g: 0x2a, b: 0x31 },
};

function paintStyle(paint: Paint) {
  return {
    fill: paint.fill,
    stroke: paint.stroke,
    strokeWidth: paint.strokeWidth,
    strokeDasharray: paint.dash,
  };
}

function TextLines({
  box,
  at,
  className,
  colour,
  bold,
  italic,
}: {
  box: TextBox;
  at: Point;
  className: string;
  colour?: string;
  bold?: boolean;
  italic?: boolean;
}) {
  const top = at.y - box.height / 2;
  return (
    <text
      className={className}
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fill: colour,
        fontWeight: bold ? 600 : undefined,
        fontStyle: italic ? 'italic' : undefined,
      }}
    >
      {box.lines.map((line, i) => (
        <tspan key={i} x={at.x} y={top + (i + 0.5) * box.lineHeight}>
          {line.map((run, j) => (
            <tspan
              key={j}
              fontStyle={run.italic ? 'italic' : undefined}
              fontWeight={run.bold ? 600 : undefined}
            >
              {run.text}
            </tspan>
          ))}
        </tspan>
      ))}
    </text>
  );
}

/** A marker at an edge's end: arrow, cross or circle, along its last leg. */
function EdgeEndMark({
  points,
  axis,
  end,
  className,
  style,
}: {
  points: Point[];
  axis: Axis;
  end: EdgeEnd;
  className: string;
  style?: { fill?: string; stroke?: string };
}) {
  const tip = points[points.length - 1];
  const before = arrivalFrom(points, axis);
  if (tip === undefined || before === null || end === 'none') return null;
  if (end === 'arrow') {
    return (
      <path
        className={className}
        d={arrowPath([before, tip], 9)}
        style={style}
      />
    );
  }
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
  const c = { x: tip.x - 5 * Math.cos(angle), y: tip.y - 5 * Math.sin(angle) };
  if (end === 'circle') {
    return (
      <circle
        className={`${className} circle`}
        cx={c.x}
        cy={c.y}
        r={4.5}
        style={style}
      />
    );
  }
  const d = 4.5;
  return (
    <path
      className={`${className} cross`}
      d={`M${c.x - d},${c.y - d} L${c.x + d},${c.y + d} M${c.x - d},${c.y + d} L${c.x + d},${c.y - d}`}
      style={style && { stroke: style.fill }}
    />
  );
}

/** Stops the line short of an end mark so its end does not poke out. */
function shortened(points: Point[], by: number, axis: Axis): Point[] {
  const tip = points[points.length - 1];
  const before = arrivalFrom(points, axis);
  if (tip === undefined || before === null) return points;
  const length = Math.hypot(tip.x - before.x, tip.y - before.y);
  if (length === 0) return points;
  return [
    ...points.slice(0, -1),
    {
      x: tip.x - ((tip.x - before.x) / length) * by,
      y: tip.y - ((tip.y - before.y) / length) * by,
    },
  ];
}

function reversed(points: Point[]): Point[] {
  return [...points].reverse();
}

interface PictureProps {
  model: FlowModel;
  theme: Theme;
  /** Pixels per layout unit; the lightbox scales the picture itself. */
  scale: number;
  trace: FlowTrace | null;
  docs: Map<string, GraphNode>;
  onSelect: (id: string | null) => void;
  onOpen: (node: GraphNode) => void;
}

/** The flowchart as SVG, drawn with React elements only. */
export function FlowPicture({
  model,
  theme,
  scale,
  trace,
  docs,
  onSelect,
  onOpen,
}: PictureProps) {
  const { chart, layout } = model;
  const paints = useMemo(() => {
    const nodes = new Map(
      chart.nodes.map((n) => [
        n.id,
        paintFor(n.style, theme, NODE_FILL[theme]),
      ]),
    );
    const frames = new Map(
      chart.subgraphs.map((s) => [
        s.id,
        paintFor(s.style, theme, NODE_FILL[theme]),
      ]),
    );
    const edges = chart.edges.map((e) =>
      paintFor(e.style, theme, NODE_FILL[theme]),
    );
    return { nodes, frames, edges };
  }, [chart, theme]);

  const width = layout.width + 2 * MARGIN;
  const height = layout.height + 2 * MARGIN;
  const lit = (id: string) =>
    trace === null ||
    id === trace.root ||
    trace.upstream.has(id) ||
    trace.downstream.has(id);
  const edgeState = (index: number) =>
    trace === null
      ? ''
      : trace.upstreamEdges.has(index)
        ? ' is-lit is-up'
        : trace.downstreamEdges.has(index)
          ? ' is-lit is-down'
          : '';

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const node = (event.target as Element).closest('[data-node]');
    onSelect(node?.getAttribute('data-node') ?? null);
  };
  const onDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    const id = (event.target as Element)
      .closest('[data-node]')
      ?.getAttribute('data-node');
    const doc = id == null ? undefined : docs.get(id);
    if (doc !== undefined) onOpen(doc);
  };

  const edgeById = new Map(chart.edges.map((e) => [e.index, e]));
  return (
    <svg
      className={`flow-svg${trace === null ? '' : ' is-tracing'}`}
      width={Math.round(width * scale)}
      height={Math.round(height * scale)}
      viewBox={`${-MARGIN} ${-MARGIN} ${width} ${height}`}
      role="img"
      aria-label={`Flowchart with ${chart.nodes.length} nodes and ${chart.edges.length} links`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {chart.subgraphs.map((sg) => {
        const frame = layout.frames.get(sg.id);
        const title = model.titleText.get(sg.id);
        if (frame === undefined || title === undefined) return null;
        const paint = paints.frames.get(sg.id) ?? {};
        return (
          <g key={sg.id} className="flow-frame">
            <rect
              className="flow-frame-box"
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
              rx={6}
              style={paintStyle(paint)}
            />
            <TextLines
              box={title}
              at={{
                x: frame.x + FRAME_PAD + title.width / 2,
                y: frame.y + TITLE_TOP + title.height / 2,
              }}
              className="flow-frame-title"
              colour={paint.text}
            />
          </g>
        );
      })}
      {layout.edges.map((route) => {
        const edge = edgeById.get(route.index) as FlowEdge;
        const paint = paints.edges[route.index] ?? {};
        let points = route.points;
        if (edge.end !== 'none')
          points = shortened(points, edge.end === 'arrow' ? 6 : 8, route.axis);
        if (edge.start !== 'none') {
          points = reversed(
            shortened(
              reversed(points),
              edge.start === 'arrow' ? 6 : 8,
              route.axis,
            ),
          );
        }
        const head =
          paint.stroke === undefined ? undefined : { fill: paint.stroke };
        return (
          <g
            key={route.index}
            className={`flow-edge-group${edgeState(route.index)}`}
          >
            <path
              className={`flow-edge ${edge.stroke}`}
              d={flowPath(points, route.axis)}
              style={paintStyle(paint)}
            />
            <EdgeEndMark
              points={route.points}
              axis={route.axis}
              end={edge.end}
              className="flow-head"
              style={head}
            />
            <EdgeEndMark
              points={reversed(route.points)}
              axis={route.axis}
              end={edge.start}
              className="flow-head"
              style={head}
            />
          </g>
        );
      })}
      {layout.edges.map((route) => {
        const box = model.edgeText.get(route.index);
        if (route.label === null || box === undefined) return null;
        const paint = paints.edges[route.index] ?? {};
        const r = route.label;
        return (
          <g
            key={route.index}
            className={`flow-label${edgeState(route.index)}`}
          >
            <rect
              className="flow-label-box"
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              rx={3}
            />
            <TextLines
              box={box}
              at={{
                x: r.x + EDGE_LABEL_PAD.x + box.width / 2,
                y: r.y + r.height / 2,
              }}
              className="flow-label-text"
              colour={paint.text}
            />
          </g>
        );
      })}
      {chart.nodes.map((node) => {
        const rect = layout.nodes.get(node.id);
        const box = model.nodeText.get(node.id);
        if (rect === undefined || box === undefined) return null;
        const paint = paints.nodes.get(node.id) ?? {};
        const doc = docs.get(node.id);
        const selected = trace?.root === node.id;
        const state = [
          lit(node.id) && trace !== null ? 'is-lit' : '',
          selected ? 'is-selected' : '',
          doc ? 'has-doc' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={node.id}
            className={`flow-node shape-${node.shape} ${state}`}
            data-node={node.id}
          >
            <title>
              {doc
                ? `${plainText(node.label)}\nDouble-click to open ${doc.file}`
                : plainText(node.label)}
            </title>
            {selected && (
              <rect
                className="flow-ring"
                x={rect.x - 4}
                y={rect.y - 4}
                width={rect.width + 8}
                height={rect.height + 8}
                rx={8}
              />
            )}
            {shapePaths(node.shape, rect).map((d, i) => (
              <path
                key={i}
                className={i === 0 ? 'flow-shape' : 'flow-shape-line'}
                d={d}
                style={i === 0 ? paintStyle(paint) : { stroke: paint.stroke }}
              />
            ))}
            <TextLines
              box={box}
              at={textCentre(node.shape, rect)}
              className="flow-node-text"
              colour={paint.text}
              bold={paint.bold}
              italic={paint.italic}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Size of the whole picture at scale 1. */
export const pictureSize = (model: FlowModel) => ({
  width: model.layout.width + 2 * MARGIN,
  height: model.layout.height + 2 * MARGIN,
});

/** A node's box in picture coordinates, for centring on it. */
export const pictureRect = (model: FlowModel, id: string): Rect | null => {
  const rect = model.layout.nodes.get(id);
  return rect === undefined
    ? null
    : { ...rect, x: rect.x + MARGIN, y: rect.y + MARGIN };
};

/** Nodes whose label contains the query, labels that start with it first. */
export function findFlowNodes(model: FlowModel, query: string, limit = 8) {
  const wanted = fold(query.trim());
  if (wanted === '') return [];
  return model.chart.nodes
    .map((node) => ({
      node,
      text: fold(plainText(node.label).replace(/\n/g, ' ')),
    }))
    .filter(
      ({ text, node }) =>
        text.includes(wanted) || fold(node.id).includes(wanted),
    )
    .sort(
      (a, b) =>
        Number(!a.text.startsWith(wanted)) - Number(!b.text.startsWith(wanted)),
    )
    .slice(0, limit)
    .map(({ node }) => node);
}

function FindBox({
  model,
  onPick,
}: {
  model: FlowModel;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => findFlowNodes(model, query), [model, query]);
  const pick = (id: string | undefined) => {
    if (id === undefined) return;
    onPick(id);
  };
  return (
    <div className="flow-find">
      <Search size={13} aria-hidden="true" className="flow-find-icon" />
      <input
        className="input"
        type="search"
        placeholder="Find a node"
        aria-label="Find a node by its label"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(results[active]?.id);
          } else if (event.key === 'Escape' && query !== '') {
            // Clear first; a second Esc closes the view
            event.preventDefault();
            event.stopPropagation();
            setQuery('');
          }
        }}
      />
      {results.length > 0 && (
        <ul className="flow-find-results" role="listbox">
          {results.map((node, index) => (
            <li
              key={node.id}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(node.id);
              }}
            >
              {plainText(node.label.slice(0, 1))}
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== '' && results.length === 0 && (
        <span className="flow-find-none">No match</span>
      )}
    </div>
  );
}

/** "Selected: …", with Open doc when the node names a doc. */
function SelectionBar({
  model,
  selected,
  docs,
  onClear,
}: {
  model: FlowModel;
  selected: string | null;
  docs: Map<string, GraphNode>;
  onClear: () => void;
}) {
  const node = model.chart.nodes.find((n) => n.id === selected);
  if (node === undefined) return null;
  const doc = docs.get(node.id);
  return (
    <div className="flow-selection" aria-live="polite">
      <span className="flow-selection-name" title={plainText(node.label)}>
        {plainText(node.label.slice(0, 1))}
      </span>
      {doc && (
        <a
          className="btn btn-ghost btn-sm"
          href={docHash(doc.file ?? '')}
          title={`Open ${doc.file}`}
        >
          <ExternalLink size={13} aria-hidden="true" />
          Open doc
        </a>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        onClick={onClear}
        aria-label="Clear the selection"
        title="Clear the selection"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Tells a click from the end of a drag. */
function useDrag(onMove: (dx: number, dy: number) => void) {
  const start = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);
  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      start.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        moved: false,
      };
      moved.current = false;
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (s === null || s.id !== event.pointerId) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < 4) return;
      if (!s.moved) {
        s.moved = true;
        moved.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      start.current = { ...s, x: event.clientX, y: event.clientY };
      onMove(dx, dy);
    },
    onPointerUp: () => {
      start.current = null;
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    // The click at the end of a drag is not a click on the diagram
    if (moved.current) {
      event.stopPropagation();
      moved.current = false;
    }
  };
  return { ...handlers, onClickCapture };
}

interface FlowViewProps {
  source: string;
  model: FlowModel;
  toolbarStart: ReactNode;
}

/** The diagram in the doc: a frame that scrolls sideways, and its toolbar. */
export function FlowView({ source, model, toolbarStart }: FlowViewProps) {
  const { theme } = useTheme();
  const linkDoc = useContext(FlowDocsContext);
  const docs = useMemo(() => {
    const map = new Map<string, GraphNode>();
    if (linkDoc === null) return map;
    for (const node of model.chart.nodes) {
      const doc = linkDoc(node.label);
      if (doc !== null) map.set(node.id, doc);
    }
    return map;
  }, [linkDoc, model]);
  const [selected, setSelected] = useState<string | null>(null);
  const shownSelection = model.chart.nodes.some((n) => n.id === selected)
    ? selected
    : null;
  const trace = useMemo(
    () =>
      shownSelection === null ? null : traceFlow(model.chart, shownSelection),
    [model, shownSelection],
  );
  const [zoom, setZoom] = useState<number | null>(null);
  const [auto, setAuto] = useState(1);
  const [room, setRoom] = useState(0);
  const scale = zoom ?? auto;
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const size = pictureSize(model);

  const available = useCallback(() => {
    const box = scrollRef.current;
    if (box === null) return 0;
    const style = getComputedStyle(box);
    return (
      box.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  }, []);

  // Fit the width when that keeps text readable; otherwise a readable
  // zoom, scrolling sideways. Again when the frame first gets a width
  // (inside a <details> that was closed) or changes width.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (box === null) return;
    const update = () => {
      const width = available();
      setRoom(width);
      if (width <= 0) return;
      const fit = width / size.width;
      setAuto(fit >= 1 ? 1 : fit >= FITS ? fit : READABLE);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [available, size.width]);

  // Open on where the flow begins, once, when the frame first has a width
  const placed = useRef(false);
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (box === null || placed.current || room <= 0 || zoom !== null) return;
    placed.current = true;
    const direction = model.chart.direction;
    box.scrollLeft = startScroll(
      [...model.layout.nodes.values()].map((rect) => ({
        ...rect,
        x: rect.x + MARGIN,
        y: rect.y + MARGIN,
      })),
      size,
      auto,
      room,
      direction === 'LR' || direction === 'RL' ? 'x' : 'y',
    );
  }, [auto, model, room, size, zoom]);

  const zoomTo = useCallback(
    (next: number, at?: { x: number }) => {
      const box = scrollRef.current;
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      if (box === null) {
        setZoom(clamped);
        return;
      }
      // Keep the point under the pointer (or the middle) where it is
      const x = at?.x ?? box.clientWidth / 2;
      const contentX = (box.scrollLeft + x) / scale;
      setZoom(clamped);
      requestAnimationFrame(() => {
        box.scrollLeft = contentX * clamped - x;
      });
    },
    [scale],
  );

  // Only Ctrl/⌘ + wheel zooms; a plain wheel scrolls the page as usual
  useEffect(() => {
    const box = scrollRef.current;
    if (box === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomTo(
        scale * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
        {
          x: event.clientX - rect.left,
        },
      );
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [scale, zoomTo]);

  const drag = useDrag((dx) => {
    const box = scrollRef.current;
    if (box !== null) box.scrollLeft -= dx;
  });
  const overflows = size.width * scale > room + 1;
  const fitWidth = () => {
    const room = available();
    if (room > 0) setZoom(Math.min(1, room / size.width));
  };
  const openDoc = (node: GraphNode) => {
    if (node.file !== null) navigate(docHash(node.file));
  };
  const close = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  const picture = (pictureScale: number) => (
    <FlowPicture
      model={model}
      theme={theme}
      scale={pictureScale}
      trace={trace}
      docs={docs}
      onSelect={setSelected}
      onOpen={openDoc}
    />
  );

  return (
    <figure
      className="mermaid flow-figure"
      data-source-lines={source.split('\n').length}
    >
      <div className="mermaid-toolbar">
        {toolbarStart}
        <SelectionBar
          model={model}
          selected={shownSelection}
          docs={docs}
          onClear={() => setSelected(null)}
        />
        <div className="diagram-tools">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => zoomTo(scale * 0.8)}
            aria-label="Zoom out"
            title="Zoom out (or Ctrl + wheel)"
          >
            <Minus size={13} aria-hidden="true" />
          </button>
          <span className="diagram-zoom tabular" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => zoomTo(scale * 1.25)}
            aria-label="Zoom in"
            title="Zoom in (or Ctrl + wheel)"
          >
            <Plus size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={fitWidth}
            title="Shrink to the column width"
          >
            <Scan size={13} aria-hidden="true" />
            Fit width
          </button>
          <button
            ref={openerRef}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(true)}
            title="Open larger, with pan, zoom and find"
          >
            <Expand size={13} aria-hidden="true" />
            Open larger
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={`flow-scroll${overflows ? ' can-pan' : ''}`}
        {...drag}
      >
        {picture(scale)}
      </div>
      {open && (
        <Lightbox
          label="Flowchart"
          size={() => size}
          onClose={close}
          tools={(api: LightboxApi) => (
            <>
              <FindBox
                model={model}
                onPick={(id) => {
                  setSelected(id);
                  const rect = pictureRect(model, id);
                  if (rect !== null) api.centreOn(rect);
                }}
              />
              <SelectionBar
                model={model}
                selected={shownSelection}
                docs={docs}
                onClear={() => setSelected(null)}
              />
            </>
          )}
        >
          {picture(1)}
        </Lightbox>
      )}
    </figure>
  );
}
