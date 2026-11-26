// The branch switcher's pure rules: parsing the ref list, checking branch
// names, and deciding whether a switch may run. No Node imports: ipc.ts and
// the page use the name check too.

import type {
  BranchInfo,
  BranchList,
  BranchTarget,
  GitRefusal,
  RepoStatus,
} from './gitTypes';

/** Most branches the picker shows; the current one is always among them. */
export const BRANCH_LIMIT = 200;
/** Longest branch name accepted from the page. */
export const MAX_BRANCH_NAME = 250;
const MAX_SUBJECT = 120;

/**
 * `git for-each-ref --format`: NUL between fields and after the last one,
 * then git's own newline. Ref names cannot hold NUL, newlines or other
 * control characters, and a subject cannot hold NUL, so a record always
 * ends at the first NUL-newline after its sixth field.
 */
export const REF_FORMAT = [
  '%(refname)',
  '%(symref)',
  '%(upstream)',
  '%(upstream:track,nobracket)',
  '%(HEAD)',
  '%(committerdate:unix)',
  '%(contents:subject)',
]
  .map((field) => `${field}%00`)
  .join('');

export interface RefRecord {
  ref: string;
  symref: string;
  upstream: string;
  track: string;
  head: boolean;
  /** Seconds since the epoch, or null when git gave none. */
  date: number | null;
  subject: string;
}

export function parseRefList(output: string): RefRecord[] {
  const records: RefRecord[] = [];
  for (const record of output.split('\0\n')) {
    const fields = record.split('\0');
    if (fields.length !== 7) continue;
    const [ref = '', symref = '', upstream = '', track = '', head = ''] =
      fields;
    const seconds = Number(fields[5]);
    records.push({
      ref,
      symref,
      upstream,
      track,
      head: head === '*',
      date: fields[5] !== '' && Number.isFinite(seconds) ? seconds : null,
      subject: fields[6] ?? '',
    });
  }
  return records;
}

/** `ahead 1, behind 2`, `behind 3`, `gone` or empty (in sync). */
export function parseTrack(track: string): {
  ahead: number;
  behind: number;
  gone: boolean;
} {
  if (track === 'gone') return { ahead: 0, behind: 0, gone: true };
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return {
    ahead: ahead === null ? 0 : Number(ahead[1]),
    behind: behind === null ? 0 : Number(behind[1]),
    gone: false,
  };
}

/**
 * Why `name` is not a branch name the app will hand to git, or null. The
 * rules of `git check-ref-format --branch`, plus: no leading `-` (it would
 * read as an option), no `HEAD`, and a length limit.
 */
export function branchNameProblem(name: string): string | null {
  if (name === '') return 'The branch name is empty.';
  if (name.length > MAX_BRANCH_NAME) return 'The branch name is too long.';
  if (name.startsWith('-')) return 'A branch name cannot start with "-".';
  if (name === 'HEAD' || name === '@') return `"${name}" is not a branch.`;
  // Control characters (newline, NUL...), space and git's special characters
  if (/[\u0000- \u007f~^:?*[\\]/.test(name)) {
    return 'The branch name has a character git does not allow.';
  }
  if (name.includes('..') || name.includes('@{') || name.includes('//')) {
    return 'The branch name has a sequence git does not allow.';
  }
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.')) {
    return 'The branch name cannot start or end that way.';
  }
  for (const part of name.split('/')) {
    if (part.startsWith('.') || part.endsWith('.lock')) {
      return 'A part of the branch name starts with "." or ends with ".lock".';
    }
  }
  return null;
}

const shortSubject = (subject: string) =>
  subject.length > MAX_SUBJECT
    ? `${subject.slice(0, MAX_SUBJECT - 1)}…`
    : subject;

export interface Branches {
  list: BranchList;
  /** Every branch on the remote (tracked or not), for the lookup. */
  remoteNames: ReadonlySet<string>;
  /** Every local branch, uncapped. */
  localNames: ReadonlySet<string>;
}

/**
 * Local branches, and the remote's branches that no local branch tracks.
 * Anything else (tags, stashes, `<remote>/HEAD`, other remotes) is left out.
 */
