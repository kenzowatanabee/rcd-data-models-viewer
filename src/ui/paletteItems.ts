/** What quick open can find, and how results are grouped. Pure. */
import type { GraphNode } from '../indexer/types';
import type { GraphResponse, HeadingsResponse } from '../server/api';
import {
  field,
  rankCandidates,
  type Candidate,
  type FieldHighlight,
} from './quickMatch';

export type PaletteKind =
  'dataset' | 'pipeline' | 'doc' | 'external' | 'heading' | 'command';

export type CommandId =
  | 'go-docs'
  | 'go-graph'
  | 'go-health'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | 'toggle-sidebar'
  | 'show-in-graph'
  | 'open-doc'
  | 'copy-path';

export interface PaletteItem extends Candidate {
  kind: PaletteKind;
  /** Marker class, as in the sidebar. */
  marker: string | null;
  /** Muted text after the label: the layer, the doc of a heading. */
  meta: string | null;
  file: string | null;
  anchor: string | null;
  /** Graph node, for "open in the graph". */
  node: string | null;
  command: CommandId | null;
}

const LAYERS = new Set(['source', 'dimension', 'intermediate', 'output']);

export function markerOf(node: Pick<GraphNode, 'kind' | 'layer'>) {
  if (node.kind === 'pipeline') return 'kind-pipeline';
  if (node.kind === 'external') return 'kind-external';
  if (node.layer === null) return null;
  return `layer-${LAYERS.has(node.layer) ? node.layer : 'other'}`;
}

