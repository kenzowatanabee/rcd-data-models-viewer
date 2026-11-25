/**
 * What the Docs sidebar lists: groups, rows with their muted prefix, the
 * filter and its chips. Pure, so it can be tested without a browser.
 */
import type { Graph } from '../indexer/types';
import type { GraphResponse } from '../server/api';
import { toneOf } from './docHeaderModel';
import { arrange, sharedFeeds, sharedLookups } from './graphFamilies';
import { visibleGraph } from './graphModel';
import { compareKeys, field, rankCandidates, type Field } from './quickMatch';
import { DEFAULT_GRAPH } from './route';
import type { GroupBy } from './settings';

export type SidebarKind = 'dataset' | 'pipeline' | 'doc';

export interface SidebarDoc {
  file: string;
  name: string;
  aliases: string[];
  kind: SidebarKind;
  layer: string | null;
  status: string | null;
  title: string | null;
  /** Folder of an other doc (`docs`, `guides`), '' for the repo root. */
  folder: string;
}

export const LAYER_ORDER = [
  'source',
  'dimension',
  'intermediate',
  'output',
] as const;
const LAYERS = new Set<string>(LAYER_ORDER);

export function markerClass(doc: Pick<SidebarDoc, 'kind' | 'layer'>) {
  if (doc.kind === 'pipeline') return 'kind-pipeline';
  if (doc.kind === 'doc') return null;
  if (doc.layer === null) return 'layer-other';
  return `layer-${LAYERS.has(doc.layer) ? doc.layer : 'other'}`;
}

/** Every doc the sidebar can list. */
export function sidebarDocs(data: GraphResponse): SidebarDoc[] {
  const docs: SidebarDoc[] = [];
  for (const node of data.graph.nodes) {
    if (node.file === null || node.kind === 'external') continue;
    docs.push({
      file: node.file,
      name: node.name,
      aliases: node.aliases,
      kind: node.kind,
      layer: node.kind === 'dataset' ? node.layer : null,
      status: node.status,
      title: node.title,
      folder: '',
    });
  }
  for (const file of data.otherDocs) {
    const cut = file.lastIndexOf('/');
    docs.push({
      file,
      name: file.slice(cut + 1),
      aliases: [],
      kind: 'doc',
      layer: null,
      status: null,
      title: null,
      folder: cut === -1 ? '' : file.slice(0, cut),
    });
  }
  return docs;
}

export interface FamilyBand {
  id: string;
  title: string;
  nodes: string[];
}

/** The graph's bands for the whole-graph view at its default options. */
export function familyBands(graph: Graph): FamilyBand[] {
  const visible = visibleGraph(graph, {
    showExternal: DEFAULT_GRAPH.showExternal,
    showRedundant: DEFAULT_GRAPH.showRedundant,
  });
  const lookups = sharedLookups(visible);
  const feeds = sharedFeeds(visible, lookups);
  return arrange(visible, { lookups, feeds }).bands.map((band) => ({
    id: band.id,
    title: band.title,
    nodes: band.nodes,
  }));
}

/**
 * Underscore prefixes (one or two segments, such as `RCD_` and `RCD_TAB_`)
 * that at least `share` of the names start with, longest first. They are
 * shown muted so the part that tells rows apart stands out.
 */
