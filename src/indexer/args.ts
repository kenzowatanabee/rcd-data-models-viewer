export interface CliArgs {
  repo: string;
  out: string;
}

/** `<repo> [--out file]`, in any order; null when the repo path is missing. */
export function parseArgs(args: string[]): CliArgs | null {
  let repo: string | undefined;
  let out = 'graph.json';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--out') {
      const value = args[i + 1];
      if (value === undefined) return null;
      out = value;
      i += 1;
    } else if (arg.startsWith('--') || repo !== undefined) {
      return null;
    } else {
      repo = arg;
    }
  }
  return repo === undefined ? null : { repo, out };
}
