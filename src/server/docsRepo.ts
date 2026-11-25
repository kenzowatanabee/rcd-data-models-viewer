import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = ['docs/datasets', 'docs/pipelines'];

/** Folders whose top-level Markdown files the viewer lists besides the graph. */
const OTHER_DOC_DIRS = ['docs', 'guides'];

/** Null when `repo` looks like the data models repo, else why not. */
export function checkDocsRepo(repo: string): string | null {
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    return `${repo} is not a folder`;
  }
  const missing = REQUIRED.filter(
    (dir) => !fs.existsSync(path.join(repo, dir)),
  );
  if (missing.length > 0) {
    return `${repo} is not the data models repo: ${missing.join(' and ')} not found`;
  }
  return null;
}

/** `README.md`, `docs/*.md` and `guides/*.md`, as repo-relative paths. */
export function listOtherDocs(repo: string): string[] {
  const files: string[] = [];
  if (fs.existsSync(path.join(repo, 'README.md'))) files.push('README.md');
  for (const dir of OTHER_DOC_DIRS) {
    const folder = path.join(repo, dir);
    if (!fs.existsSync(folder)) continue;
    const names = fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `${dir}/${entry.name}`)
      .sort();
    files.push(...names);
  }
  return files;
}
