import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

import { buildGraph } from '../indexer/buildGraph';
import { docsApiPlugin } from './docsApiPlugin';
import { checkDocsRepo } from './docsRepo';
import { DEFAULT_DOCS_PATH, parseStartArgs } from './startArgs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function main(): Promise<void> {
  const arg = parseStartArgs(process.argv.slice(2));
  if (arg === undefined) {
    console.error('usage: pnpm start [path to rcd-data-models]');
    process.exitCode = 2;
    return;
  }
  // A path the user typed is relative to where they typed it; pnpm runs
  // scripts from the package folder and keeps the original in INIT_CWD.
  const repo =
    arg === null
      ? path.resolve(projectRoot, DEFAULT_DOCS_PATH)
      : path.resolve(process.env.INIT_CWD ?? process.cwd(), arg);
  const problem = checkDocsRepo(repo);
  if (problem !== null) {
    console.error(problem);
    console.error('usage: pnpm start [path to rcd-data-models]');
    process.exitCode = 1;
    return;
  }
  // Fail at start, not on the first request, if the docs cannot be indexed
  const graph = buildGraph(repo);

  const server = await createServer({
    configFile: false,
    root: path.join(projectRoot, 'src/ui'),
    plugins: [react(), docsApiPlugin(repo)],
    server: { host: 'localhost' },
  });
  await server.listen();
  console.log(`docs: ${repo}`);
  console.log(
    `indexed ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.problems.length} problems`,
  );
  server.printUrls();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
