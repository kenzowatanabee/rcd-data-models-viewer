import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, inlineScriptHashes } from './csp';

const sha = (text: string) =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes inline scripts only, once each', () => {
    const html = [
      '<script>a()</script>',
      '<script type="module">\nb()\n</script>',
      '<script type="module" src="/main.tsx"></script>',
      '<script>a()</script>',
    ].join('\n');
    expect(inlineScriptHashes(html)).toEqual([sha('a()'), sha('\nb()\n')]);
  });
});

describe('contentSecurityPolicy', () => {
  it('allows own scripts plus the hashes and the dev websocket', () => {
    const policy = contentSecurityPolicy(["'sha256-x'"], {
      host: '127.0.0.1',
      port: 4000,
    });
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self' 'sha256-x'");
    expect(policy).toContain("connect-src 'self' ws://127.0.0.1:4000");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});
