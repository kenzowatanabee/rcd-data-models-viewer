import { describe, expect, it } from 'vitest';

import { inAppHref, linkIntent } from './address';

const click = (over: Partial<Parameters<typeof linkIntent>[0]>) => ({
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('links', () => {
  it('opens here, in the background with Ctrl/⌘ or the middle button, focused with Shift', () => {
    expect(linkIntent(click({}), false)).toBe('here');
    expect(linkIntent(click({ ctrlKey: true }), false)).toBe('background');
    expect(linkIntent(click({ metaKey: true }), true)).toBe('background');
    expect(linkIntent(click({ ctrlKey: true }), true)).toBe('here');
    expect(linkIntent(click({ button: 1 }), false)).toBe('background');
    expect(linkIntent(click({ shiftKey: true }), false)).toBe('focus');
    expect(linkIntent(click({ button: 2 }), false)).toBeNull();
    expect(linkIntent(click({ altKey: true }), false)).toBeNull();
  });

  it('takes only in-app addresses', () => {
    expect(inAppHref('#/doc/a.md')).toBe('#/doc/a.md');
    expect(inAppHref('https://example.com')).toBeNull();
    expect(inAppHref('#section')).toBeNull();
    expect(inAppHref(null)).toBeNull();
  });
});
