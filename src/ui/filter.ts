import { normaliseName } from '../indexer/names';

/**
 * Lower case without accents, with spaces, hyphens and underscores made
 * equivalent, so `cao` finds `Ção` and `hierarquia soa` finds
 * `RCD_HIERARQUIA_SOA`. The same rule the indexer uses to match names.
 */
export const fold = normaliseName;

/** True when the query is empty or is part of any of the texts. */
export function matchesFilter(query: string, texts: string[]): boolean {
  const wanted = fold(query.trim());
  if (wanted === '') return true;
  return texts.some((text) => fold(text).includes(wanted));
}
