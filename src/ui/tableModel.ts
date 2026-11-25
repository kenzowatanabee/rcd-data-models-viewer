import { fold } from './filter';

/** Tables with more body rows than this get a filter box. */
export const FILTER_THRESHOLD = 12;

/**
 * Which rows to show for `query`: the same matching as the sidebar filter
 * (case, accents and separators ignored), against the whole row's text.
 */
export function rowMatches(query: string, rowText: string): boolean {
  const wanted = fold(query.trim());
  return wanted === '' || fold(rowText).includes(wanted);
}

export function countMatches(query: string, rowTexts: string[]): number {
  return rowTexts.filter((text) => rowMatches(query, text)).length;
}

/** "1,174,156", "91 585 965", "-3.5", "42 %", "0.25"; not "2026-11-23". */
const NUMBER =
  /^[-+\u2212]?(?:\d{1,3}(?:[,\s\u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)?\s?%?$/;
const EMPTY = /^(?:|-|—|–|n\/a)$/i;

/**
 * Columns whose body cells are all numbers (blanks and dashes aside), with
 * at least two of them, so a lone "1" in a notes column does not flip it.
 */
export function numericColumns(
  rows: readonly (readonly string[])[],
): boolean[] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const result: boolean[] = [];
  for (let column = 0; column < width; column += 1) {
    let numbers = 0;
    let other = 0;
    for (const row of rows) {
      const cell = (row[column] ?? '').trim();
      if (EMPTY.test(cell)) continue;
      if (NUMBER.test(cell)) numbers += 1;
      else other += 1;
    }
    result.push(numbers >= 2 && other === 0);
  }
  return result;
}

/** Which edges of a horizontally scrolling box hide content. */
export function clippedEdges(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): { left: boolean; right: boolean } {
  // Sub-pixel widths at some zoom levels leave a 1px "overflow"
  const slack = 1;
  return {
    left: scrollLeft > slack,
    right: scrollLeft + clientWidth < scrollWidth - slack,
  };
}
