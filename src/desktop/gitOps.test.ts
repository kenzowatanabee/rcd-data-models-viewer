// Runs the real operations against throwaway repositories: a bare "remote",
// a second clone that pushes new commits, and the user's clone under test.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cloneRepo,
  fetchRepo,
  listBranches,
  pullRepo,
  readStatus,
  switchBranch,
} from './gitOps';
import { createGitRunner, type GitRunner } from './gitRunner';
import type { BranchList, BranchTarget, RepoStatus } from './gitTypes';

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
  // Branch switching. `branchSetup` gives the user's clone:
  // - main, tracking origin/main, 1 behind it
  // - docs/extra, tracking origin/docs/extra, 1 ahead of it; it adds
  //   docs/datasets/extra.md and changes README.md
  // - solo, with no upstream
  // - on origin only: docs/remote-only, the odd name ODD, and solo
  // - another remote, `upstream`, with a branch fromother
  const ODD = 'odd/ünï+x@y#1,2';
  function branchSetup() {
    const repos = setup();
    const { other, mine } = repos;
    sh(other, 'switch', '-q', '-c', 'docs/extra');
    push2(other, 'docs/extra', {
      'docs/datasets/extra.md': '# Extra\n',
      'README.md': '# Docs on extra\n',
    });
    sh(other, 'switch', '-q', '-c', 'docs/remote-only', 'main');
    push2(other, 'docs/remote-only', { 'docs/datasets/r.md': '# R\n' });
    sh(other, 'switch', '-q', '-c', ODD, 'main');
    push2(other, ODD, { 'docs/datasets/odd.md': '# Odd\n' });
    sh(other, 'switch', '-q', '-c', 'solo', 'main');
    push2(other, 'solo', { 'docs/datasets/solo-remote.md': '# S\n' });
    sh(other, 'switch', '-q', 'main');
    push(other, { 'docs/pipelines/q.md': '# Q\n' }, 'main moves');
    sh(mine, 'fetch', '-q');
    sh(mine, 'branch', '-q', '--track', 'docs/extra', 'origin/docs/extra');
    sh(mine, 'switch', '-q', 'docs/extra');
    write(mine, 'docs/datasets/local.md', '# Local\n');
    sh(mine, 'add', '.');
    sh(mine, 'commit', '-q', '-m', 'local only');
    sh(mine, 'switch', '-q', 'main');
    sh(mine, 'branch', '-q', '--no-track', 'solo', 'main');
    const up = path.join(path.dirname(mine), 'up.git');
    sh(path.dirname(mine), 'clone', '-q', '--bare', repos.remote, up);
    sh(up, 'branch', 'fromother', 'main');
    sh(mine, 'remote', 'add', 'upstream', up);
    sh(mine, 'fetch', '-q', 'upstream');
    sh(mine, 'tag', 'v1');
    return repos;
  }

  function push2(other: string, branch: string, files: Record<string, string>) {
    for (const [file, text] of Object.entries(files)) write(other, file, text);
    sh(other, 'add', '.');
    sh(other, 'commit', '-q', '-m', `on ${branch}`);
    sh(other, 'push', '-q', 'origin', branch);
  }

  async function listOf(folder: string): Promise<BranchList> {
    const result = await listBranches(git, folder);
    if (result.status !== 'ok') throw new Error(result.message);
    return result.list;
  }

  const local = (name: string): BranchTarget => ({ kind: 'local', name });
  const remoteTarget = (name: string): BranchTarget => ({
    kind: 'remote',
    name,
  });
  const branchOf = (dir: string) => sh(dir, 'branch', '--show-current');

  it('lists local, tracking and remote-only branches, nothing else', async () => {
    const { mine } = branchSetup();
    const list = await listOf(mine);
    expect(list.remote).toBe('origin');
    expect(list.current).toBe('main');
    expect(list.lastFetch).not.toBeNull();
    const byKey = new Map(
      list.branches.map((branch) => [`${branch.kind}:${branch.name}`, branch]),
    );
    expect([...byKey.keys()].sort()).toEqual(
      [
        'local:main',
        'local:docs/extra',
        'local:solo',
        'remote:docs/remote-only',
        `remote:${ODD}`,
        'remote:solo',
      ].sort(),
    );
    expect(byKey.get('local:main')).toMatchObject({
      current: true,
      upstream: 'origin/main',
      ahead: 0,
      behind: 1,
    });
    expect(byKey.get('local:docs/extra')).toMatchObject({
      current: false,
      upstream: 'origin/docs/extra',
      ahead: 1,
      behind: 0,
      subject: 'local only',
    });
    expect(byKey.get('local:solo')).toMatchObject({ upstream: null });
    expect(byKey.get('remote:solo')?.localExists).toBe(true);
    expect(byKey.get(`remote:${ODD}`)).toMatchObject({
      localExists: false,
      subject: `on ${ODD}`,
    });
    expect(byKey.get('remote:docs/remote-only')?.date).toBeGreaterThan(0);
  });

  it('switches local to local on a clean tree and reports it', async () => {
    const { mine } = branchSetup();
    const result = await switchBranch(git, mine, local('docs/extra'), {
      confirmDetached: false,
    });
    expect(result).toMatchObject({
      status: 'ok',
      action: 'switch',
      previous: 'main',
      branch: 'docs/extra',
      created: false,
      localEdits: 0,
    });
    // extra.md, local.md and README.md differ (q.md is only on origin/main)
    expect(result.status === 'ok' && result.files).toBe(3);
    expect(branchOf(mine)).toBe('docs/extra');
    expect(fs.existsSync(path.join(mine, 'docs/datasets/extra.md'))).toBe(true);
  });

  it('dirty, not overlapping: switches and keeps the edit', async () => {
    const { mine } = branchSetup();
    write(mine, 'docs/pipelines/p.md', '# P edited\n');
    const result = await switchBranch(git, mine, local('docs/extra'), {
      confirmDetached: false,
    });
    expect(result).toMatchObject({ status: 'ok', localEdits: 1 });
    expect(result.message).toContain('1 uncommitted local change was kept');
    expect(
      fs.readFileSync(path.join(mine, 'docs/pipelines/p.md'), 'utf8'),
    ).toBe('# P edited\n');
  });

  it('dirty, overlapping: refused with the file named, nothing changed', async () => {
    const { mine } = branchSetup();
    write(mine, 'README.md', '# My edit\n');
    const before = snapshot(mine);
    const result = await switchBranch(git, mine, local('docs/extra'), {
      confirmDetached: false,
    });
    expect(result).toMatchObject({
      status: 'refused',
      reason: 'would-overwrite',
      files: ['README.md'],
    });
    expect(result.message).toContain(
      'commit or stash your changes to README.md',
    );
    expect(snapshot(mine)).toBe(before);
    expect(branchOf(mine)).toBe('main');
  });

  it('untracked file the target would overwrite: refused, named', async () => {
    const { mine } = branchSetup();
    write(mine, 'docs/datasets/extra.md', '# Mine, untracked\n');
    const before = snapshot(mine);
    const result = await switchBranch(git, mine, local('docs/extra'), {
      confirmDetached: false,
    });
    expect(result).toMatchObject({
      status: 'refused',
      reason: 'would-overwrite',
      files: ['docs/datasets/extra.md'],
    });
    expect(result.message).toContain('untracked file docs/datasets/extra.md');
    expect(snapshot(mine)).toBe(before);
  });

  it('remote-only: creates a local branch tracking it', async () => {
    const { mine } = branchSetup();
    const result = await switchBranch(
      git,
      mine,
      remoteTarget('docs/remote-only'),
      { confirmDetached: false },
    );
    expect(result).toMatchObject({
      status: 'ok',
      created: true,
      branch: 'docs/remote-only',
    });
    expect(branchOf(mine)).toBe('docs/remote-only');
    expect(
      sh(mine, 'rev-parse', '--abbrev-ref', 'docs/remote-only@{upstream}'),
    ).toBe('origin/docs/remote-only');
    // And the odd-but-legal name works the same way
    expect(
      await switchBranch(git, mine, remoteTarget(ODD), {
        confirmDetached: false,
      }),
    ).toMatchObject({ status: 'ok', created: true });
    expect(branchOf(mine)).toBe(ODD);
    expect(sh(mine, 'rev-parse', '--abbrev-ref', `${ODD}@{upstream}`)).toBe(
      `origin/${ODD}`,
    );
  });

  it('remote branch with a same-named local one: switches to the local', async () => {
    const { mine } = branchSetup();
    const localSolo = sh(mine, 'rev-parse', 'solo');
    const result = await switchBranch(git, mine, remoteTarget('solo'), {
      confirmDetached: false,
    });
    expect(result).toMatchObject({ status: 'ok', created: false });
    expect(result.message).toContain('may be behind origin/solo');
    expect(sh(mine, 'rev-parse', 'HEAD')).toBe(localSolo);
    expect(
      spawnSync('git', ['rev-parse', '--abbrev-ref', 'solo@{upstream}'], {
        cwd: mine,
        env,
      }).status,
    ).not.toBe(0);
  });

  it('target deleted between list and switch: refused', async () => {
    const { mine } = branchSetup();
    expect((await listOf(mine)).branches.some((b) => b.name === 'solo')).toBe(
      true,
    );
    sh(mine, 'branch', '-q', '-D', 'solo');
    const before = snapshot(mine);
    expect(
      await switchBranch(git, mine, local('solo'), { confirmDetached: false }),
    ).toMatchObject({ status: 'refused', reason: 'no-branch' });
    expect(snapshot(mine)).toBe(before);
  });

  it('already current, merge in progress and index.lock are refused', async () => {
    const { other, mine } = branchSetup();
    expect(
      await switchBranch(git, mine, local('main'), { confirmDetached: false }),
    ).toMatchObject({ status: 'refused', reason: 'already-current' });

    const lock = path.join(mine, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    let before = snapshot(mine);
    expect(
      await switchBranch(git, mine, local('solo'), { confirmDetached: false }),
    ).toMatchObject({ status: 'refused', reason: 'locked' });
    expect(snapshot(mine)).toBe(before);
    expect(fs.existsSync(lock)).toBe(true);
    fs.rmSync(lock);

    push(other, { 'docs/datasets/a.md': '# Theirs\n' }, 'theirs');
    write(mine, 'docs/datasets/a.md', '# Ours\n');
    sh(mine, 'commit', '-q', '-am', 'ours');
    sh(mine, 'fetch', '-q');
    spawnSync('git', ['merge', '-q', 'origin/main'], { cwd: mine, env });
    expect((await repoOf(mine)).operation).toBe('merge');
    before = snapshot(mine);
    expect(
      await switchBranch(git, mine, local('solo'), { confirmDetached: false }),
    ).toMatchObject({ status: 'refused', reason: 'in-progress' });
    expect(snapshot(mine)).toBe(before);
  });

  it('detached HEAD on a branch commit: switching is allowed', async () => {
    const { mine } = branchSetup();
    sh(mine, 'switch', '-q', '--detach', 'main');
    const result = await switchBranch(git, mine, local('docs/extra'), {
      confirmDetached: false,
    });
    expect(result).toMatchObject({ status: 'ok', previous: null });
    expect(branchOf(mine)).toBe('docs/extra');
  });

  it('detached HEAD on a commit no branch has: needs confirmation', async () => {
    const { mine } = branchSetup();
    sh(mine, 'switch', '-q', '--detach', 'main');
    write(mine, 'docs/datasets/lost.md', '# Lost\n');
    sh(mine, 'add', '.');
    sh(mine, 'commit', '-q', '-m', 'on detached');
    const before = snapshot(mine);
    expect(
      await switchBranch(git, mine, local('docs/extra'), {
        confirmDetached: false,
      }),
    ).toMatchObject({ status: 'refused', reason: 'unreachable-head' });
    expect(snapshot(mine)).toBe(before);
    expect(
      await switchBranch(git, mine, local('docs/extra'), {
        confirmDetached: true,
      }),
    ).toMatchObject({ status: 'ok', branch: 'docs/extra' });
  });

  it.skipIf(process.platform === 'win32')(
    'a hostile post-checkout hook does not run',
    async () => {
      const { mine } = branchSetup();
      const marker = path.join(root, `checkout-ran-${counter}`);
      const hook = path.join(mine, '.git', 'hooks', 'post-checkout');
      fs.writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`, {
        mode: 0o755,
      });
      expect(
        await switchBranch(git, mine, local('docs/extra'), {
          confirmDetached: false,
        }),
      ).toMatchObject({ status: 'ok' });
      expect(
        await switchBranch(git, mine, remoteTarget('docs/remote-only'), {
          confirmDetached: false,
        }),
      ).toMatchObject({ status: 'ok' });
      expect(fs.existsSync(marker)).toBe(false);
      // Control: plain git runs it
      sh(mine, 'switch', '-q', 'main');
      expect(fs.existsSync(marker)).toBe(true);
    },
  );

  it('rejects hostile identifiers before git runs', async () => {
    const { mine } = branchSetup();
    const calls: string[][] = [];
    const spy: GitRunner = {
      run: (args, options) => {
        calls.push([...args]);
        return git.run(args, options);
      },
    };
    const before = snapshot(mine);
    for (const name of [
      '--force',
      '-f',
      '--detach',
      '-c',
      '--orphan=x',
      'a\nb',
      'a\0b',
      'refs/heads/../x',
      '@{-1}',
      'HEAD',
    ]) {
      for (const kind of ['local', 'remote'] as const) {
        expect(
          await switchBranch(
            spy,
            mine,
            { kind, name },
            {
              confirmDetached: true,
            },
          ),
        ).toMatchObject({ status: 'refused', reason: 'invalid-branch' });
      }
    }
    expect(calls).toEqual([]);
    // Valid names, but not a branch of the current remote: looked up, refused
    for (const target of [
      local('v1'),
      remoteTarget('v1'),
      remoteTarget('fromother'),
      remoteTarget('upstream/fromother'),
      local('origin/main'),
      local('refs/heads/main'),
    ]) {
      expect(
        await switchBranch(spy, mine, target, { confirmDetached: true }),
      ).toMatchObject({ status: 'refused', reason: 'no-branch' });
    }
    expect(calls.some((args) => args[0] === 'switch')).toBe(false);
    expect(snapshot(mine)).toBe(before);
  });

  it('an option-like ref: git will not create it, and the app will not switch to it', async () => {
    const { mine } = branchSetup();
    expect(
      spawnSync('git', ['branch', '--', '--force'], { cwd: mine, env }).status,
    ).not.toBe(0);
    // Planted behind git's back: listed, but never handed to git
    sh(mine, 'update-ref', 'refs/heads/-x', 'HEAD');
    expect((await listOf(mine)).branches.some((b) => b.name === '-x')).toBe(
      true,
    );
    const before = snapshot(mine);
    expect(
      await switchBranch(git, mine, local('-x'), { confirmDetached: false }),
    ).toMatchObject({ status: 'refused', reason: 'invalid-branch' });
    expect(snapshot(mine)).toBe(before);
  });
});
