/**
 * Remembers where each doc page was scrolled to, per tab history entry (see
 * tabsModel.ts), so back and forward return to the same place and restored
 * tabs reopen where they were left.
 */

const positions = new Map<string, number>();

export const rememberScroll = (key: string, top: number) => {
  positions.set(key, top);
};

export const recalledScroll = (key: string) => positions.get(key);
