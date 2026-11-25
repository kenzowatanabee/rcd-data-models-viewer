import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : [full];
  });
}

describe('source file names', () => {
  // Windows and macOS treat Outline.tsx and outline.ts as one name, so an
  // import of './Outline' can load the wrong file there while Linux is fine.
  it('never differ only by letter case, extension aside', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const file of sourceFiles(root)) {
      const relative = path.relative(root, file);
      if (!/\.(ts|tsx)$/.test(relative)) continue;
      const stem = relative.replace(/(\.test)?\.tsx?$/, '');
      const key = stem.toLowerCase();
      const other = seen.get(key);
      if (other !== undefined && other !== stem) {
        clashes.push(`${other} <-> ${stem}`);
      }
      seen.set(key, stem);
    }
    expect(clashes).toEqual([]);
  });
});
