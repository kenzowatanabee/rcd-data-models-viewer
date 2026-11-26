// What the branch picker shows: filtering, grouping and badges. Pure.
import type { BranchInfo, BranchList } from '../desktop/gitTypes';
import { foldWithMap, queryTokens } from './quickMatch';

export interface BranchGroup {
  id: 'local' | 'remote';
  title: string;
  branches: BranchInfo[];
}

/** Every query word must appear in the name (case and accents folded). */
export function branchMatches(name: string, query: string): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return true;
  const folded = foldWithMap(name).text;
  return tokens.every((token) => folded.includes(token));
}

/** "Local" then "On <remote>", filtered; empty groups are dropped. */
export function branchGroups(list: BranchList, query: string): BranchGroup[] {
  const shown = list.branches.filter((branch) =>
    branchMatches(branch.name, query),
  );
  const groups: BranchGroup[] = [
    {
      id: 'local',
      title: 'Local',
      branches: shown.filter((branch) => branch.kind === 'local'),
    },
    {
      id: 'remote',
      title: `On ${list.remote ?? 'the remote'}`,
      branches: shown.filter((branch) => branch.kind === 'remote'),
    },
  ];
  return groups.filter((group) => group.branches.length > 0);
}

/** Short notes after a branch's name. */
export function branchNotes(branch: BranchInfo): string[] {
  const notes: string[] = [];
  if (branch.current) notes.push('current');
  if (branch.kind === 'remote') {
    notes.push(
      branch.localExists ? 'a local branch has this name' : 'not checked out',
    );
  } else if (branch.upstream === null) {
    notes.push('no upstream');
  } else if (branch.upstreamGone) {
    notes.push('upstream gone');
  }
  return notes;
}

/** What a row says to screen readers, in one line. */
export function branchLabel(branch: BranchInfo, when: string): string {
  const parts = [branch.name, ...branchNotes(branch)];
  if ((branch.behind ?? 0) > 0) parts.push(`${branch.behind} behind`);
  if ((branch.ahead ?? 0) > 0) parts.push(`${branch.ahead} ahead`);
  parts.push(`last commit ${when}`);
  return parts.join(', ');
}
