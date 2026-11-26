// The desktop app's git state: one operation at a time, the background
// fetch, and what the page and the menu are told. No Electron imports, so
// the main process passes in what it needs.
import fs from 'node:fs';

import type { OpenFolderResult } from './bridge';
import { cloneRepo, fetchRepo, pullRepo, readStatus } from './gitOps';
import { autoFetchDue, pullDecision } from './gitPolicy';
import { createGitRunner, locateGit, type GitRunner } from './gitRunner';
import type {
  ActionResult,
  CloneParentResult,
  CloneProgress,
  CloneResult,
  GitFailed,
  GitRefused,
  GitState,
  GitTask,
  StatusResult,
} from './gitTypes';
import { parseCloneUrl, scrubCredentials } from './gitUrl';

export interface GitControllerDeps {
  /** The open docs folder, or null on the welcome screen. */
  folder: () => string | null;
  focused: () => boolean;
  /** Sends the state to the page, and refreshes the menu. */
  publish: (state: GitState) => void;
  progress: (progress: CloneProgress) => void;
  /** The native folder dialog; null when canceled. */
  chooseDirectory: () => Promise<string | null>;
  openFolder: (folder: string) => Promise<OpenFolderResult>;
  /** Tells the viewer that docs changed on disk (after a pull). */
  docsChanged: () => void;
  autoFetchMinutes: () => number;
  saveAutoFetchMinutes: (minutes: number) => void;
  /** An empty folder for core.hooksPath. */
  hooksDir: string;
}

const BUSY: GitRefused = {
  status: 'refused',
  reason: 'busy',
  message:
    'Git is already busy with another operation. Try again when it finishes.',
};