export function sharedPrefixes(names: readonly string[], share = 0.1) {
  const counts = new Map<string, number>();
  for (const name of names) {
    const parts = name.split('_');
    for (let n = 1; n <= 2 && n < parts.length; n += 1) {
      const prefix = `${parts.slice(0, n).join('_')}_`;
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }
  const needed = Math.max(3, Math.ceil(names.length * share));
  return [...counts]
    .filter(([prefix, count]) => count >= needed && prefix.length > 1)
    .map(([prefix]) => prefix)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** The muted prefix of `name`: the longest shared one that leaves a stem. */
export function prefixOf(name: string, prefixes: readonly string[]) {
  return (
    prefixes.find(
      (prefix) => name.startsWith(prefix) && name.length > prefix.length,
    ) ?? ''
  );
}

export interface Chips {
  layers: readonly string[];
  draft: boolean;
  issues: boolean;
}

export const NO_CHIPS: Chips = { layers: [], draft: false, issues: false };

export const chipsActive = (chips: Chips) =>
  chips.layers.length > 0 || chips.draft || chips.issues;

/** Chips of different kinds combine with AND, layer chips with OR. */
export function matchesChips(
  doc: SidebarDoc,
  chips: Chips,
  issues: number,
): boolean {
  if (chips.layers.length > 0) {
    if (doc.kind !== 'dataset') return false;
    const layer = doc.layer !== null && LAYERS.has(doc.layer) ? doc.layer : '';
    if (!chips.layers.includes(layer)) return false;
  }
  if (chips.draft && (doc.status === null || toneOf(doc.status) !== 'draft')) {
    return false;
  }
  if (chips.issues && issues === 0) return false;
  return true;
}

export interface NavRow {
  doc: SidebarDoc;
  /** Muted start of the name; the rest is the stem. */
  prefix: string;
  /** Matched characters of the name. */
  hits: number[];
  issues: number;
}

export interface NavGroup {
  /** Stable key, used for the collapsed state: `datasets`, `layer:source`. */
  id: string;
  title: string;
  marker: string | null;
  /** Docs in the group before filtering. */
  total: number;
  rows: NavRow[];
  children: NavGroup[];
}

export interface NavOptions {
  groupBy: GroupBy;
  query: string;
  chips: Chips;
  issues: ReadonlyMap<string, number>;
  bands: readonly FamilyBand[];
}

const LAYER_TITLES: Record<string, string> = {
  source: 'Source',
  dimension: 'Dimension',
  intermediate: 'Intermediate',
  output: 'Output',
  other: 'Other layer',
};

interface Ranked {
  doc: SidebarDoc;
  key: number[];
  hits: number[];
}

function fieldsOf(doc: SidebarDoc): Field[] {
  return [
    field(doc.name, 0),
    ...doc.aliases.map((alias) => field(alias, 1)),
    ...(doc.kind === 'doc' ? [field(doc.file, 2)] : []),
  ];
}

/** Every visible row in order, groups flattened. */
export function flattenRows(groups: readonly NavGroup[]): NavRow[] {
  return groups.flatMap((group) => [
    ...group.rows,
    ...flattenRows(group.children),
  ]);
}

/** Total of a group and its children; only the leaves hold rows. */
const countOf = (group: NavGroup): number =>
  group.rows.length +
  group.children.reduce((sum, child) => sum + countOf(child), 0);

export const shownCount = countOf;

/**
 * The sidebar's groups. Without a query, groups keep their fixed order and
 * rows go A–Z; with one, rows go best match first and groups follow their
 * best row, so the best match is always the first row.
 */
export function buildNav(
  docs: readonly SidebarDoc[],
  options: NavOptions,
): NavGroup[] {
  const { query, chips, issues } = options;
  const issuesOf = (doc: SidebarDoc) => issues.get(doc.file) ?? 0;
  const filtering = query.trim() !== '';
  const kept = docs.filter((doc) => matchesChips(doc, chips, issuesOf(doc)));
  const ranked = new Map<string, Ranked>();
  if (filtering) {
    const candidates = kept.map((doc) => ({
      id: doc.file,
      label: doc.name,
      fields: fieldsOf(doc),
      doc,
    }));
    for (const { item, match } of rankCandidates(query, candidates)) {
      ranked.set(item.doc.file, {
        doc: item.doc,
        key: match.key,
        hits: match.highlights.find((h) => h.field === 0)?.at ?? [],
      });
    }
  } else {
    for (const doc of kept) ranked.set(doc.file, { doc, key: [], hits: [] });
  }

  const prefixes = new Map<SidebarKind, string[]>();
  for (const kind of ['dataset', 'pipeline'] as const) {
    prefixes.set(
      kind,
      sharedPrefixes(docs.filter((d) => d.kind === kind).map((d) => d.name)),
    );
  }
  const order = (a: Ranked, b: Ranked) =>
    compareKeys(a.key, b.key) || a.doc.name.localeCompare(b.doc.name);
  const rowsOf = (members: readonly SidebarDoc[]): NavRow[] =>
    members
      .flatMap((doc) => {
        const hit = ranked.get(doc.file);
        return hit === undefined ? [] : [hit];
      })
      .sort(order)
      .map(({ doc, hits }) => ({
        doc,
        prefix: prefixOf(doc.name, prefixes.get(doc.kind) ?? []),
        hits,
        issues: issuesOf(doc),
      }));
  const leaf = (
    id: string,
    title: string,
    marker: string | null,
    members: readonly SidebarDoc[],
  ): NavGroup => ({
    id,
    title,
    marker,
    total: members.length,
    rows: rowsOf(members),
    children: [],
  });
  const parent = (
    id: string,
    title: string,
    children: NavGroup[],
  ): NavGroup => ({
    id,
    title,
    marker: null,
    total: children.reduce((sum, child) => sum + child.total, 0),
    rows: [],
    children,
  });

  const datasets = docs.filter((doc) => doc.kind === 'dataset');
  const pipelines = docs.filter((doc) => doc.kind === 'pipeline');
  const others = docs.filter((doc) => doc.kind === 'doc');
  const groups: NavGroup[] = [];

  if (options.groupBy === 'family') {
    const byFile = new Map(
      [...datasets, ...pipelines].map((doc) => [doc.file, doc]),
    );
    const placed = new Set<string>();
    const bands = options.bands.flatMap((band) => {
      const members = band.nodes.flatMap((id) => {
        const doc = byFile.get(id);
        return doc === undefined ? [] : [doc];
      });
      for (const doc of members) placed.add(doc.file);
      return members.length === 0
        ? []
        : [leaf(`family:${band.id}`, band.title, null, members)];
    });
    const rest = [...byFile.values()].filter((doc) => !placed.has(doc.file));
    if (rest.length > 0)
      bands.push(leaf('family:rest', 'Elsewhere', null, rest));
    groups.push(parent('families', 'Lineage families', bands));
  } else {
    if (options.groupBy === 'layer') {
      const layerOf = (doc: SidebarDoc) =>
        doc.layer !== null && LAYERS.has(doc.layer) ? doc.layer : 'other';
      const children = [...LAYER_ORDER, 'other'].flatMap((layer) => {
        const members = datasets.filter((doc) => layerOf(doc) === layer);
        return members.length === 0
          ? []
          : [
              leaf(
                `layer:${layer}`,
                LAYER_TITLES[layer] ?? layer,
                `layer-${layer}`,
                members,
              ),
            ];
      });
      groups.push(parent('datasets', 'Datasets', children));
    } else {
      groups.push(leaf('datasets', 'Datasets', null, datasets));
    }
    groups.push(leaf('pipelines', 'Pipelines', null, pipelines));
  }

  const folders = [...new Set(others.map((doc) => doc.folder))].sort((a, b) =>
    a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
  );
  groups.push(
    parent(
      'other',
      'Other docs',
      folders.map((folder) =>
        leaf(
          `folder:${folder}`,
          folder === '' ? 'Repository root' : `${folder}/`,
          null,
          others.filter((doc) => doc.folder === folder),
        ),
      ),
    ),
  );

  if (!filtering && !chipsActive(chips)) return groups;
  // Only groups with matches are listed while filtering
  const prune = (group: NavGroup): NavGroup | null => {
    const children = group.children
      .map(prune)
      .filter((child): child is NavGroup => child !== null);
    const next = { ...group, children };
    return countOf(next) === 0 ? null : next;
  };
  const best = (group: NavGroup) => {
    const first = flattenRows([group])
      .map((row) => ranked.get(row.doc.file)?.key ?? [])
      .sort(compareKeys)[0];
    return first ?? [];
  };
  const sortGroups = (list: NavGroup[]): NavGroup[] =>
    filtering
      ? list
          .map((group) => ({ ...group, children: sortGroups(group.children) }))
          .sort((a, b) => compareKeys(best(a), best(b)))
      : list;
  return sortGroups(
    groups.map(prune).filter((group): group is NavGroup => group !== null),
  );
}

/** Every doc in the sidebar's unfiltered order, for `j` / `k`. */
export function navOrder(
  docs: readonly SidebarDoc[],
  groupBy: GroupBy,
  bands: readonly FamilyBand[],
): string[] {
  return flattenRows(
    buildNav(docs, {
      groupBy,
      query: '',
      chips: NO_CHIPS,
      issues: new Map(),
      bands,
    }),
  ).map((row) => row.doc.file);
}

/** Section › group trail for a doc, for the context line above it. */
export function trailOf(
  doc: SidebarDoc,
  groupBy: GroupBy,
  bands: readonly FamilyBand[],
): string[] {
  if (doc.kind === 'doc') {
    return ['Other docs', doc.folder === '' ? 'Repository root' : doc.folder];
  }
  if (groupBy === 'family') {
    const band = bands.find((b) => b.nodes.includes(doc.file));
    return ['Lineage families', ...(band === undefined ? [] : [band.title])];
  }
  if (doc.kind === 'pipeline') return ['Pipelines'];
  if (groupBy === 'az') return ['Datasets'];
  const layer =
    doc.layer !== null && LAYERS.has(doc.layer) ? doc.layer : 'other';
  return ['Datasets', LAYER_TITLES[layer] ?? layer];
}

/** Average width of a character in a row's name, uppercase-heavy, in px. */
const CHAR_PX = 7.3;

/**
 * About how many characters of a name fit in a row of a sidebar this wide,
 * after the marker, paddings, status and any issue count.
 */
export function labelRoom(
  width: number,
  options: { depth: number; issues: boolean; meta: boolean },
): number {
  const fixed =
    96 +
    options.depth * 12 +
    (options.issues ? 34 : 0) +
    (options.meta ? 64 : 0);
  return Math.max(8, Math.floor((width - fixed) / CHAR_PX));
}

export interface FittedLabel {
  /** Shown muted before the stem: the shared prefix, or `…` once dropped. */
  lead: string;
  stem: string;
  /** The prefix gave way so the distinguishing part fits. */
  elided: boolean;
}

/**
 * A row's label: the whole name with its prefix muted when it fits;
 * otherwise the prefix becomes `…` so the end of the name, which tells
 * similar names apart, stays visible.
 */
export function fitLabel(
  name: string,
  prefix: string,
  room: number,
): FittedLabel {
  const stem = name.slice(prefix.length);
  if (prefix === '' || name.length <= room) {
    return { lead: prefix, stem, elided: false };
  }
  return { lead: '…', stem, elided: true };
}
