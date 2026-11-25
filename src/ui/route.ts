export type Route =
  { view: 'home' } | { view: 'doc'; file: string; anchor: string | null };

const DOC_PREFIX = '#/doc/';

/** Reads `#/doc/<file>[#anchor]`; anything else is the landing view. */
export function parseHash(hash: string): Route {
  if (!hash.startsWith(DOC_PREFIX)) return { view: 'home' };
  const rest = hash.slice(DOC_PREFIX.length);
  const cut = rest.indexOf('#');
  const rawFile = cut === -1 ? rest : rest.slice(0, cut);
  const rawAnchor = cut === -1 ? '' : rest.slice(cut + 1);
  const file = safeDecode(rawFile);
  if (file === '') return { view: 'home' };
  const anchor = safeDecode(rawAnchor);
  return { view: 'doc', file, anchor: anchor === '' ? null : anchor };
}

export function docHash(file: string, anchor: string | null = null): string {
  // Paths keep their slashes so the address bar stays readable
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return `${DOC_PREFIX}${encoded}${anchor === null ? '' : `#${encodeURIComponent(anchor)}`}`;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
