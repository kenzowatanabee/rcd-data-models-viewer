import type { Depth } from './graphModel';

export interface GraphRoute {
  /** Node whose lineage alone is laid out; null for the whole graph. */
  focus: string | null;
  /** Selected node; in focus mode it defaults to the focused one. */
  node: string | null;
  /** Second node, to show what lies between it and `node`. */
  to: string | null;
  depth: Depth;
  showExternal: boolean;
  showRedundant: boolean;
  /** Draw the shared lookups' links as wires instead of tags. */
  lookupWires: boolean;
}

export type Route =
  | { view: 'home' }
  | { view: 'doc'; file: string; anchor: string | null }
  | ({ view: 'graph' } & GraphRoute);

const DOC_PREFIX = '#/doc/';
const GRAPH = '#/graph';

export const DEFAULT_GRAPH: GraphRoute = {
  focus: null,
  node: null,
  to: null,
  depth: null,
  showExternal: true,
  showRedundant: false,
  lookupWires: false,
};

/**
 * Reads `#/doc/<file>[#anchor]` and `#/graph[/<node id>][?options]`;
 * anything else is the landing view.
 */
export function parseHash(hash: string): Route {
  if (
    hash === GRAPH ||
    hash.startsWith(`${GRAPH}/`) ||
    hash.startsWith(`${GRAPH}?`)
  ) {
    return { view: 'graph', ...parseGraph(hash.slice(GRAPH.length)) };
  }
  if (!hash.startsWith(DOC_PREFIX)) return { view: 'home' };
  const rest = hash.slice(DOC_PREFIX.length);
  const cut = rest.indexOf('#');
  const rawFile = cut === -1 ? rest : rest.slice(0, cut);
  const rawAnchor = cut === -1 ? '' : rest.slice(cut + 1);
  const file = safeDecode(rawFile);
  if (file === '') return { view: 'home' };
  const anchor = safeDecode(rawAnchor);
  return { view: 'doc', file, anchor: anchor === '' ? null : anchor };
}

export function docHash(file: string, anchor: string | null = null): string {
  return `${DOC_PREFIX}${encodePath(file)}${anchor === null ? '' : `#${encodeURIComponent(anchor)}`}`;
}

/** `rest` is what follows `#/graph`: `[/<id>][?query]`. */
function parseGraph(rest: string): GraphRoute {
  const cut = rest.indexOf('?');
  const path = cut === -1 ? rest : rest.slice(0, cut);
  const query = new URLSearchParams(cut === -1 ? '' : rest.slice(cut + 1));
  const focus = path.startsWith('/') ? decodePath(path.slice(1)) : '';
  const depth = query.get('depth');
  const optional = (value: string | null) =>
    value === null || value === '' ? null : value;
  return {
    focus: focus === '' ? null : focus,
    node: optional(query.get('node')) ?? optional(focus),
    to: optional(query.get('to')),
    depth: depth === '1' ? 1 : depth === '2' ? 2 : null,
    showExternal: query.get('external') !== 'hide',
    showRedundant: query.get('links') === 'all',
    lookupWires: query.get('lookups') === 'wires',
  };
}

/** The address of a graph view; options left at their defaults are omitted. */
export function graphHash(route: Partial<GraphRoute> = {}): string {
  const full = { ...DEFAULT_GRAPH, ...route };
  const query = new URLSearchParams();
  if (full.node !== null && full.node !== full.focus) {
    query.set('node', full.node);
  }
  if (full.to !== null) query.set('to', full.to);
  if (full.depth !== null) query.set('depth', String(full.depth));
  if (!full.showExternal) query.set('external', 'hide');
  if (full.showRedundant) query.set('links', 'all');
  if (full.lookupWires) query.set('lookups', 'wires');
  const path = full.focus === null ? '' : `/${encodePath(full.focus)}`;
  const search = query.toString();
  return `${GRAPH}${path}${search === '' ? '' : `?${search}`}`;
}

/** Keeps the slashes so the address bar stays readable. */
const encodePath = (path: string) =>
  path.split('/').map(encodeURIComponent).join('/');

const decodePath = (path: string) => path.split('/').map(safeDecode).join('/');

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
