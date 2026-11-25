/** Lower case without accents, so `cao` finds `Ção`. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** True when the query is empty or is part of any of the texts. */
export function matchesFilter(query: string, texts: string[]): boolean {
  const wanted = fold(query.trim());
  if (wanted === '') return true;
  return texts.some((text) => fold(text).includes(wanted));
}