export function buildBranches(
  records: readonly RefRecord[],
  remote: string | null,
  lastFetch: number | null,
  limit = BRANCH_LIMIT,
): Branches {
  const remotePrefix = remote === null ? null : `refs/remotes/${remote}/`;
  const locals: BranchInfo[] = [];
  const remotes: { name: string; ref: string; record: RefRecord }[] = [];
  const tracked = new Set<string>();
  for (const record of records) {
    if (record.ref.startsWith('refs/heads/')) {
      const name = record.ref.slice('refs/heads/'.length);
      const track = parseTrack(record.track);
      const hasUpstream = record.upstream !== '';
      if (hasUpstream) tracked.add(record.upstream);
      locals.push({
        kind: 'local',
        name,
        current: record.head,
        upstream: hasUpstream
          ? record.upstream.replace(/^refs\/(remotes|heads)\//, '')
          : null,
        upstreamGone: hasUpstream && track.gone,
        ahead: hasUpstream && !track.gone ? track.ahead : null,
        behind: hasUpstream && !track.gone ? track.behind : null,
        date: record.date === null ? null : record.date * 1000,
        subject: shortSubject(record.subject),
        localExists: true,
      });
    } else if (
      remotePrefix !== null &&
      record.ref.startsWith(remotePrefix) &&
      record.symref === ''
    ) {
      const name = record.ref.slice(remotePrefix.length);
      if (name !== 'HEAD' && name !== '') {
        remotes.push({ name, ref: record.ref, record });
      }
    }
  }
  const localNames = new Set(locals.map((branch) => branch.name));
  const remoteOnly: BranchInfo[] = remotes
    .filter((entry) => !tracked.has(entry.ref))
    .map(({ name, record }) => ({
      kind: 'remote',
      name,
      current: false,
      upstream: null,
      upstreamGone: false,
      ahead: null,
      behind: null,
      date: record.date === null ? null : record.date * 1000,
      subject: shortSubject(record.subject),
      localExists: localNames.has(name),
    }));
  const byDate = (a: BranchInfo, b: BranchInfo) =>
    (b.date ?? 0) - (a.date ?? 0) || a.name.localeCompare(b.name);
  locals.sort((a, b) =>
    a.current !== b.current ? (a.current ? -1 : 1) : byDate(a, b),
  );
  remoteOnly.sort(byDate);
  const all = [...locals, ...remoteOnly];
  const kept = all.slice(0, limit);
  return {
    list: {
      remote,
      branches: kept,
      truncated: all.length > kept.length,
      lastFetch,
      current: locals.find((branch) => branch.current)?.name ?? null,
    },
    remoteNames: new Set(remotes.map((entry) => entry.name)),
    localNames,
  };
}

export type SwitchPlan =
  | { mode: 'local'; branch: string; behindNote: boolean }
  | { mode: 'track'; branch: string; start: string; upstream: string };

export type SwitchDecision =
  | { ok: true; plan: SwitchPlan }
  | { ok: false; reason: GitRefusal; message: string };

export interface SwitchInput {
  target: BranchTarget;
  repo: Pick<RepoStatus, 'branch' | 'operation' | 'locked' | 'head'>;
  branches: Pick<Branches, 'remoteNames' | 'localNames'>;
  remote: string | null;
  /** On a detached HEAD: whether a branch contains HEAD's commit. */
  headReachable: boolean | null;
  confirmDetached: boolean;
}

const OPERATION_NAMES = {
  merge: 'A merge',
  rebase: 'A rebase',
  'cherry-pick': 'A cherry-pick',
  revert: 'A revert',
  bisect: 'A bisect',
} as const;

const no = (reason: GitRefusal, message: string): SwitchDecision => ({
  ok: false,
  reason,
  message,
});

/** Whether a switch may run, and how; checked against a fresh ref list. */
export function switchDecision(input: SwitchInput): SwitchDecision {
  const { target, repo, branches, remote } = input;
  const problem = branchNameProblem(target.name);
  if (problem !== null) return no('invalid-branch', problem);
  if (repo.operation !== null) {
    return no(
      'in-progress',
      `${OPERATION_NAMES[repo.operation]} is in progress. Finish or abort it with your usual git tool, then switch.`,
    );
  }
  if (repo.locked) {
    return no(
      'locked',
      'Another git program is working in this repository. Wait for it to finish, then try again.',
    );
  }
  let plan: SwitchPlan;
  if (target.kind === 'local') {
    if (!branches.localNames.has(target.name)) {
      return no(
        'no-branch',
        `The branch ${target.name} no longer exists. The list was refreshed.`,
      );
    }
    plan = { mode: 'local', branch: target.name, behindNote: false };
  } else {
    if (remote === null || !branches.remoteNames.has(target.name)) {
      return no(
        'no-branch',
        `${remote ?? 'The remote'} has no branch ${target.name} as of the last fetch. The list was refreshed.`,
      );
    }
    plan = branches.localNames.has(target.name)
      ? { mode: 'local', branch: target.name, behindNote: true }
      : {
          mode: 'track',
          branch: target.name,
          start: `refs/remotes/${remote}/${target.name}`,
          upstream: `${remote}/${target.name}`,
        };
  }
  if (repo.branch === plan.branch) {
    return no('already-current', `${plan.branch} is already checked out.`);
  }
  if (
    repo.branch === null &&
    repo.head !== null &&
    input.headReachable === false &&
    !input.confirmDetached
  ) {
    return no(
      'unreachable-head',
      `No branch contains the commit you are on (${repo.head}, a detached HEAD). After switching it will be reachable only through git's reflog. Create a branch for it with your usual git tool first, or confirm to switch anyway.`,
    );
  }
  return { ok: true, plan };
}

/** Files a switch refused to touch, from git's message (LC_ALL=C). */
export function switchBlockers(stderr: string): {
  tracked: string[];
  untracked: string[];
} {
  const tracked: string[] = [];
  const untracked: string[] = [];
  let into: string[] | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    if (
      /local changes to the following files would be overwritten/.test(line)
    ) {
      into = tracked;
    } else if (
      /untracked working tree files would be (overwritten|removed)/.test(line)
    ) {
      into = untracked;
    } else if (into !== null && line.startsWith('\t')) {
      into.push(line.slice(1));
    } else {
      into = null;
    }
  }
  return { tracked: [...new Set(tracked)], untracked: [...new Set(untracked)] };
}

/** A switch refusal's advice, naming the files (at most a few). */
export function blockedMessage(
  branch: string,
  blockers: { tracked: string[]; untracked: string[] },
): string {
  const list = (files: string[]) =>
    files.length <= 3
      ? files.join(', ')
      : `${files.slice(0, 3).join(', ')} and ${files.length - 3} more`;
  const steps: string[] = [];
  if (blockers.tracked.length > 0) {
    steps.push(`commit or stash your changes to ${list(blockers.tracked)}`);
  }
  if (blockers.untracked.length > 0) {
    steps.push(
      `move, rename or commit the untracked ${blockers.untracked.length === 1 ? 'file' : 'files'} ${list(blockers.untracked)}`,
    );
  }
  const advice = steps.join(', and ');
  return `Switching to ${branch} would overwrite local work, so nothing was changed. With your usual git tool, ${advice}, then try again.`;
}
