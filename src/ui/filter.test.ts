import { describe, expect, it } from 'vitest';

import { matchesFilter } from './filter';

describe('matchesFilter', () => {
  it('matches any text, ignoring case and accents', () => {
    expect(matchesFilter('sort_rec', ['RCD_SORT_REC (flow output)'])).toBe(
      true,
    );
    expect(matchesFilter('distribuição', ['RCD_DISTRIBUICAO_NIQ'])).toBe(true);
    expect(matchesFilter('CAO', ['Hierarquia Distribuição'])).toBe(true);
    expect(matchesFilter('legacy', ['NAME', 'OLD_LEGACY_ALIAS'])).toBe(true);
    expect(matchesFilter('nielsen', ['RCD_SKU_NIQ'])).toBe(false);
  });

  it('lets everything through for an empty query', () => {
    expect(matchesFilter('', [])).toBe(true);
    expect(matchesFilter('   ', ['x'])).toBe(true);
  });
});