function nodeItem(node: GraphNode): PaletteItem {
  const kind = node.kind === 'external' ? 'external' : node.kind;
  return {
    id: node.id,
    label: node.name,
    kind,
    fields: [
      field(node.name, 0),
      ...node.aliases.map((alias) => field(alias, 1)),
      ...(node.file === null ? [] : [field(node.file, 2)]),
      // Titles are Markdown; show them as the page does
      ...(node.title === null
        ? []
        : [field(node.title.replace(/[`*]/g, ''), 2)]),
    ],
    marker: markerOf(node),
    meta:
      kind === 'external'
        ? 'undocumented'
        : kind === 'pipeline'
          ? 'pipeline'
          : node.layer,
    file: node.file,
    anchor: null,
    node: node.id,
    command: null,
  };
}

function docItem(file: string): PaletteItem {
  const cut = file.lastIndexOf('/');
  return {
    id: file,
    label: file.slice(cut + 1),
    kind: 'doc',
    fields: [field(file.slice(cut + 1), 0), field(file, 2)],
    marker: null,
    meta: cut === -1 ? null : file.slice(0, cut + 1),
    file,
    anchor: null,
    node: null,
    command: null,
  };
}

export interface CommandContext {
  section: 'docs' | 'graph' | 'health';
  /** The doc open, if any. */
  file: string | null;
  /** The graph node of the open doc, or the node selected in the graph. */
  node: string | null;
  /** The selected node's doc, on the graph page. */
  nodeFile: string | null;
  sidebarCollapsed: boolean;
}

const command = (
  id: CommandId,
  label: string,
  keywords: string,
  meta: string | null = null,
): PaletteItem => ({
  id: `command:${id}`,
  label,
  kind: 'command',
  fields: [field(label, 0), field(keywords, 2)],
  marker: null,
  meta,
  file: null,
  anchor: null,
  node: null,
  command: id,
});

/** The commands that make sense where the reader is. */
export function commandItems(context: CommandContext): PaletteItem[] {
  const items = [
    command('go-docs', 'Go to Docs', 'section open', 'g d'),
    command('go-graph', 'Go to Lineage graph', 'section open lineage', 'g g'),
    command('go-health', 'Go to Docs health', 'section problems issues', 'g h'),
    command('theme-light', 'Theme: light', 'switch appearance mode'),
    command('theme-dark', 'Theme: dark', 'switch appearance mode night'),
    command('theme-system', 'Theme: follow the system', 'switch appearance'),
  ];
  if (context.section === 'docs') {
    items.push(
      command(
        'toggle-sidebar',
        context.sidebarCollapsed ? 'Show the sidebar' : 'Hide the sidebar',
        'toggle panel',
        '[',
      ),
    );
  }
  if (context.section === 'docs' && context.node !== null) {
    items.push(
      command('show-in-graph', 'Show this doc in the graph', 'lineage'),
    );
  }
  if (context.section === 'graph' && context.nodeFile !== null) {
    items.push(command('open-doc', 'Open the selected node’s doc', 'page'));
  }
  if (context.section === 'docs' && context.file !== null) {
    items.push(command('copy-path', 'Copy this doc’s path', 'file clipboard'));
  }
  return items;
}

/** Docs, undocumented names and headings, in a stable order. */
export function contentItems(
  data: GraphResponse,
  headings: HeadingsResponse | null,
): PaletteItem[] {
  const names = new Map<string, string>();
  for (const node of data.graph.nodes) {
    if (node.file !== null) names.set(node.file, node.name);
  }
  const items = [
    ...data.graph.nodes.map(nodeItem),
    ...data.otherDocs.map(docItem),
  ];
  for (const doc of headings?.docs ?? []) {
    const docName = names.get(doc.file) ?? doc.file;
    for (const heading of doc.headings) {
      items.push({
        id: `${doc.file}#${heading.id}`,
        label: heading.text,
        kind: 'heading',
        fields: [field(heading.text, 2)],
        marker: null,
        meta: docName,
        file: doc.file,
        anchor: heading.id,
        node: null,
        command: null,
      });
    }
  }
  return items;
}

export const GROUP_TITLES: Record<PaletteKind, string> = {
  dataset: 'Datasets',
  pipeline: 'Pipelines',
  doc: 'Other docs',
  external: 'Undocumented names',
  heading: 'Headings',
  command: 'Commands',
};

/** At most this many results per group, so headings do not crowd out docs. */
const GROUP_LIMIT: Record<PaletteKind, number> = {
  dataset: 12,
  pipeline: 8,
  doc: 6,
  external: 5,
  heading: 8,
  command: 6,
};

export interface ResultRow {
  item: PaletteItem;
  highlights: FieldHighlight[];
}

export interface ResultGroup {
  id: string;
  title: string;
  rows: ResultRow[];
  /** Matches left out by the group's limit. */
  hidden: number;
}

/**
 * Results grouped by kind; the groups come in the order of their best
 * result, so the best match overall is always the first row.
 */
export function searchPalette(
  query: string,
  items: readonly PaletteItem[],
): ResultGroup[] {
  const groups = new Map<PaletteKind, ResultGroup>();
  for (const { item, match } of rankCandidates(query, items)) {
    const group = groups.get(item.kind) ?? {
      id: item.kind,
      title: GROUP_TITLES[item.kind],
      rows: [],
      hidden: 0,
    };
    if (group.rows.length < GROUP_LIMIT[item.kind]) {
      group.rows.push({ item, highlights: match.highlights });
    } else {
      group.hidden += 1;
    }
    groups.set(item.kind, group);
  }
  return [...groups.values()];
}

export const RECENT_LIMIT = 8;

/** A JSON array of item ids; anything unreadable means none. */
export function parseRecent(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((id): id is string => typeof id === 'string')
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** `id` first, without repeats, keeping the most recent few. */
export const pushRecent = (recent: readonly string[], id: string) =>
  [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_LIMIT);

/** The recent items that still exist, most recent first. */
export function recentRows(
  recent: readonly string[],
  items: readonly PaletteItem[],
): ResultRow[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return recent.flatMap((id) => {
    const item = byId.get(id);
    return item === undefined ? [] : [{ item, highlights: [] }];
  });
}

/** Every doc in the sidebar's order: datasets, pipelines, then other docs. */
export function sidebarOrder(data: GraphResponse): string[] {
  const byName = (kind: GraphNode['kind']) =>
    data.graph.nodes
      .filter(
        (node): node is GraphNode & { file: string } =>
          node.kind === kind && node.file !== null,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => node.file);
  return [...byName('dataset'), ...byName('pipeline'), ...data.otherDocs];
}

/** The doc `step` places from `current`, or the first one; null at the ends. */
export function adjacentDoc(
  order: readonly string[],
  current: string | null,
  step: 1 | -1,
): string | null {
  const at = current === null ? -1 : order.indexOf(current);
  if (at === -1) return order[step === 1 ? 0 : order.length - 1] ?? null;
  return order[at + step] ?? null;
}
