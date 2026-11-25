/**
 * Remembers where each doc page was scrolled to, per history entry, so back
 * and forward return to the same place. Each entry gets a key in
 * `history.state` the first time a doc is shown in it; an entry without one
 * is a fresh navigation.
 */

const STATE_KEY = 'docScroll';

/** The scroll key stored in a history state, if any. */
export function scrollKeyOf(state: unknown): string | null {
  if (state === null || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[STATE_KEY];
  return typeof value === 'string' ? value : null;
}

/** `state` with the key added, keeping whatever else it holds. */
export function withScrollKey(state: unknown, key: string): object {
  const base =
    state !== null && typeof state === 'object'
      ? (state as Record<string, unknown>)
      : {};
  return { ...base, [STATE_KEY]: key };
}

let counter = 0;
const positions = new Map<string, number>();

export function newScrollKey(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export const rememberScroll = (key: string, top: number) => {
  positions.set(key, top);
};

export const recalledScroll = (key: string) => positions.get(key);
