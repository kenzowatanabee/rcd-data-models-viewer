import { describe, expect, it } from 'vitest';

import { isAllowedHost } from './hostCheck';

const LOOPBACK = ['127.0.0.1'];

describe('isAllowedHost', () => {
  it('accepts the bound address and port', () => {
    expect(isAllowedHost('127.0.0.1:5173', 5173, LOOPBACK)).toBe(true);
    expect(isAllowedHost('LOCALHOST:5173', 5173, ['localhost'])).toBe(true);
    expect(isAllowedHost('[::1]:5173', 5173, ['[::1]'])).toBe(true);
  });

  it('rejects other names, ports and missing headers', () => {
    expect(isAllowedHost('evil.example:5173', 5173, LOOPBACK)).toBe(false);
    expect(isAllowedHost('127.0.0.1:5174', 5173, LOOPBACK)).toBe(false);
    expect(isAllowedHost('127.0.0.1', 5173, LOOPBACK)).toBe(false);
    expect(isAllowedHost('localhost:5173', 5173, LOOPBACK)).toBe(false);
    expect(isAllowedHost('127.0.0.1:5173.evil', 5173, LOOPBACK)).toBe(false);
    expect(isAllowedHost(undefined, 5173, LOOPBACK)).toBe(false);
    expect(isAllowedHost('', 5173, LOOPBACK)).toBe(false);
  });

  it('accepts a bare name only on port 80, where browsers omit it', () => {
    expect(isAllowedHost('127.0.0.1', 80, LOOPBACK)).toBe(true);
  });
});
