// Runs the real operations against throwaway repositories: a bare "remote",
// a second clone that pushes new commits, and the user's clone under test.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cloneRepo, fetchRepo, pullRepo, readStatus } from './gitOps';
import { createGitRunner, type GitRunner } from './gitRunner';
import type { RepoStatus } from './gitTypes';

const hasGit = spawnSync('git', ['--version']).status === 0;
if (!hasGit) console.warn('gitOps tests skipped: git is not installed');

let root = '';
let env: NodeJS.ProcessEnv = {};
let git: GitRunner;
let counter = 0;

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
}

function write(dir: string, file: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

/** A remote with one commit, a pusher clone and the user's clone. */
function setup(): { remote: string; other: string; mine: string } {
  counter += 1;
  const base = path.join(root, `case${counter}`);
  const seed = path.join(base, 'seed');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(seed, { recursive: true });
  sh(seed, 'init', '-q', '-b', 'main');
  write(seed, 'docs/datasets/a.md', '# A\n');
  write(seed, 'docs/pipelines/p.md', '# P\n');
  write(seed, 'README.md', '# Docs\n');
  sh(seed, 'add', '.');
  sh(seed, 'commit', '-q', '-m', 'first');
  sh(base, 'clone', '-q', '--bare', seed, remote);
  sh(base, 'clone', '-q', remote, 'other');
  sh(base, 'clone', '-q', remote, 'mine');
  return {
    remote,
    other: path.join(base, 'other'),
    mine: path.join(base, 'mine'),
  };
}

function push(other: string, files: Record<string, string>, message: string) {
  for (const [file, text] of Object.entries(files)) write(other, file, text);
  sh(other, 'add', '.');
  sh(other, 'commit', '-q', '-m', message);
  sh(other, 'push', '-q', 'origin', 'main');
}

/** HEAD plus a hash of every work tree file: equal means nothing changed. */
function snapshot(dir: string): string {
  const hash = createHash('sha256');
  hash.update(sh(dir, 'rev-parse', 'HEAD'));
  const walk = (folder: string) => {
    for (const entry of fs
      .readdirSync(folder, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(`${full}\0`).update(fs.readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

async function repoOf(folder: string): Promise<RepoStatus> {
  const result = await readStatus(git, folder);
  if (result.status !== 'ok') throw new Error(`status: ${result.message}`);
  return result.repo;
}

describe.skipIf(!hasGit)('git operations on real repositories', () => {
  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-ops-')));
    const globalConfig = path.join(root, 'gitconfig');
    fs.writeFileSync(globalConfig, '[init]\n\tdefaultBranch = main\n');
    const hooks = path.join(root, 'empty-hooks');
    fs.mkdirSync(hooks);
    env = {
      PATH: process.env.PATH,
      HOME: root,
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    };
    git = createGitRunner('git', hooks, env);
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('clean and up to date: pull changes nothing', async () => {
    const { mine } = setup();
    const repo = await repoOf(mine);
    expect(repo).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      changes: { modified: 0, untracked: 0, conflicted: 0 },
      operation: null,
      locked: false,
      subfolder: null,
      remote: { name: 'origin' },
    });
    const pulled = await pullRepo(git, mine);
    expect(pulled).toMatchObject({ status: 'ok', commits: 0 });
  });

  it('behind: fetch counts, pull fast-forwards and reports', async () => {
    const { other, mine } = setup();
    push(
      other,
      { 'docs/datasets/a.md': '# A2\n', 'docs/datasets/b.md': '# B\n' },
      'two',
    );
    push(other, { 'README.md': '# Docs 2\n' }, 'three');
    const fetched = await fetchRepo(git, mine, { interactive: false });
    expect(fetched).toMatchObject({
      status: 'ok',
      message: '2 new commits on origin/main.',
    });
    expect((await repoOf(mine)).behind).toBe(2);
    expect((await repoOf(mine)).lastFetch).not.toBeNull();
    const pulled = await pullRepo(git, mine);
    expect(pulled).toMatchObject({
      status: 'ok',
      commits: 2,
      files: 3,
      keptLocalEdits: false,
    });
    expect(sh(mine, 'rev-parse', 'HEAD')).toBe(sh(other, 'rev-parse', 'HEAD'));
    expect(fs.readFileSync(path.join(mine, 'README.md'), 'utf8')).toBe(
      '# Docs 2\n',
    );
  });

  it('ahead: refused and nothing changes', async () => {
    const { mine } = setup();
    write(mine, 'docs/datasets/mine.md', '# Mine\n');
    sh(mine, 'add', '.');
    sh(mine, 'commit', '-q', '-m', 'local');
    const before = snapshot(mine);
    expect(await pullRepo(git, mine)).toMatchObject({
      status: 'refused',
      reason: 'ahead',
    });
    expect(snapshot(mine)).toBe(before);
  });

  it('diverged: refused and nothing changes', async () => {
    const { other, mine } = setup();
    push(other, { 'docs/datasets/x.md': '# X\n' }, 'theirs');
    write(mine, 'docs/datasets/y.md', '# Y\n');
    sh(mine, 'add', '.');
    sh(mine, 'commit', '-q', '-m', 'ours');
    const before = snapshot(mine);
    expect(await pullRepo(git, mine)).toMatchObject({
      status: 'refused',
      reason: 'diverged',
    });
    expect(snapshot(mine)).toBe(before);
  });

  it('dirty, not overlapping: pulls and keeps the local edit', async () => {
    const { other, mine } = setup();
    push(other, { 'docs/datasets/a.md': '# A2\n' }, 'theirs');
    write(mine, 'README.md', '# Local edit\n');
    write(mine, 'notes.md', 'untracked\n');
    const pulled = await pullRepo(git, mine);
    expect(pulled).toMatchObject({
      status: 'ok',
      commits: 1,
      files: 1,
      keptLocalEdits: true,
    });
    expect(fs.readFileSync(path.join(mine, 'README.md'), 'utf8')).toBe(
      '# Local edit\n',
    );
    expect(fs.readFileSync(path.join(mine, 'docs/datasets/a.md'), 'utf8')).toBe(
      '# A2\n',
    );
  });

  it('dirty, overlapping: refused with the file names, edit intact', async () => {
    const { other, mine } = setup();
    push(other, { 'docs/datasets/a.md': '# A2\n' }, 'theirs');
    write(mine, 'docs/datasets/a.md', '# My edit\n');
    const head = sh(mine, 'rev-parse', 'HEAD');
    const pulled = await pullRepo(git, mine);
    expect(pulled).toMatchObject({
      status: 'refused',
      reason: 'would-overwrite',
      files: ['docs/datasets/a.md'],
    });
    expect(fs.readFileSync(path.join(mine, 'docs/datasets/a.md'), 'utf8')).toBe(
      '# My edit\n',
    );
    expect(sh(mine, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('detached HEAD and no upstream are refused', async () => {
    const { mine } = setup();
    sh(mine, 'checkout', '-q', '--detach');
    expect((await repoOf(mine)).branch).toBeNull();
    expect(await pullRepo(git, mine)).toMatchObject({
      status: 'refused',
      reason: 'detached',
    });
    sh(mine, 'checkout', '-q', '-b', 'topic');
    expect((await repoOf(mine)).upstream).toBeNull();
    expect(await pullRepo(git, mine)).toMatchObject({
      status: 'refused',
      reason: 'no-upstream',
    });
  });

  it('not a git repository', async () => {
    const plain = path.join(root, 'plain');
    fs.mkdirSync(plain, { recursive: true });
    // Stop git from finding a repository above the temp folder
    const result = await readStatus(
      createGitRunner('git', path.join(root, 'empty-hooks'), {
        ...env,
        GIT_CEILING_DIRECTORIES: root,
      }),
      plain,
    );
    expect(result).toMatchObject({ status: 'failed', category: 'not-repo' });
  });

  it('docs folder below the work tree top', async () => {
    const { other, mine } = setup();
    const repo = await repoOf(path.join(mine, 'docs'));
    expect(repo.subfolder).toBe('docs/');
    expect(repo.topLevel).toBe(mine);
    push(other, { 'docs/datasets/a.md': '# A3\n' }, 'theirs');
    expect(await pullRepo(git, path.join(mine, 'docs'))).toMatchObject({
      status: 'ok',
      commits: 1,
    });
  });

  it('index.lock: reported, pull refused, lock left alone', async () => {
    const { other, mine } = setup();
    push(other, { 'docs/datasets/a.md': '# A2\n' }, 'theirs');
    const lock = path.join(mine, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    expect((await repoOf(mine)).locked).toBe(true);
    expect(await pullRepo(git, mine)).toMatchObject({
      status: 'refused',
      reason: 'locked',
    });
    expect(fs.existsSync(lock)).toBe(true);
  });

  it('merge in progress is refused', async () => {
    const { other, mine } = setup();
    push(other, { 'docs/datasets/a.md': '# Theirs\n' }, 'theirs');
    write(mine, 'docs/datasets/a.md', '# Ours\n');
    sh(mine, 'commit', '-q', '-am', 'ours');
    sh(mine, 'fetch', '-q');
    spawnSync('git', ['merge', '-q', 'origin/main'], { cwd: mine, env });
    const repo = await repoOf(mine);
    expect(repo.operation).toBe('merge');
    expect(repo.changes.conflicted).toBe(1);
    const before = snapshot(mine);
    expect(await pullRepo(git, mine)).toMatchObject({
      status: 'refused',
      reason: 'in-progress',
    });
    expect(snapshot(mine)).toBe(before);
  });

  it('remote unreachable: offline', async () => {
    const { mine } = setup();
    sh(mine, 'remote', 'set-url', 'origin', 'http://127.0.0.1:9/repo.git');
    expect(await fetchRepo(git, mine, { interactive: false })).toMatchObject({
      status: 'failed',
      category: 'offline',
    });
  });

  // The planted program is a shell script
  it.skipIf(process.platform === 'win32')(
    'a hostile fsmonitor or hook in .git/config does not run',
    async () => {
      const { other, mine } = setup();
      const marker = path.join(root, `ran-${counter}`);
      const script = path.join(root, `evil-${counter}.sh`);
      fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\n`, {
        mode: 0o755,
      });
      sh(mine, 'config', 'core.fsmonitor', script);
      fs.mkdirSync(path.join(mine, 'evil-hooks'));
      fs.copyFileSync(script, path.join(mine, 'evil-hooks', 'post-merge'));
      fs.chmodSync(path.join(mine, 'evil-hooks', 'post-merge'), 0o755);
      sh(mine, 'config', 'core.hooksPath', 'evil-hooks');
      push(other, { 'docs/datasets/a.md': '# A2\n' }, 'theirs');
      expect((await readStatus(git, mine)).status).toBe('ok');
      expect(await pullRepo(git, mine)).toMatchObject({
        status: 'ok',
        commits: 1,
      });
      expect(fs.existsSync(marker)).toBe(false);
      // Control: plain git does run it, so the check above means something
      spawnSync('git', ['status'], { cwd: mine, env });
      expect(fs.existsSync(marker)).toBe(true);
    },
  );

  it('refuses a repo whose own config sets a program it cannot override', async () => {
    const { mine } = setup();
    sh(mine, 'config', 'core.sshCommand', 'touch /tmp/never');
    expect(await readStatus(git, mine)).toMatchObject({
      status: 'failed',
      category: 'unsafe-config',
      detail: expect.stringContaining('core.sshcommand'),
    });
  });

  it('clone: into a new folder, never into an existing one', async () => {
    const { remote } = setup();
    const parent = path.join(root, `clones${counter}`);
    fs.mkdirSync(parent);
    const done = await cloneRepo(
      git,
      { url: remote, name: 'docs-clone' },
      parent,
    );
    expect(done).toEqual({
      status: 'ok',
      folder: path.join(parent, 'docs-clone'),
    });
    expect(
      fs.existsSync(
        path.join(parent, 'docs-clone', 'docs', 'datasets', 'a.md'),
      ),
    ).toBe(true);
    const again = await cloneRepo(
      git,
      { url: remote, name: 'docs-clone' },
      parent,
    );
    expect(again).toMatchObject({
      status: 'refused',
      reason: 'destination-exists',
    });
    expect(fs.existsSync(path.join(parent, 'docs-clone', 'README.md'))).toBe(
      true,
    );
  });

  it('clone cancel removes only the folder it created', async () => {
    // A server that accepts and never answers: git waits until stopped
    const server = net.createServer(() => undefined);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const port = (server.address() as net.AddressInfo).port;
    const parent = path.join(root, `cancel${counter}`);
    fs.mkdirSync(path.join(parent, 'keep'), { recursive: true });
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 400);
    const result = await cloneRepo(
      git,
      { url: `http://127.0.0.1:${port}/x.git`, name: 'slow' },
      parent,
      { signal: abort.signal },
    );
    server.close();
    expect(result).toMatchObject({ status: 'failed', category: 'canceled' });
    expect(fs.readdirSync(parent)).toEqual(['keep']);
  });

  it('git that cannot start is reported as missing', async () => {
    const broken = createGitRunner(path.join(root, 'no-such-git'), root, env);
    expect(await readStatus(broken, root)).toMatchObject({
      status: 'failed',
      category: 'git-missing',
    });
  });
});
