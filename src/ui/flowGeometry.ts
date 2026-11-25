/**
 * Shapes and text for the flowchart renderer: label lines wrapped to a
 * width, node sizes from their text, outlines as SVG paths, and where an
 * edge meets an outline. Pure, with text measured by a function passed in.
 */

import type { LabelLine, Run } from './flowLabel';
import type { Shape } from './flowParse';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export type Measure = (text: string, style: Omit<Run, 'text'>) => number;

export interface TextBox extends Size {
  lines: LabelLine[];
  lineHeight: number;
}

/**
 * Lines of a label as drawn: `<br>` breaks are kept, and a line wider than
 * `maxWidth` wraps at spaces (a single word wider than that stays whole).
 */
export function wrapText(
  label: LabelLine[],
  measure: Measure,
  maxWidth: number,
  lineHeight: number,
): TextBox {
  const lines: LabelLine[] = [];
  const width = (line: LabelLine) =>
    line.reduce((sum, run) => sum + measure(run.text, run), 0);
  for (const line of label) {
    // Words keep their style; a space belongs to the word before it
    const words: Run[] = [];
    for (const run of line) {
      for (const piece of run.text.match(/[^ ]+ *| +/g) ?? []) {
        words.push({ ...run, text: piece });
      }
    }
    let current: LabelLine = [];
    for (const word of words) {
      const candidate = [...current, word];
      if (
        current.length > 0 &&
        width(trimEnd(candidate)) > maxWidth &&
        word.text.trim() !== ''
      ) {
        lines.push(merge(trimEnd(current)));
        current = [word];
      } else {
        current = candidate;
      }
    }
    lines.push(merge(trimEnd(current)));
  }
  const widest = Math.max(0, ...lines.map(width));
  return {
    lines,
    lineHeight,
    width: Math.ceil(widest),
    height: lines.length * lineHeight,
  };
}

function trimEnd(line: LabelLine): LabelLine {
  const out = line.map((run) => ({ ...run }));
  while (out.length > 0) {
    const last = out[out.length - 1] as Run;
    last.text = last.text.replace(/ +$/, '');
    if (last.text !== '') break;
    out.pop();
  }
  return out;
}