export function createGitController(deps: GitControllerDeps) {
  let runner: GitRunner | null = null;
  let unavailable: string | null = 'Looking for git…';
  let status: StatusResult | null = null;
  let running: GitTask | null = null;
  let last: ActionResult | null = null;
  let backgroundProblem: string | null = null;
  let lastAttempt: number | null = null;
  let abort: AbortController | null = null;
  let cloneParent: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const state = (): GitState => ({
    unavailable,
    status,
    running,
    last,
    autoFetchMinutes: deps.autoFetchMinutes(),
    backgroundProblem,
  });
  const publish = () => deps.publish(state());

  /** Runs `task` unless another one is running; null when busy. */
  async function exclusive<R>(
    task: GitTask,
    work: (git: GitRunner) => Promise<R>,
  ): Promise<R | null> {
    if (running !== null || runner === null) return null;
    running = task;
    publish();
    try {
      return await work(runner);
    } finally {
      running = null;
      abort = null;
    }
  }

  async function refreshStatus(): Promise<GitState> {
    const folder = deps.folder();
    if (folder === null || runner === null) {
      status = null;
      publish();
      return state();
    }
    const result = await exclusive('status', (git) => readStatus(git, folder));
    if (result !== null) status = result;
    publish();
    return state();
  }

  const noFolder = (): ActionResult => ({
    status: 'refused',
    reason: 'no-folder',
    message: 'Open a docs folder first.',
  });

  const missing = (): GitFailed => ({
    status: 'failed',
    category: 'git-missing',
    message: unavailable ?? 'Git is not available.',
  });

  async function action(
    task: 'fetch' | 'pull',
    run: (
      git: GitRunner,
      folder: string,
      signal: AbortSignal,
    ) => Promise<ActionResult>,
  ): Promise<ActionResult> {
    const folder = deps.folder();
    if (runner === null) return missing();
    if (folder === null) return noFolder();
    const result = await exclusive(task, async (git) => {
      abort = new AbortController();
      const outcome = await run(git, folder, abort.signal);
      status = await readStatus(git, folder);
      return outcome;
    });
    if (result === null) return BUSY;
    last = result;
    if (task === 'fetch' || result.status === 'ok') backgroundProblem = null;
    if (result.status === 'ok' && task === 'fetch') lastAttempt = Date.now();
    if (
      result.status === 'ok' &&
      task === 'pull' &&
      (result.commits ?? 0) > 0
    ) {
      deps.docsChanged();
    }
    publish();
    return result;
  }

  async function backgroundFetch(): Promise<void> {
    const folder = deps.folder();
    const repo = status?.status === 'ok' ? status.repo : null;
    if (
      folder === null ||
      repo === null ||
      !autoFetchDue({
        minutes: deps.autoFetchMinutes(),
        now: Date.now(),
        lastFetch: repo.lastFetch,
        lastAttempt,
        focused: deps.focused(),
        busy: running !== null,
        hasRemote: repo.remote !== null,
      })
    ) {
      return;
    }
    lastAttempt = Date.now();
    const result = await exclusive('fetch', async (git) => {
      const outcome = await fetchRepo(git, folder, { interactive: false });
      status = await readStatus(git, folder);
      return outcome;
    });
    if (result === null) return;
    // Never a pop-up: a quiet note in the popover
    backgroundProblem =
      result.status === 'failed'
        ? result.category === 'offline'
          ? "Couldn't reach GitHub for the automatic check."
          : result.category === 'auth'
            ? 'The automatic check could not sign in to GitHub. Fetch once by hand to sign in.'
            : `The automatic check failed: ${result.message}`
        : null;
    if (result.status === 'failed' && result.detail !== undefined) {
      console.warn(`Background fetch: ${scrubCredentials(result.detail)}`);
    }
    publish();
  }

  return {
    async init(): Promise<void> {
      fs.mkdirSync(deps.hooksDir, { recursive: true });
      const found = await locateGit();
      if (found.ok) {
        runner = createGitRunner(found.path, deps.hooksDir);
        unavailable = null;
      } else {
        unavailable = found.message;
      }
      await refreshStatus();
      timer = setInterval(() => void backgroundFetch(), 60_000);
      timer.unref();
    },
    state,
    refresh: refreshStatus,
    /** Window focus: fresh status, then a background fetch if due. */
    async onFocus(): Promise<void> {
      await refreshStatus();
      await backgroundFetch();
    },
    /** For the menu: whether Pull would fast-forward. */
    canPull(): boolean {
      return (
        running === null &&
        status?.status === 'ok' &&
        pullDecision(status.repo).ok
      );
    },
    canFetch(): boolean {
      return (
        running === null &&
        status?.status === 'ok' &&
        status.repo.remote !== null
      );
    },
    fetch: () =>
      action('fetch', (git, folder, signal) =>
        fetchRepo(git, folder, { interactive: true, signal }),
      ),
    pull: () =>
      action('pull', (git, folder, signal) =>
        pullRepo(git, folder, { signal }),
      ),
    cancel(): void {
      // A pull stops only during its fetch: gitOps never passes the signal
      // to the fast-forward itself
      abort?.abort();
    },
    async chooseCloneParent(): Promise<CloneParentResult> {
      const parent = await deps.chooseDirectory();
      if (parent === null) return { status: 'canceled' };
      cloneParent = parent;
      return { status: 'chosen', parent };
    },
    async clone(rawUrl: string): Promise<CloneResult> {
      if (runner === null) return missing();
      const source = parseCloneUrl(rawUrl);
      if (!source.ok) {
        return {
          status: 'refused',
          reason: 'invalid-url',
          message: source.reason,
        };
      }
      if (cloneParent === null) {
        return {
          status: 'refused',
          reason: 'no-destination',
          message: 'Choose the folder to clone into first.',
        };
      }
      const parent = cloneParent;
      const outcome = await exclusive('clone', (git) => {
        abort = new AbortController();
        return cloneRepo(git, source, parent, {
          signal: abort.signal,
          onProgress: deps.progress,
        });
      });
      publish();
      if (outcome === null) return BUSY;
      if (outcome.status !== 'ok') return outcome;
      const opened = await deps.openFolder(outcome.folder);
      if (opened.status === 'invalid') {
        return {
          status: 'ok',
          folder: outcome.folder,
          opened: false,
          message: `Cloned into ${outcome.folder}, but it is not the data models repo, so it was not opened. ${opened.error}`,
        };
      }
      return {
        status: 'ok',
        folder: outcome.folder,
        opened: true,
        message: `Cloned into ${outcome.folder}.`,
      };
    },
    setAutoFetch(minutes: number): GitState {
      deps.saveAutoFetchMinutes(minutes);
      publish();
      return state();
    },
    /** After another folder opened: the old status no longer applies. */
    folderChanged(): void {
      status = null;
      last = null;
      backgroundProblem = null;
      lastAttempt = null;
      void refreshStatus();
    },
    dispose(): void {
      clearInterval(timer);
      abort?.abort();
    },
  };
}

export type GitController = ReturnType<typeof createGitController>;
