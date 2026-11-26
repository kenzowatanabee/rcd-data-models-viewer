// `pnpm app [folder]`: bundles the main process and preload, then starts
// Electron on them. Plain Node, so it behaves the same in every shell.
// `--build-only` stops after bundling (for scripted launches).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const outDir = path.join(projectRoot, 'out', 'desktop');
const source = (file: string) => path.join(projectRoot, 'src', 'desktop', file);

async function main(): Promise<void> {
  await Promise.all([
    build({
      entryPoints: [source('main.ts')],
      outfile: path.join(outDir, 'main.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      // Vite, React's plugin, the indexer's parsers... load from node_modules
      packages: 'external',
      sourcemap: true,
      logLevel: 'warning',
    }),
    build({
      entryPoints: [source('preload.ts')],
      outfile: path.join(outDir, 'preload.cjs'),
      bundle: true,
      // A sandboxed preload must be one CommonJS file
      platform: 'node',
      format: 'cjs',
      target: 'chrome130',
      external: ['electron'],
      sourcemap: 'inline',
      logLevel: 'warning',
    }),
  ]);

  if (process.argv[2] === '--build-only') return;

  // In Node, the electron package exports the path of its binary, and
  // downloads the binary itself the first time if it is missing
  const electron = createRequire(import.meta.url)('electron') as string;
  const child = spawn(
    electron,
    [path.join(outDir, 'main.mjs'), ...process.argv.slice(2)],
    { stdio: 'inherit', windowsHide: false },
  );
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === null ? 0 : 1);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
