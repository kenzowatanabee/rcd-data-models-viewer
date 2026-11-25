export type DocPathResult =
  { ok: true; file: string } | { ok: false; status: 400; error: string };

/**
 * Checks a repo-relative path asked for by the browser and returns it in a
 * canonical `a/b/c.md` form. Pure: whether the file exists, and where a
 * symlink leads, are checked by the caller.
 */
export function validateDocPath(file: string | null): DocPathResult {
  const bad = (error: string): DocPathResult => ({
    ok: false,
    status: 400,
    error,
  });
  if (file === null || file.trim() === '') return bad('file is required');
  if (file.includes('\0')) return bad('invalid file');
  // Backslashes would be separators on Windows; links in the docs never use them
  if (file.includes('\\')) return bad('use forward slashes');
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file)) {
    return bad('path must be relative to the docs repo');
  }
  const segments = file
    .split('/')
    .filter((part) => part !== '' && part !== '.');
  if (segments.includes('..'))
    return bad('path must stay inside the docs repo');
  // Case-insensitive because the owner's file system (Windows) is
  if (segments.some((part) => part.toLowerCase() === '.git')) {
    return bad('.git is not viewable');
  }
  const last = segments[segments.length - 1];
  if (last === undefined || !last.toLowerCase().endsWith('.md')) {
    return bad('only Markdown files are viewable');
  }
  return { ok: true, file: segments.join('/') };
}
