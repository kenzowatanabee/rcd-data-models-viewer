export interface AppArgs {
  /** The docs folder given on the command line, as typed. */
  folder: string | null;
  /** `--user-data-dir=<path>`: keeps settings apart (tests, a second profile). */
  userDataDir: string | null;
}

const USER_DATA = '--user-data-dir=';

/**
 * The arguments meant for the app in a full `argv`: what follows the main
 * script when it is run as `electron main.mjs ...`. Chromium may put its own
 * switches anywhere, so the script is found by name rather than position.
 */
export function appArgv(
  argv: readonly string[],
  script: string | null,
): string[] {
  if (script === null) return argv.slice(1);
  const normalise = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  const target = normalise(script);
  const index = argv.findIndex((arg) => normalise(arg) === target);
  return index === -1 ? argv.slice(1) : argv.slice(index + 1);
}

/**
 * `[--user-data-dir=<path>] [folder]`. Other switches (Chromium's,
 * Electron's, a stray `--` from pnpm) are ignored, and so is anything after
 * the first folder.
 */
export function parseAppArgs(args: readonly string[]): AppArgs {
  let folder: string | null = null;
  let userDataDir: string | null = null;
  for (const arg of args) {
    if (arg.startsWith(USER_DATA)) {
      const value = arg.slice(USER_DATA.length);
      if (value !== '') userDataDir = value;
      continue;
    }
    if (arg.startsWith('-') || arg === '') continue;
    folder ??= arg;
  }
  return { folder, userDataDir };
}
