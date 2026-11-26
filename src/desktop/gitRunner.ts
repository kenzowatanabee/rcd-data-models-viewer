// Runs the system git: an absolute path, an argument array, no shell, no
// terminal, a timeout, and a fixed set of hardening options.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { parseGitVersion, versionOk } from './gitParse';

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  /**
   * The user asked for this (Fetch, Pull, Clone): the OS credential
   * manager may show its own sign-in window. Background work may not.
   */
  interactive?: boolean;
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  canceled: boolean;
  /** Set when git could not be started at all. */
  spawnError?: string;
}

export interface GitRunner {
  run: (args: readonly string[], options: RunOptions) => Promise<RunResult>;
}

/**
 * Prepended to every command. A repository's own config could otherwise
 * make even `git status` start a program; command-line `-c` wins over it.
 * - core.fsmonitor: status runs the configured fsmonitor program.
 * - core.hooksPath: an empty folder, so no hook (post-merge,
 *   reference-transaction, post-checkout...) runs.
 * - core.askPass empty, and the ASKPASS variables removed: no prompt program.
 * - protocol.ext.allow=never: `ext::` remotes run arbitrary commands.
 * - submodule.recurse=false: a fast-forward does not reach into submodules.
 * - core.quotePath=false, color.ui=false: plain, parseable output.
 */
export function hardeningArgs(emptyHooksDir: string): string[] {
  return [
    '-c',
    'core.fsmonitor=false',
    '-c',
    `core.hooksPath=${emptyHooksDir}`,
    '-c',
    'core.askPass=',
    '-c',
    'protocol.ext.allow=never',
    '-c',
    'submodule.recurse=false',
    '-c',
    'core.quotePath=false',
    '-c',
    'color.ui=false',
  ];
}

/** Variables that would point git at another repository or a prompt. */
const DROPPED = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_COMMON_DIR',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_TRACE',
  'GIT_TRACE_CURL',
  'GIT_CURL_VERBOSE',
  'GIT_TRACE_PACKET',
  'LANGUAGE',
];

/**
 * The environment git runs with. GIT_TERMINAL_PROMPT=0 so it never waits
 * for typed input; LC_ALL=C for stable messages. GCM_INTERACTIVE=never only
 * for background work: on a fetch or clone the user asked for, Git
 * Credential Manager may show its sign-in window (a timeout still applies).
 */
export function gitEnv(
  base: NodeJS.ProcessEnv,
  interactive: boolean,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of Object.keys(env)) {
    if (DROPPED.includes(key) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) {
      delete env[key];
    }
  }
  env.LC_ALL = 'C';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_PAGER = 'cat';
  env.PAGER = 'cat';
  env.GIT_EDITOR = ':';
  env.GIT_MERGE_AUTOEDIT = 'no';
  env.GIT_OPTIONAL_LOCKS = '0';
  if (interactive) delete env.GCM_INTERACTIVE;
  else env.GCM_INTERACTIVE = 'never';
  return env;
}

/** Where to look for git besides PATH (apps started from Finder get a short PATH). */
export function gitCandidates(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  const win = platform === 'win32';
  const sep = win ? ';' : ':';
  const join = win ? path.win32.join : path.posix.join;
  const names = win ? ['git.exe'] : ['git'];
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(sep)
    .map((dir) => dir.replace(/^"(.*)"$/, '$1'))
    // A relative PATH entry would find a git.exe planted in the docs folder
    .filter(
      (dir) => dir !== '' && (win ? path.win32 : path.posix).isAbsolute(dir),
    );
  if (platform === 'darwin') {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin');
  } else if (win) {
    for (const root of [
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      env.LOCALAPPDATA,
    ]) {
      if (root !== undefined) {
        dirs.push(join(root, 'Git', 'cmd'));
        dirs.push(join(root, 'Programs', 'Git', 'cmd'));
      }
    }
  } else {
    dirs.push('/usr/bin', '/usr/local/bin');
  }
  return [
    ...new Set(dirs.flatMap((dir) => names.map((name) => join(dir, name)))),
  ];
}

export type GitLocation =
  { ok: true; path: string; version: string } | { ok: false; message: string };

export const INSTALL_HINT =
  'Install git (macOS: run "xcode-select --install" or "brew install git"; Windows: https://git-scm.com/download/win), then restart the app.';

/** The first candidate that runs and is recent enough. */
export async function locateGit(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<GitLocation> {
  let tooOld: string | null = null;
  for (const candidate of gitCandidates(env, platform)) {
    if (!isExecutableFile(candidate)) continue;
    const output = await new Promise<string | null>((resolve) => {
      execFile(
        candidate,
        ['--version'],
        { env: gitEnv(env, false), timeout: 10_000, windowsHide: true },
        (error, stdout) => resolve(error === null ? stdout : null),
      );
    });
    // macOS's /usr/bin/git is a stub that fails until the tools are installed
    if (output === null) continue;
    const version = parseGitVersion(output);
    if (version === null) continue;
    if (!versionOk(version)) {
      tooOld ??= output.trim();
      continue;
    }
    return { ok: true, path: candidate, version: output.trim() };
  }
  return {
    ok: false,
    message:
      tooOld === null
        ? `Git was not found. ${INSTALL_HINT}`
        : `${tooOld} is too old (2.30 or later is needed). ${INSTALL_HINT}`,
  };
}

function isExecutableFile(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const MAX_OUTPUT = 8 * 1024 * 1024;

/** Kills git and the helpers it started (git-remote-https, ssh...). */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    const taskkill = path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'taskkill.exe',
    );
    execFile(
      taskkill,
      ['/pid', String(pid), '/T', '/F'],
      { windowsHide: true },
      () => undefined,
    );
    return;
  }
  try {
    // Started detached: the negative pid is its whole process group
    process.kill(-pid, 'SIGTERM');
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Already gone
      }
    }, 2000).unref();
  } catch {
    // Already gone
  }
}

export function createGitRunner(
  gitPath: string,
  emptyHooksDir: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): GitRunner {
  const prefix = hardeningArgs(emptyHooksDir);
  return {
    run: (args, options) =>
      new Promise((resolve) => {
        if (options.signal?.aborted === true) {
          resolve({
            code: null,
            stdout: '',
            stderr: '',
            timedOut: false,
            canceled: true,
          });
          return;
        }
        const child = spawn(gitPath, [...prefix, ...args], {
          cwd: options.cwd,
          env: gitEnv(baseEnv, options.interactive === true),
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true,
          // Its own session on macOS and Linux: no controlling terminal for
          // ssh to prompt on, and one process group to stop
          detached: process.platform !== 'win32',
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let canceled = false;
        let settled = false;
        const stop = () => {
          if (child.pid !== undefined && child.exitCode === null)
            killTree(child.pid);
        };
        const timer = setTimeout(() => {
          timedOut = true;
          stop();
        }, options.timeoutMs);
        const onAbort = () => {
          canceled = true;
          stop();
        };
        options.signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          if (stdout.length < MAX_OUTPUT) stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          if (stderr.length < MAX_OUTPUT) stderr += chunk;
          options.onStderr?.(chunk);
        });
        const finish = (code: number | null, spawnError?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', onAbort);
          resolve({
            code,
            stdout,
            stderr,
            timedOut,
            canceled,
            ...(spawnError === undefined ? {} : { spawnError }),
          });
        };
        child.on('error', (error) => finish(null, error.message));
        child.on('close', (code) => finish(code));
      }),
  };
}
