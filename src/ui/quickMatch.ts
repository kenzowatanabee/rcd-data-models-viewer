/**
 * The quick-open matcher: token based, folding case, accents and separators
 * the way the indexer's `normaliseName` does, and keeping a map back to the
 * original text so matched characters can be highlighted.
 */

export interface Folded {
  /** Lower case, accents and `*`/backtick dropped, separator runs as `_`. */
  text: string;
  /** Index in the original text of each character of `text`. */
  map: number[];
  /** Indices in `text` where a word starts. */
  starts: number[];
}

const SEPARATOR = /[\s\-_]/;
const DROPPED = /[`*]/;
/** Word boundaries besides separators: paths, dots, brackets and the like. */
const BOUNDARY = /[^\p{L}\p{N}]/u;

export function foldWithMap(original: string): Folded {
  let text = '';
  const map: number[] = [];
  const starts: number[] = [];
  let index = 0;
  for (const char of original) {
    const at = index;
    index += char.length;
    if (DROPPED.test(char)) continue;
    if (SEPARATOR.test(char)) {
      if (!text.endsWith('_')) {
        text += '_';
        map.push(at);
      }
      continue;
    }
    const plain = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const part of plain) {
      const previous = text[text.length - 1];
      if (
        !BOUNDARY.test(part) &&
        (previous === undefined || BOUNDARY.test(previous))
      ) {
        starts.push(text.length);
      }
      text += part;
      map.push(at);
    }
  }
  return { text, map, starts };
}

/** Query tokens: folded words, any separator splitting them. */
export function queryTokens(query: string): string[] {
  return foldWithMap(query)
    .text.split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== '');
}

/** Where a field sits: the name beats aliases, which beat paths and headings. */
export type Tier = 0 | 1 | 2;

export interface Field {
  text: string;
  tier: Tier;
  folded: Folded;
}

export const field = (text: string, tier: Tier): Field => ({
  text,
  tier,
  folded: foldWithMap(text),
});

/** 0 a whole word, 1 a word prefix, 2 a substring, 3 a subsequence. */
type Kind = 0 | 1 | 2 | 3;

interface TokenHit {
  kind: Kind;
  /** Positions in the folded text. */
  at: number[];
  /** Characters skipped inside a subsequence; 0 otherwise. */
  gaps: number;
}

/** Exact words and prefixes are one class, then substrings, subsequences. */
const classOf = (kind: Kind) => (kind === 0 ? 0 : kind - 1);

const range = (from: number, length: number) =>
  Array.from({ length }, (_, i) => from + i);

function matchToken(token: string, folded: Folded): TokenHit | null {
  const { text, starts } = folded;
  let prefix: number | null = null;
  for (const start of starts) {
    if (!text.startsWith(token, start)) continue;
    const end = start + token.length;
    const next = text[end];
    if (next === undefined || BOUNDARY.test(next)) {
      return { kind: 0, at: range(start, token.length), gaps: 0 };
    }
    prefix ??= start;
  }
  if (prefix !== null) {
    return { kind: 1, at: range(prefix, token.length), gaps: 0 };
  }
  const inside = text.indexOf(token);
  if (inside !== -1) {
    return { kind: 2, at: range(inside, token.length), gaps: 0 };
  }
  // A subsequence must start a word
  if (token.length < 2) return null;
  for (const start of starts) {
    if (text[start] !== token[0]) continue;
    const at = [start];
    let cursor = start + 1;
    for (const char of token.slice(1)) {
      // Each letter continues the run or starts a later word: `rsr` and
      // `sortrec` count, a scatter of inner letters does not
      const found =
        text[cursor] === char
          ? cursor
          : starts.find((word) => word >= cursor && text[word] === char);
      if (found === undefined) break;
      at.push(found);
      cursor = found + 1;
    }
    if (at.length === token.length) {
      const last = at[at.length - 1] ?? start;
      return { kind: 3, at, gaps: last - start + 1 - token.length };
    }
  }
  return null;
}

export interface FieldHighlight {
  /** Index of the field in the candidate's list. */
  field: number;
  /** Matched character indices in the field's original text. */
  at: number[];
}

export interface MatchResult {
  /** Sort key; lower is better. Compare with `compareMatches`. */
  key: number[];
  highlights: FieldHighlight[];
}

/**
 * Scores one candidate against the query tokens, or null when a token
 * matches none of its fields. Each token takes its best field, so tokens
 * may match in any order and in different fields.
 */
export function matchFields(
  tokens: string[],
  whole: string,
  fields: readonly Field[],
): MatchResult | null {
  if (tokens.length === 0) return null;
  let worstKind = 0;
  let worstTier = 0;
  let total = 0;
  let firstAt = Infinity;
  const marks = new Map<number, Set<number>>();
  for (const token of tokens) {
    let best: { hit: TokenHit; index: number; tier: Tier } | null = null;
    for (const [index, candidate] of fields.entries()) {
      const hit = matchToken(token, candidate.folded);
      if (hit === null) continue;
      // Word matches in any field beat substrings, then the field's tier
      const klass = classOf(hit.kind);
      const bestClass = best === null ? 9 : classOf(best.hit.kind);
      const better =
        best === null ||
        klass < bestClass ||
        (klass === bestClass &&
          (candidate.tier < best.tier ||
            (candidate.tier === best.tier && hit.kind < best.hit.kind)));
      if (better) best = { hit, index, tier: candidate.tier };
    }
    if (best === null) return null;
    const { hit, index, tier } = best;
    worstKind = Math.max(worstKind, classOf(hit.kind));
    worstTier = Math.max(worstTier, tier);
    total += hit.kind * 10 + hit.gaps;
    if (tier === 0) firstAt = Math.min(firstAt, hit.at[0] ?? 0);
    const folded = fields[index]?.folded;
    const set = marks.get(index) ?? new Set<number>();
    for (const at of hit.at) {
      const original = folded?.map[at];
      if (original !== undefined) set.add(original);
    }
    marks.set(index, set);
  }
  const primary = fields.find((candidate) => candidate.tier === 0);
  // How much of the name the query covers: `pos base` is more of
  // RCD_POS_BASE than of pos-base-dataflow.md
  const primaryIndex = primary === undefined ? -1 : fields.indexOf(primary);
  const covered = marks.get(primaryIndex)?.size ?? 0;
  const coverage =
    primary === undefined || primary.folded.text.length === 0
      ? 0
      : covered / primary.folded.text.length;
  const exact = fields.some(
    (candidate) => candidate.tier < 2 && candidate.folded.text === whole,
  );
  return {
    key: [
      exact ? 0 : 1,
      worstKind,
      worstTier,
      total,
      -Math.round(coverage * 1000),
      firstAt === Infinity ? 999 : firstAt,
      primary?.text.length ?? 999,
    ],
    highlights: [...marks].map(([index, set]) => ({
      field: index,
      at: [...set].sort((a, b) => a - b),
    })),
  };
}

export function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface Candidate {
  id: string;
  /** Shown name; also the final tie-break, so results are stable. */
  label: string;
  fields: readonly Field[];
}

export interface Ranked<T extends Candidate> {
  item: T;
  match: MatchResult;
}

/** All candidates that match the query, best first. */
export function rankCandidates<T extends Candidate>(
  query: string,
  candidates: readonly T[],
): Ranked<T>[] {
  const tokens = queryTokens(query);
  const whole = foldWithMap(query.trim()).text;
  const ranked: Ranked<T>[] = [];
  for (const item of candidates) {
    const match = matchFields(tokens, whole, item.fields);
    if (match !== null) ranked.push({ item, match });
  }
  return ranked.sort(
    (a, b) =>
      compareKeys(a.match.key, b.match.key) ||
      a.item.label.localeCompare(b.item.label) ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
}

export interface TextPart {
  text: string;
  hit: boolean;
}

/** `text` split into runs of matched and unmatched characters. */
export function highlightParts(text: string, at: readonly number[]) {
  const hits = new Set(at);
  const parts: TextPart[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const hit = hits.has(i);
    const last = parts[parts.length - 1];
    if (last !== undefined && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i] ?? '', hit });
  }
  return parts;
}
