export const DEFAULT_DOCS_PATH = '../rcd-data-models';

/**
 * `[path]`: the docs repo, or null for the default. Returns undefined when
 * the arguments make no sense. A leading `--` is skipped because some shells
 * and pnpm versions pass it through.
 */
export function parseStartArgs(args: string[]): string | null | undefined {
  const rest = args[0] === '--' ? args.slice(1) : args;
  if (rest.length > 1) return undefined;
  const [repo] = rest;
  if (repo === undefined) return null;
  if (repo.startsWith('-')) return undefined;
  return repo;
}
