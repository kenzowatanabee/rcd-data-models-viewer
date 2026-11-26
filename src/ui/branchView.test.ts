import { describe, expect, it } from 'vitest';

import type { BranchInfo, BranchList } from '../desktop/gitTypes';
import {
  branchGroups,
  branchLabel,
  branchMatches,
  branchNotes,
} from './branchView';
import { branchItems, commandItems } from './paletteItems';

const branch = (over: Partial<BranchInfo>): BranchInfo => ({
  kind: 'local',
  name: 'main',
  current: false,
  upstream: 'origin/main',
  upstreamGone: false,
  ahead: 0,
  behind: 0,
  date: 0,
  subject: '',
  localExists: true,
  ...over,
});

const LIST: BranchList = {
  remote: 'origin',
  current: 'main',
  truncated: false,
  lastFetch: null,
  branches: [
    branch({ name: 'main', current: true }),
    branch({ name: 'docs/health-fixes-and-viewer', behind: 2 }),
    branch({
      kind: 'remote',
      name: 'docs/new-model',
      upstream: null,
      localExists: false,
    }),
  ],
};

describe('branch picker', () => {
  it('matches every word, folding case and separators', () => {
    expect(branchMatches('docs/health-fixes-and-viewer', 'HEALTH view')).toBe(
      true,
    );
    expect(branchMatches('docs/health-fixes', 'health model')).toBe(false);
    expect(branchMatches('anything', '  ')).toBe(true);
  });

  it('groups local and remote, dropping empty groups', () => {
    expect(
      branchGroups(LIST, '').map((group) => [
        group.title,
        group.branches.length,
      ]),
    ).toEqual([
      ['Local', 2],
      ['On origin', 1],
    ]);
    expect(branchGroups(LIST, 'model').map((group) => group.id)).toEqual([
      'remote',
    ]);
    expect(branchGroups(LIST, 'nothing')).toEqual([]);
  });

  it('notes and labels', () => {
    expect(branchNotes(LIST.branches[0] as BranchInfo)).toEqual(['current']);
    expect(branchNotes(LIST.branches[2] as BranchInfo)).toEqual([
      'not checked out',
    ]);
    expect(branchNotes(branch({ upstream: null }))).toEqual(['no upstream']);
    expect(branchLabel(LIST.branches[1] as BranchInfo, '2 days ago')).toBe(
      'docs/health-fixes-and-viewer, 2 behind, last commit 2 days ago',
    );
  });

  it('quick open: branches as results, the current one left out', () => {
    const items = branchItems(LIST.branches, 'origin');
    expect(items.map((item) => [item.id, item.kind, item.meta])).toEqual([
      ['branch:local:docs/health-fixes-and-viewer', 'branch', 'local'],
      ['branch:remote:docs/new-model', 'branch', 'on origin'],
    ]);
  });

  it('quick open: "Switch branch…" only in the desktop app', () => {
    const context = {
      section: 'docs' as const,
      file: null,
      node: null,
      nodeFile: null,
      sidebarCollapsed: false,
    };
    const ids = (canSwitchBranch: boolean) =>
      commandItems({ ...context, canSwitchBranch }).map((item) => item.id);
    expect(ids(true)).toContain('command:switch-branch');
    expect(ids(false)).not.toContain('command:switch-branch');
  });
});
