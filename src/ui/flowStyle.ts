/**
 * Styles from `classDef`, `style` and `linkStyle`: parsing, the subset the
 * viewer draws, and how a doc's colours (picked for a light page) are shown
 * in each theme.
 */

import type { Theme } from './settings';

export interface StyleDecl {
  property: string;
  value: string;
}

/**
 * `fill:#fff,stroke:#333,stroke-dasharray:4 3` as declarations, or null when
 * a piece is not `property:value`. Commas always separate, as in Mermaid.
 */
export function parseStyles(text: string): StyleDecl[] | null {
  const decls: StyleDecl[] = [];
  for (const piece of text.split(',')) {
    const match = /^\s*([a-zA-Z-]+)\s*:\s*(.*?)\s*$/.exec(piece);
    if (match === null || match[2] === '') return null;
    decls.push({
      property: (match[1] as string).toLowerCase(),
      value: match[2] as string,
    });
  }
  return decls;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
  silver: '#c0c0c0',
  pink: '#ffc0cb',
  brown: '#a52a2a',
};

/** Hex, `rgb()` or a basic colour name; null for anything else. */
export function parseColour(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const named = NAMED[text];
  if (named !== undefined) return parseColour(named);
  let hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)?.[1];
  if (hex !== undefined) {
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(
    text,
  );
  if (rgb !== null) {
    const [r, g, b] = rgb.slice(1).map(Number) as [number, number, number];
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }
  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const gamma = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** WCAG relative luminance. */
export function luminance(colour: Rgb): number {
  return (
    0.2126 * linear(colour.r) +
    0.7152 * linear(colour.g) +
    0.0722 * linear(colour.b)
  );
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

interface Lch {
  l: number;
  c: number;
  h: number;
}

// OKLab, so lightness can be turned around without shifting hue
function toLch({ r, g, b }: Rgb): Lch {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function fromLchRaw({ l: L, c, h }: Lch): [number, number, number] {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Back to sRGB, lowering chroma until the colour fits. */
function fromLch(lch: Lch): Rgb {
  let c = lch.c;
  for (let step = 0; step < 24; step++) {
    const rgb = fromLchRaw({ ...lch, c });
    if (rgb.every((v) => v >= -0.0001 && v <= 1.0001)) {
      const [r, g, b] = rgb.map(gamma) as [number, number, number];
      return { r, g, b };
    }
    c *= 0.85;
  }
  const [r, g, b] = fromLchRaw({ ...lch, c: 0 }).map((v) =>
    gamma(Math.min(1, Math.max(0, v))),
  ) as [number, number, number];
  return { r, g, b };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export type ColourRole = 'fill' | 'stroke' | 'text';

/** The page behind diagrams: `--color-surface` in each theme. */
export const SURFACE: Record<Theme, Rgb> = {
  light: { r: 0xff, g: 0xff, b: 0xff },
  dark: { r: 0x20, g: 0x23, b: 0x29 },
};

/**
 * A doc colour as drawn in `theme`. Light keeps it. Dark turns its
 * lightness around (OKLab, same hue): pale fills become dark tints, dark
 * text becomes light, strokes become light enough to see on the dark page;
 * fills lose some chroma so they do not glow.
 */
export function themeColour(colour: Rgb, role: ColourRole, theme: Theme): Rgb {
  if (theme === 'light') return colour;
  const lch = toLch(colour);
  const flipped = 1 - lch.l;
  switch (role) {
    case 'fill':
      return fromLch({
        l: clamp(flipped + 0.2, 0.24, 0.42),
        c: Math.min(lch.c, 0.06),
        h: lch.h,
      });
    case 'stroke':
      return fromLch({
        l: clamp(flipped + 0.25, 0.62, 0.86),
        c: lch.c,
        h: lch.h,
      });
    case 'text':
      return fromLch({
        l: clamp(flipped + 0.15, 0.86, 0.97),
        c: lch.c,
        h: lch.h,
      });
  }
}

/**
 * `colour` with its lightness pushed away from `against` until the
 * contrast is at least `ratio` (or as far as it goes).
 */
export function withContrast(colour: Rgb, against: Rgb, ratio: number): Rgb {
  if (contrast(colour, against) >= ratio) return colour;
  const lch = toLch(colour);
  const darker = luminance(against) > 0.18;
  let best = colour;
  for (let step = 1; step <= 50; step++) {
    const l = clamp(lch.l + (darker ? -step : step) * 0.02, 0, 1);
    best = fromLch({ ...lch, l });
    if (contrast(best, against) >= ratio) return best;
  }
  return best;
}

/** What a node, frame or edge is drawn with; unset means the theme's own. */
export interface Paint {
  fill?: string;
  stroke?: string;
  text?: string;
  strokeWidth?: number;
  dash?: string;
  bold?: boolean;
  italic?: boolean;
}

/** Text needs 4.5:1 on its fill; lines and fills 3:1 on the page. */
const TEXT_CONTRAST = 4.5;
const LINE_CONTRAST = 3;

/**
 * Declarations already checked by `styleIssues` to paint, for one theme.
 * Text keeps 4.5:1 on its fill (or on the theme's node colour), and
 * strokes 3:1 on the page, adjusting the doc's colour only when needed.
 */
export function paintFor(
  decls: readonly StyleDecl[],
  theme: Theme,
  defaultFill: Rgb,
): Paint {
  const paint: Paint = {};
  let fill: Rgb | null = null;
  let stroke: Rgb | null = null;
  let text: Rgb | null = null;
  let transparent = false;
  for (const { property, value } of decls) {
    switch (property) {
      case 'fill':
        if (value.trim().toLowerCase() === 'none') {
          transparent = true;
          fill = null;
        } else {
          transparent = false;
          fill = parseColour(value);
        }
        break;
      case 'stroke':
        stroke = parseColour(value);
        break;
      case 'color':
        text = parseColour(value);
        break;
      case 'stroke-width':
        paint.strokeWidth = parseFloat(value);
        break;
      case 'stroke-dasharray':
        paint.dash = value.trim();
        break;
      case 'font-weight':
        paint.bold = /^(bold|bolder|[6-9]00)$/.test(value.trim());
        break;
      case 'font-style':
        paint.italic = value.trim() === 'italic';
        break;
    }
  }
  const page = SURFACE[theme];
  const shownFill = fill === null ? null : themeColour(fill, 'fill', theme);
  if (transparent) paint.fill = 'none';
  if (shownFill !== null) paint.fill = toHex(shownFill);
  if (stroke !== null) {
    paint.stroke = toHex(
      withContrast(themeColour(stroke, 'stroke', theme), page, LINE_CONTRAST),
    );
  }
  if (text !== null) {
    const behind = shownFill ?? (transparent ? page : defaultFill);
    paint.text = toHex(
      withContrast(themeColour(text, 'text', theme), behind, TEXT_CONTRAST),
    );
  }
  return paint;
}

const NODE_PROPERTIES = new Set([
  'fill',
  'stroke',
  'color',
  'stroke-width',
  'stroke-dasharray',
  'font-weight',
  'font-style',
]);
const EDGE_PROPERTIES = new Set([
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'color',
  'fill',
]);

/**
 * Why the viewer could not draw these declarations as written: properties
 * it does not draw, or values it cannot read. Empty when it can.
 */
export function styleIssues(
  decls: readonly StyleDecl[],
  target: 'node' | 'edge',
): string[] {
  const allowed = target === 'node' ? NODE_PROPERTIES : EDGE_PROPERTIES;
  const issues: string[] = [];
  for (const { property, value } of decls) {
    const v = value.trim();
    if (!allowed.has(property)) {
      issues.push(`style property ${property}`);
    } else if (property === 'fill' || property === 'stroke') {
      if (v.toLowerCase() !== 'none' && parseColour(v) === null) {
        issues.push(`colour ${v}`);
      } else if (target === 'edge' && property === 'fill' && v !== 'none') {
        issues.push('edge fill');
      }
    } else if (property === 'color') {
      if (parseColour(v) === null) issues.push(`colour ${v}`);
    } else if (property === 'stroke-width') {
      if (!/^\d+(\.\d+)?(px)?$/.test(v)) issues.push(`stroke-width ${v}`);
    } else if (property === 'stroke-dasharray') {
      if (!/^\d+(\.\d+)?(px)?([ ,]+\d+(\.\d+)?(px)?)*$/.test(v)) {
        issues.push(`stroke-dasharray ${v}`);
      }
    } else if (property === 'font-weight') {
      if (!/^(normal|bold|bolder|[1-9]00)$/.test(v)) {
        issues.push(`font-weight ${v}`);
      }
    } else if (property === 'font-style') {
      if (!/^(normal|italic)$/.test(v)) issues.push(`font-style ${v}`);
    }
  }
  return issues;
}
