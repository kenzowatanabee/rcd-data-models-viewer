import { createHash } from 'node:crypto';

import type { Plugin } from 'vite';

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/** CSP source expressions for every inline script in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
    ([, body = '']) =>
      `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`,
  );
  return [...new Set(hashes)];
}

/**
 * The desktop window's policy. Scripts: own files plus the inline scripts
 * by hash (the pre-paint theme script, Vite's React refresh preamble).
 * Styles need 'unsafe-inline': Vite's dev client injects each CSS module as
 * a <style> element, and Mermaid's SVG carries its own <style> element and
 * style attributes.
 */
export function contentSecurityPolicy(
  scriptHashes: readonly string[],
  origin: { host: string; port: number },
): string {
  const ws = `ws://${origin.host}:${origin.port}`;
  return [
    "default-src 'none'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${ws}`,
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Puts the policy first in <head>, after every other plugin's injections. */
export function cspPlugin(
  origin: () => { host: string; port: number },
): Plugin {
  return {
    name: 'desktop-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const policy = contentSecurityPolicy(
          inlineScriptHashes(html),
          origin(),
        );
        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
        return html.replace(/<head[^>]*>/i, (head) => `${head}\n    ${meta}`);
      },
    },
  };
}
