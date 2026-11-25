export type LinkTarget =
  /** A Markdown file in the docs repo, shown in the viewer. */
  | { kind: 'doc'; file: string; anchor: string | null }
  /** A heading in the current doc. */
  | { kind: 'anchor'; anchor: string }
  | { kind: 'external'; href: string }
  /** Something in the docs repo the viewer cannot show (a folder, a JSON file). */
  | { kind: 'repo-file'; file: string }
  /** Points outside the repo, or is not a link the viewer understands. */
  | { kind: 'inert'; href: string };

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Resolves a link written in `currentFile` (a repo-relative path) the way
 * GitHub would: relative to the file's folder, or to the repo root when it
 * starts with `/`.
 */
export function resolveLink(currentFile: string, href: string): LinkTarget {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return { kind: 'external', href: trimmed };
  }
  // Any other scheme (javascript:, file:, ...) or a protocol-relative URL
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    return { kind: 'inert', href: trimmed };
  }

  const hashAt = trimmed.indexOf('#');
  const pathPart = (hashAt === -1 ? trimmed : trimmed.slice(0, hashAt)).replace(
    /\?.*$/,
    '',
  );
  const anchorText = hashAt === -1 ? '' : safeDecode(trimmed.slice(hashAt + 1));
  const anchor = anchorText === '' ? null : anchorText;

  if (pathPart === '') {
    return anchor === null
      ? { kind: 'inert', href: trimmed }
      : { kind: 'anchor', anchor };
  }

  const base = pathPart.startsWith('/')
    ? []
    : currentFile.split('/').slice(0, -1);
  const segments = [...base];
  for (const part of safeDecode(pathPart).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return { kind: 'inert', href: trimmed };
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  const file = segments.join('/');
  if (file === '') return { kind: 'repo-file', file: '.' };
  const isFolder = pathPart.endsWith('/');
  if (!isFolder && file.toLowerCase().endsWith('.md')) {
    return { kind: 'doc', file, anchor };
  }
  return { kind: 'repo-file', file: isFolder ? `${file}/` : file };
}