function merge(line: LabelLine): LabelLine {
  const out: LabelLine = [];
  for (const run of line) {
    const last = out[out.length - 1];
    if (last && last.italic === run.italic && last.bold === run.bold) {
      last.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

const PAD_X = 14;
const PAD_Y = 8;

/** Height of the caps of a cylinder of this width. */
export const cylinderCap = (width: number) =>
  Math.min(10, Math.max(5, width * 0.05));

/** The node's size for a text block of `text`. */
export function shapeSize(shape: Shape, text: Size): Size {
  const tw = text.width;
  const th = text.height;
  const h = th + 2 * PAD_Y;
  switch (shape) {
    case 'rect':
    case 'round':
      return { width: tw + 2 * PAD_X, height: h };
    case 'stadium':
      return { width: tw + h, height: h };
    case 'subroutine':
      return { width: tw + 2 * PAD_X + 16, height: h };
    case 'cylinder': {
      const width = tw + 2 * PAD_X;
      return { width, height: h + 3 * cylinderCap(width) };
    }
    case 'circle':
    case 'doublecircle': {
      const d =
        Math.hypot(tw, th) + 2 * PAD_Y + (shape === 'doublecircle' ? 10 : 0);
      return { width: d, height: d };
    }
    case 'diamond':
      // Half diagonals that leave the text's corners well inside
      return {
        width: 2 * (tw / 2 + th + PAD_X),
        height: 2 * (th / 2 + tw / 4 + PAD_Y),
      };
    case 'hexagon':
      return { width: tw + 2 * PAD_X + h / 2, height: h };
    case 'lean_right':
    case 'lean_left':
      return { width: tw + 2 * PAD_X + h * 0.5, height: h };
    case 'trapezoid':
    case 'inv_trapezoid':
      return { width: tw + 2 * PAD_X + h, height: h };
    case 'odd':
      return { width: tw + 2 * PAD_X + h / 4, height: h };
  }
}

/** Where the centre of the text block goes in a node at `rect`. */
export function textCentre(shape: Shape, rect: Rect): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  if (shape === 'cylinder') {
    const ry = cylinderCap(rect.width);
    return { x: cx, y: rect.y + (rect.height + ry) / 2 };
  }
  if (shape === 'odd') return { x: cx + rect.height / 8, y: cy };
  return { x: cx, y: cy };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Point) => `${r1(p.x)},${r1(p.y)}`;

/** Corners of the polygon shapes, clockwise from the top left. */
function polygon(shape: Shape, rect: Rect): Point[] | null {
  const { x, y, width: w, height: h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (shape) {
    case 'diamond':
      return [
        { x: cx, y },
        { x: x + w, y: cy },
        { x: cx, y: y + h },
        { x, y: cy },
      ];
    case 'hexagon': {
      const m = h / 4;
      return [
        { x: x + m, y },
        { x: x + w - m, y },
        { x: x + w, y: cy },
        { x: x + w - m, y: y + h },
        { x: x + m, y: y + h },
        { x, y: cy },
      ];
    }
    case 'lean_right': {
      const m = h * 0.5;
      return [
        { x: x + m, y },
        { x: x + w, y },
        { x: x + w - m, y: y + h },
        { x, y: y + h },
      ];
    }
    case 'lean_left': {
      const m = h * 0.5;
      return [
        { x, y },
        { x: x + w - m, y },
        { x: x + w, y: y + h },
        { x: x + m, y: y + h },
      ];
    }
    case 'trapezoid': {
      const m = h * 0.5;
      return [
        { x: x + m, y },
        { x: x + w - m, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    }
    case 'inv_trapezoid': {
      const m = h * 0.5;
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w - m, y: y + h },
        { x: x + m, y: y + h },
      ];
    }
    case 'odd': {
      const m = h / 4;
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x: x + m, y: cy },
      ];
    }
    default:
      return null;
  }
}

/** The outline paths of a node: the shape, then any inner lines. */
export function shapePaths(shape: Shape, rect: Rect): string[] {
  const { x, y, width: w, height: h } = rect;
  const corners = polygon(shape, rect);
  if (corners !== null) {
    return [`M${corners.map(pt).join(' L')} Z`];
  }
  const rounded = (r: number) =>
    `M${pt({ x: x + r, y })} H${r1(x + w - r)} A${r1(r)},${r1(r)} 0 0 1 ${pt({ x: x + w, y: y + r })}` +
    ` V${r1(y + h - r)} A${r1(r)},${r1(r)} 0 0 1 ${pt({ x: x + w - r, y: y + h })}` +
    ` H${r1(x + r)} A${r1(r)},${r1(r)} 0 0 1 ${pt({ x, y: y + h - r })}` +
    ` V${r1(y + r)} A${r1(r)},${r1(r)} 0 0 1 ${pt({ x: x + r, y })} Z`;
  switch (shape) {
    case 'rect':
      return [rounded(2)];
    case 'round':
      return [rounded(Math.min(10, h / 2))];
    case 'stadium':
      return [rounded(h / 2)];
    case 'subroutine':
      return [
        rounded(1),
        `M${pt({ x: x + 8, y })} V${r1(y + h)} M${pt({ x: x + w - 8, y })} V${r1(y + h)}`,
      ];
    case 'cylinder': {
      const rx = w / 2;
      const ry = cylinderCap(w);
      const top = y + ry;
      const bottom = y + h - ry;
      return [
        `M${pt({ x, y: top })} A${r1(rx)},${r1(ry)} 0 0 1 ${pt({ x: x + w, y: top })}` +
          ` V${r1(bottom)} A${r1(rx)},${r1(ry)} 0 0 1 ${pt({ x, y: bottom })} Z`,
        `M${pt({ x, y: top })} A${r1(rx)},${r1(ry)} 0 0 0 ${pt({ x: x + w, y: top })}`,
      ];
    }
    case 'circle':
    case 'doublecircle': {
      const r = w / 2;
      const c = { x: x + r, y: y + r };
      const circle = (radius: number) =>
        `M${pt({ x: c.x - radius, y: c.y })} A${r1(radius)},${r1(radius)} 0 1 1 ${pt({ x: c.x + radius, y: c.y })}` +
        ` A${r1(radius)},${r1(radius)} 0 1 1 ${pt({ x: c.x - radius, y: c.y })} Z`;
      return shape === 'circle' ? [circle(r)] : [circle(r), circle(r - 5)];
    }
    default:
      return [rounded(2)];
  }
}

/** Where the segment from `a` to `b` crosses the segment `c`–`d`, as t on a–b. */
function crossing(a: Point, b: Point, c: Point, d: Point): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Where a rectangle's border meets the line from its centre to `toward`. */
export function rectBorder(rect: Rect, toward: Point): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: rect.y + rect.height };
  const sx = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * Where the outline of a node meets the line from its centre towards
 * `toward`, so edges end on the shape, not on its bounding box.
 */
