import { describe, expect, it } from 'vitest';

import { naturalSize } from './svgSize';

describe('naturalSize', () => {
  it('replaces the fit-to-container width with the viewBox width', () => {
    const svg =
      '<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 2345.5px;" viewBox="-8 0 2345.5 1200" role="graphics-document"><g width="100%"></g></svg>';
    expect(naturalSize(svg)).toBe(
      '<svg width="2345.5" id="m1" xmlns="http://www.w3.org/2000/svg" style="" viewBox="-8 0 2345.5 1200" role="graphics-document"><g width="100%"></g></svg>',
    );
  });

  it('leaves anything it does not recognise alone', () => {
    expect(naturalSize('<div></div>')).toBe('<div></div>');
    expect(naturalSize('<svg width="100%"></svg>')).toBe(
      '<svg width="100%"></svg>',
    );
  });
});
