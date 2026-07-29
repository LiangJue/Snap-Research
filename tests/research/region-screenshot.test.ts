import { describe, expect, it } from 'vitest';

import { computePixelCrop } from '@services/research/background/region-screenshot';

describe('computePixelCrop', () => {
  it('maps a CSS-pixel selection to a high-density visible-tab bitmap', () => {
    expect(
      computePixelCrop({
        rect: { x: 100, y: 50, width: 300, height: 200 },
        viewportWidth: 1000,
        viewportHeight: 500,
        imageWidth: 2000,
        imageHeight: 1000,
      }),
    ).toEqual({ x: 200, y: 100, width: 600, height: 400 });
  });

  it('clamps a selection that extends beyond the captured viewport', () => {
    expect(
      computePixelCrop({
        rect: { x: 900, y: 450, width: 300, height: 200 },
        viewportWidth: 1000,
        viewportHeight: 500,
        imageWidth: 1000,
        imageHeight: 500,
      }),
    ).toEqual({ x: 900, y: 450, width: 100, height: 50 });
  });
});