export function shapeBorder(shape: Shape, rect: Rect, toward: Point): Point {
  const c = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  if (shape === 'circle' || shape === 'doublecircle') {
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return { x: c.x, y: rect.y + rect.height };
    const r = rect.width / 2;
    return { x: c.x + (dx / length) * r, y: c.y + (dy / length) * r };
  }
  const corners = polygon(shape, rect);
  if (corners === null) return rectBorder(rect, toward);
  // Far enough out that the ray from the centre always leaves the shape
  const scale =
    (rect.width + rect.height) /
    Math.max(1, Math.hypot(toward.x - c.x, toward.y - c.y));
  const far = {
    x: c.x + (toward.x - c.x) * Math.max(1, scale),
    y: c.y + (toward.y - c.y) * Math.max(1, scale),
  };
  let best: number | null = null;
  for (let i = 0; i < corners.length; i++) {
    const t = crossing(
      c,
      far,
      corners[i] as Point,
      corners[(i + 1) % corners.length] as Point,
    );
    if (t !== null && (best === null || t < best)) best = t;
  }
  if (best === null) return rectBorder(rect, toward);
  return { x: c.x + (far.x - c.x) * best, y: c.y + (far.y - c.y) * best };
}

export const inside = (rect: Rect, p: Point, slack = 0) =>
  p.x >= rect.x - slack &&
  p.x <= rect.x + rect.width + slack &&
  p.y >= rect.y - slack &&
  p.y <= rect.y + rect.height + slack;

/** Where the segment from `a` (inside) to `b` (outside) leaves `rect`. */
export function leaveRect(rect: Rect, a: Point, b: Point): Point {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  let best: number | null = null;
  for (let i = 0; i < 4; i++) {
    const t = crossing(
      a,
      b,
      corners[i] as Point,
      corners[(i + 1) % 4] as Point,
    );
    if (t !== null && (best === null || t > best)) best = t;
  }
  const t = best ?? 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * An SVG path through an edge's points as S-curves that leave and reach
 * each point along `axis`, the way the flow runs.
 */
export function flowPath(points: Point[], axis: 'x' | 'y'): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  let d = `M${pt(first)}`;
  let from = first;
  for (const to of rest) {
    const gap = to[axis] - from[axis];
    if (Math.abs(gap) < 1) {
      d += ` L${pt(to)}`;
    } else {
      const c1 = { ...from };
      const c2 = { ...to };
      c1[axis] += gap / 2;
      c2[axis] -= gap / 2;
      d += ` C${pt(c1)} ${pt(c2)} ${pt(to)}`;
    }
    from = to;
  }
  return d;
}

/** The direction an edge drawn by `flowPath` arrives at its last point. */
export function arrivalFrom(points: Point[], axis: 'x' | 'y'): Point | null {
  const tip = points[points.length - 1];
  const before = points[points.length - 2];
  if (tip === undefined || before === undefined) return null;
  const gap = tip[axis] - before[axis];
  if (Math.abs(gap) < 1) return before;
  const back = { ...tip };
  back[axis] -= Math.sign(gap) * 10;
  return back;
}

/**
 * Where a frame narrower than the picture should start scrolled, so the
 * first thing shown is where the flow begins and not an empty corner: the
 * frame is centred on the nodes in the picture's first band, top for a
 * vertical flow and left for a horizontal one.
 */
export function startScroll(
  rects: Iterable<Rect>,
  picture: Size,
  scale: number,
  room: number,
  axis: 'x' | 'y',
): number {
  const most = Math.max(0, picture.width * scale - room);
  if (most === 0) return 0;
  const all = [...rects];
  if (all.length === 0) return 0;
  const along = (rect: Rect) => (axis === 'y' ? rect.y : rect.x);
  const first = Math.min(...all.map(along));
  const band = (axis === 'y' ? picture.height : picture.width) * 0.1;
  const start = all.filter((rect) => along(rect) <= first + band);
  const left = Math.min(...start.map((rect) => rect.x));
  const right = Math.max(...start.map((rect) => rect.x + rect.width));
  // A horizontal flow starts at its left edge; keep that edge in view
  const target =
    axis === 'x' ? left * scale - 16 : ((left + right) / 2) * scale - room / 2;
  return Math.round(Math.min(most, Math.max(0, target)));
}
