/**
 * The docs health report: every gap the indexer found, worked into to-do
 * items that say which file and field to change. Pure, from the Graph.
 */
import type { Graph, GraphNode, ProblemKind } from '../indexer/types';
import { fold } from './filter';
import { edgeKey, isDirectLink, redundantLinks, unlinked } from './graphModel';
import {
  describeOneSided,
  describeReference,
  type DocRef,
  type OneSidedGap,
  type ReferenceGap,
} from './lineage';

export const SECTION_IDS = [
  'problems',
  'ambiguous',
  'wrong-kind',
  'undocumented',
  'one-sided',
  'unlinked',
  'direct-links',
  'status',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const isSectionId = (value: string): value is SectionId =>
  (SECTION_IDS as readonly string[]).includes(value);

export interface ProblemItem {
  kind: ProblemKind;
  files: string[];
  detail: string;
  fix: string;
}

export interface AmbiguousName {
  ref: string;
  candidates: { file: string; name: string }[];
  /** Every doc and field that writes the shared name. */
  mentions: DocRef[];
}

export interface UndocumentedName {
  /** The graph's `external:<name>` node. */
  id: string;
  name: string;
  mentions: DocRef[];
  /** Nodes downstream of it: how much lineage documenting it would fill in. */
  downstream: number;
}

export interface OneSidedItem extends OneSidedGap {
  from: string;
  to: string;
}

export interface NodeRef {
  id: string;
  file: string | null;
  name: string;
}

export interface UnlinkedItem extends NodeRef {
  layer: string | null;
}

export interface DirectLink {
  from: NodeRef;
  to: NodeRef;
  declaredBy: DocRef[];
}

export interface StatusRow {
  kind: 'dataset' | 'pipeline';
  draft: number;
  reviewed: number;
  other: number;
  /** No `status` field. */
  none: number;
}

export interface DatedDoc extends NodeRef {
  kind: 'dataset' | 'pipeline';
  lastUpdated: string;
  status: string | null;
}

export interface HealthReport {
  problems: ProblemItem[];
  ambiguous: AmbiguousName[];
  wrongKind: ReferenceGap[];
  undocumented: UndocumentedName[];
  /** References to undocumented names, which `undocumented` groups. */
  unresolvedCount: number;
  oneSided: OneSidedItem[];
  unlinked: UnlinkedItem[];
  directLinks: DirectLink[];
  status: StatusRow[];
  /** The documented nodes updated longest ago, oldest first. */
  oldest: DatedDoc[];
  /** Docs with no `last_updated`. */
  undated: NodeRef[];
}

const FIXES: Record<ProblemKind, string> = {
  'no-front-matter':
    'Add a front-matter block between `---` lines at the top, with `type`, `name` and the lineage fields.',
  'bad-yaml':
    'Fix the YAML between the `---` lines so it parses; the error says where.',
  'missing-name': 'Add a `name:` field to the front-matter.',
  'type-vs-folder':
    'Make `type:` match the folder (`dataset` in docs/datasets, `pipeline` in docs/pipelines), or move the file.',
  'name-collision':
    'Give each doc a unique `name:` and keep the shared name under `aliases:`.',
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

function nodeRef(nodes: Map<string, GraphNode>, id: string): NodeRef {
  const node = nodes.get(id);
  return { id, file: node?.file ?? null, name: node?.name ?? id };
}

function docRef(nodes: Map<string, GraphNode>, file: string, field: string) {
  return { file, field, name: nodes.get(file)?.name ?? file };
}

/** How many nodes lie downstream of `id`. */
function downstreamCount(graph: Graph, id: string): number {
  const next = new Map<string, string[]>();
  for (const edge of graph.edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const at = queue.shift() ?? '';
    for (const to of next.get(at) ?? []) {
      if (seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen.size - 1;
}

const sameMention = (a: DocRef, b: DocRef) =>
  a.file === b.file && a.field === b.field;

function addMention(list: DocRef[], mention: DocRef) {
  if (!list.some((other) => sameMention(other, mention))) list.push(mention);
}

function groupAmbiguous(graph: Graph, nodes: Map<string, GraphNode>) {
  const groups = new Map<string, AmbiguousName>();
  for (const reference of graph.references) {
    if (reference.status !== 'ambiguous') continue;
    const candidates = [...reference.candidates].sort();
    const key = `${fold(reference.ref)}\n${candidates.join('\n')}`;
    const group = groups.get(key) ?? {
      ref: reference.ref,
      candidates: candidates.map((file) => ({
        file,
        name: nodes.get(file)?.name ?? file,
      })),
      mentions: [],
    };
    addMention(group.mentions, docRef(nodes, reference.file, reference.field));
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.ref.localeCompare(b.ref));
}

function groupUndocumented(graph: Graph, nodes: Map<string, GraphNode>) {
  const groups = new Map<string, UndocumentedName>();
  const unresolved = graph.references.filter(
    (reference) => reference.status === 'unresolved',
  );
  for (const reference of unresolved) {
    const id = reference.target ?? `external:${reference.ref}`;
    const group = groups.get(id) ?? {
      id,
      name: nodes.get(id)?.name ?? reference.ref,
      mentions: [],
      downstream: downstreamCount(graph, id),
    };
    addMention(group.mentions, docRef(nodes, reference.file, reference.field));
    groups.set(id, group);
  }
  // Most lineage first: documenting those fills in the most of the graph
  return [...groups.values()].sort(
    (a, b) =>
      b.downstream - a.downstream ||
      b.mentions.length - a.mentions.length ||
      a.name.localeCompare(b.name),
  );
}

function statusRows(graph: Graph): StatusRow[] {
  return (['dataset', 'pipeline'] as const).map((kind) => {
    const row: StatusRow = { kind, draft: 0, reviewed: 0, other: 0, none: 0 };
    for (const node of graph.nodes) {
      if (node.kind !== kind) continue;
      if (node.status === 'draft') row.draft += 1;
      else if (node.status === 'reviewed') row.reviewed += 1;
      else if (node.status === null || node.status === '') row.none += 1;
      else row.other += 1;
    }
    return row;
  });
}

export const OLDEST_COUNT = 10;

export function healthReport(graph: Graph): HealthReport {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const redundant = redundantLinks(graph);
  const documented = graph.nodes.filter(
    (node): node is GraphNode & { kind: 'dataset' | 'pipeline' } =>
      node.kind !== 'external',
  );
  const lonely = unlinked(graph);
  return {
    problems: graph.problems.map((problem) => ({
      ...problem,
      fix: FIXES[problem.kind],
    })),
    ambiguous: groupAmbiguous(graph, nodes),
    wrongKind: graph.references
      .filter((reference) => reference.status === 'wrong-kind')
      .map((reference) => describeReference(graph, reference)),
    undocumented: groupUndocumented(graph, nodes),
    unresolvedCount: graph.references.filter(
      (reference) => reference.status === 'unresolved',
    ).length,
    oneSided: graph.oneSided.map((link) => ({
      ...describeOneSided(graph, link),
      from: link.from,
      to: link.to,
    })),
    unlinked: graph.nodes
      .filter((node) => node.kind === 'dataset' && lonely.has(node.id))
      .map((node) => ({ ...nodeRef(nodes, node.id), layer: node.layer }))
      .sort(byName),
    directLinks: graph.edges
      .filter(
        (edge) =>
          // Between two documented datasets; undocumented names have their
          // own section
          kindOf.get(edge.from) === 'dataset' &&
          kindOf.get(edge.to) === 'dataset' &&
          isDirectLink(edge, kindOf) &&
          !redundant.has(edgeKey(edge)),
      )
      .map((edge) => ({
        from: nodeRef(nodes, edge.from),
        to: nodeRef(nodes, edge.to),
        declaredBy: edge.declaredBy.map((declared) => {
          const cut = declared.lastIndexOf('#');
          return docRef(nodes, declared.slice(0, cut), declared.slice(cut + 1));
        }),
      }))
      .sort((a, b) => byName(a.to, b.to) || byName(a.from, b.from)),
    status: statusRows(graph),
    oldest: documented
      .filter((node) => node.lastUpdated !== null && node.lastUpdated !== '')
      .map((node) => ({
        ...nodeRef(nodes, node.id),
        kind: node.kind,
        lastUpdated: node.lastUpdated ?? '',
        status: node.status,
      }))
      .sort(
        (a, b) => a.lastUpdated.localeCompare(b.lastUpdated) || byName(a, b),
      )
      .slice(0, OLDEST_COUNT),
    undated: documented
      .filter((node) => node.lastUpdated === null || node.lastUpdated === '')
      .map((node) => nodeRef(nodes, node.id))
      .sort(byName),
  };
}

/** Items in a section; the status overview is not a to-do list. */
export function sectionCount(report: HealthReport, id: SectionId): number {
  switch (id) {
    case 'problems':
      return report.problems.length;
    case 'ambiguous':
      return report.ambiguous.length;
    case 'wrong-kind':
      return report.wrongKind.length;
    case 'undocumented':
      return report.undocumented.length;
    case 'one-sided':
      return report.oneSided.length;
    case 'unlinked':
      return report.unlinked.length;
    case 'direct-links':
      return report.directLinks.length;
    case 'status':
      return 0;
  }
}

/** All the to-do items, for the badge in the top bar. */
export const issueCount = (report: HealthReport) =>
  SECTION_IDS.reduce((sum, id) => sum + sectionCount(report, id), 0);

const at = (ref: DocRef) => `${ref.file} \`${ref.field}\``;
const list = (refs: DocRef[]) => refs.map(at).join(', ');

/** One line per item, as plain text; the checklist and the filter use them. */
export function sectionLines(report: HealthReport, id: SectionId): string[] {
  switch (id) {
    case 'problems':
      return report.problems.map(
        (problem) =>
          `${problem.files.join(', ')}: ${problem.kind}${problem.detail === '' ? '' : ` (${problem.detail})`}. ${problem.fix}`,
      );
    case 'ambiguous':
      return report.ambiguous.map(
        (name) =>
          `\`${name.ref}\` is the name of ${name.candidates.map((c) => c.file).join(' and ')}; named in ${list(name.mentions)}. Give each doc a unique \`name\` and keep \`${name.ref}\` under \`aliases\`.`,
      );
    case 'wrong-kind':
      return report.wrongKind.map(
        (gap) =>
          `${at(gap.at)}: \`${gap.ref}\` is a ${gap.actual ?? 'different kind'}, but \`${gap.at.field}\` names a ${gap.expected ?? 'doc'}. Correct the name in that field.`,
      );
    case 'undocumented':
      return report.undocumented.map(
        (name) =>
          `Document \`${name.name}\` (${name.downstream} downstream): named in ${list(name.mentions)}.`,
      );
    case 'one-sided':
      return report.oneSided.map(
        (gap) =>
          `${gap.missing.file}: add \`${gap.declared.name}\` to \`${gap.missing.field}\` (declared by ${at(gap.declared)})${gap.uncertain ? '; uncertain, it may be there under an ambiguous name' : ''}.`,
      );
    case 'unlinked':
      return report.unlinked.map(
        (node) =>
          `${node.file ?? node.name}: link \`${node.name}\` with \`pipeline\`, \`upstream\` or \`downstream\`, or name it in a pipeline's \`inputs\` or \`outputs\`.`,
      );
    case 'direct-links':
      return report.directLinks.map(
        (link) =>
          `\`${link.from.name}\` → \`${link.to.name}\` is declared only by ${list(link.declaredBy)}: document the pipeline between them, or confirm there is none.`,
      );
    case 'status':
      return report.oldest.map(
        (doc) =>
          `Review ${doc.file ?? doc.name} (last updated ${doc.lastUpdated}${doc.status === null ? '' : `, ${doc.status}`}).`,
      );
  }
}

export const SECTION_TITLES: Record<SectionId, string> = {
  problems: 'Docs the indexer could not read',
  ambiguous: 'Ambiguous references',
  'wrong-kind': 'Wrong-kind references',
  undocumented: 'Undocumented names',
  'one-sided': 'One-sided links',
  unlinked: 'Datasets linked to nothing',
  'direct-links': 'Direct links with no pipeline',
  status: 'Status and staleness',
};

/** A section as a Markdown to-do list, for pasting elsewhere. */
export function checklist(report: HealthReport, id: SectionId): string {
  const lines = sectionLines(report, id);
  const body =
    lines.length === 0
      ? ['Nothing to do.']
      : lines.map((line) => `- [ ] ${line}`);
  return [`## ${SECTION_TITLES[id]}`, '', ...body, ''].join('\n');
}
