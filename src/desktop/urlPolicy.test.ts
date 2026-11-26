import { describe, expect, it } from 'vitest';

import { externalUrl, isAppUrl, navigationDecision } from './urlPolicy';

const APP = 'http://127.0.0.1:4100';

describe('externalUrl', () => {
  it('lets http and https through', () => {
    expect(externalUrl('https://example.com/a?b#c')).toBe(
      'https://example.com/a?b#c',
    );
    expect(externalUrl('http://example.com')).toBe('http://example.com/');
  });

  it('refuses every other scheme and credentials in the URL', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'mailto:a@b.c',
      'smb://host/share',
      'ms-settings:',
      'not a url',
      'https://user:pw@example.com',
    ]) {
      expect(externalUrl(url)).toBeNull();
    }
  });
});

describe('navigationDecision', () => {
  it('allows the app origin only', () => {
    expect(isAppUrl(`${APP}/#/doc/README.md`, APP)).toBe(true);
    expect(isAppUrl('http://127.0.0.1:4101/', APP)).toBe(false);
    expect(isAppUrl('http://localhost:4100/', APP)).toBe(false);
    expect(navigationDecision(`${APP}/`, APP)).toEqual({ action: 'allow' });
  });

  it('sends web links out and denies the rest', () => {
    expect(navigationDecision('https://example.com/', APP)).toEqual({
      action: 'external',
      url: 'https://example.com/',
    });
    expect(navigationDecision('file:///C:/x', APP)).toEqual({ action: 'deny' });
  });
});
