// Clone URL checks, folder names and credential scrubbing. Pure and free of
// Node imports: the page uses the same checks to validate as you type, and
// the main process checks again before git runs.

/** Hosts a clone may come from. */
export const CLONE_HOSTS = ['github.com'] as const;

/** Shown as a suggestion in the clone dialog, never used on its own. */
export const SUGGESTED_CLONE_URL =
  'https://github.com/kenzowatanabee/rcd-data-models';

export interface CloneSource {
  /** The canonical URL handed to git. */
  url: string;
  /** The folder name proposed for the clone. */
  name: string;
  kind: 'https' | 'ssh';
}

export type CloneUrlCheck =
  ({ ok: true } & CloneSource) | { ok: false; reason: string };

const MAX_URL = 2048;
// GitHub's own rules: owner is letters, digits and single hyphens, not first
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SCP = /^git@github\.com:([^/]+)\/([^/]+)$/;

const fail = (reason: string): CloneUrlCheck => ({ ok: false, reason });

function ownerRepo(owner: string, repoPart: string): CloneUrlCheck | null {
  const repo = repoPart.replace(/\.git$/, '');
  if (!OWNER.test(owner)) return fail(`"${owner}" is not a GitHub owner name`);
  if (
    !REPO.test(repo) ||
    repo === '.' ||
    repo === '..' ||
    repo.startsWith('-')
  ) {
    return fail(`"${repoPart}" is not a GitHub repository name`);
  }
  return null;
}

/**
 * Accepts `https://github.com/owner/repo[.git]` and
 * `git@github.com:owner/repo[.git]` only. Everything else (other hosts,
 * other schemes such as `file://` and `ext::`, local paths, anything that
 * could be read as a git option, URLs carrying credentials) is refused.
 */
export function parseCloneUrl(input: string): CloneUrlCheck {
  const text = input.trim();
  if (text === '') return fail('Enter the repository URL');
  if (text.length > MAX_URL) return fail('That URL is too long');
  if (text.startsWith('-')) return fail('A URL cannot start with "-"');
  if (text.includes('::')) {
    return fail('Only https:// and git@github.com: URLs are allowed');
  }

  if (/[\s\x00-\x1f\x7f]/.test(text)) {
    return fail('A URL cannot contain spaces or control characters');
  }
  const scp = SCP.exec(text);
  if (scp !== null) {
    const [, owner = '', repoPart = ''] = scp;
    const problem = ownerRepo(owner, repoPart);
    if (problem !== null) return problem;
    const name = repoPart.replace(/\.git$/, '');
    return {
      ok: true,
      kind: 'ssh',
      name,
      url: `git@github.com:${owner}/${name}.git`,
    };
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*@/.test(text)) {
    return fail(`SSH URLs must be git@${CLONE_HOSTS.join(', ')}:owner/repo`);
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail('Enter a URL like https://github.com/owner/repo');
  }
  if (url.protocol !== 'https:') {
    return fail('Only https:// and git@github.com: URLs are allowed');
  }
  if (url.username !== '' || url.password !== '' || text.includes('@')) {
    return fail(
      'Remove the user name or token from the URL: git signs in with your own credential manager',
    );
  }
  if (!(CLONE_HOSTS as readonly string[]).includes(url.hostname)) {
    return fail(`Only ${CLONE_HOSTS.join(', ')} repositories can be cloned`);
  }
  if (url.port !== '') return fail('A URL with a port is not allowed');
  if (url.search !== '' || url.hash !== '' || text.includes('?')) {
    return fail('Remove the ? or # part of the URL');
  }
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  if (parts.length !== 2) {
    return fail('The URL must name the owner and the repository: /owner/repo');
  }
  const [owner = '', repoPart = ''] = parts;
  const problem = ownerRepo(owner, repoPart);
  if (problem !== null) return problem;
  const name = repoPart.replace(/\.git$/, '');
  return {
    ok: true,
    kind: 'https',
    name,
    url: `https://${url.hostname}/${owner}/${name}.git`,
  };
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Null when `name` is safe as one new folder name on every OS, else why. */
export function folderNameProblem(name: string): string | null {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) {
    return 'The folder name may only use letters, digits, ".", "_" and "-"';
  }
  if (name.startsWith('.') || name.startsWith('-')) {
    return 'The folder name cannot start with "." or "-"';
  }
  if (name.endsWith('.')) return 'The folder name cannot end with "."';
  if (WINDOWS_RESERVED.test(name)) return `"${name}" is reserved on Windows`;
  return null;
}

/** A remote URL fit to show: any user name and password removed. */
export function displayRemoteUrl(url: string): string {
  return scrubCredentials(
    url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1'),
  );
}

const MAX_DETAIL = 2000;

/**
 * Removes anything that looks like a credential from git output before it
 * is shown or logged: user:password in URLs, tokens, auth headers.
 */
export function scrubCredentials(text: string): string {
  return (
    text
      // https://user:pass@host, https://token@host
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s'"]+@/gi, '$1***@')
      .replace(/(authorization\s*:\s*)[^\r\n]*/gi, '$1***')
      .replace(/\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***')
      .replace(
        /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/g,
        '***',
      )
      .replace(/\b(glpat-[A-Za-z0-9_-]{16,})/g, '***')
      .replace(/((?:password|passwd|token|secret)\s*[=:]\s*)\S+/gi, '$1***')
  );
}

/** Scrubbed and shortened, for the "details" a user can expand. */
export function shortDetail(text: string): string {
  const clean = scrubCredentials(text).trim();
  return clean.length > MAX_DETAIL ? `${clean.slice(0, MAX_DETAIL)}…` : clean;
}
