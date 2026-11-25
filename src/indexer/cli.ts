import fs from 'node:fs';
import path from 'node:path';

import { parseArgs } from './args';
import { buildGraph } from './buildGraph';
import type { Graph } from './types';

function tally<T>(items: T[], key: (item: T) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return (
    [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => `${name} ${count}`)
      .join(', ') || 'none'
  );
}

function report(graph: Graph): string {
  const lines = [
    `nodes: ${tally(graph.nodes, (node) => node.kind)}`,
    `edges: ${graph.edges.length}`,
    `references: ${tally(graph.references, (reference) => reference.status)}`,
    `one-sided links: ${graph.oneSided.length} (${
      graph.oneSided.filter((link) => link.uncertain).length
    } uncertain)`,
    `problems: ${tally(graph.problems, (problem) => problem.kind)}`,
  ];
  const ambiguous = graph.references.filter(
    (reference) => reference.status === 'ambiguous',
  );
  if (ambiguous.length > 0) {
    lines.push('', 'ambiguous references (no edge drawn):');
    for (const reference of ambiguous) {
      lines.push(
        `  ${reference.file}#${reference.field}: ${reference.ref} -> ${reference.candidates.join(' | ')}`,
      );
    }
  }
  const externals = graph.nodes.filter((node) => node.kind === 'external');
  if (externals.length > 0) {
    lines.push('', 'names with no doc (drawn as external):');
    for (const node of externals) lines.push(`  ${node.name}`);
  }
  if (graph.problems.length > 0) {
    lines.push('', 'problems:');
    for (const problem of graph.problems) {
      lines.push(
        `  ${problem.kind}: ${problem.files.join(' | ')} ${problem.detail}`.trimEnd(),
      );
    }
  }
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.error(
      'usage: pnpm run index <path to rcd-data-models> [--out file]',
    );
    process.exitCode = 2;
    return;
  }
  const { repo, out } = args;
  const graph = buildGraph(path.resolve(repo));
  fs.writeFileSync(out, `${JSON.stringify(graph, null, 2)}\n`);
  console.log(report(graph));
  console.log(`\nwrote ${out}`);
}

main();
