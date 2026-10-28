import type { ColormapKey } from './types';

// Colour maps as compact anchor lists of [r, g, b]. Values are interpolated.
// Lifted from ../../field-map/src/colormaps.ts so the dojo scenes look like
// the rest of the field-map family.

type RGB = [number, number, number];

const STOPS: Record<ColormapKey, RGB[]> = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
    [180, 222, 44], [253, 231, 37],
  ],
  inferno: [
    [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106],
    [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
    [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  plasma: [
    [13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137],
    [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33],
  ],
  cividis: [
    [0, 32, 77], [9, 46, 92], [21, 57, 102], [31, 70, 110],
    [41, 82, 113], [49, 94, 114], [58, 106, 112], [67, 118, 109],
    [75, 129, 106], [81, 141, 103], [85, 153, 101], [88, 166, 99],
    [86, 178, 99], [75, 190, 99], [46, 203, 96], [3, 217, 92],
    [0, 231, 103], [0, 245, 145], [0, 255, 201],
  ],
  coolwarm: [
    [59, 76, 192], [108, 126, 211], [156, 165, 221], [201, 205, 227],
    [245, 243, 234], [231, 205, 177], [216, 155, 100], [198, 116, 39],
    [188, 55, 84],
  ],
  gray: [
    [0, 0, 0], [255, 255, 255],
  ],
  heat: [
    [253, 249, 0],   // yellow (low)
    [248, 220, 8],
    [248, 180, 8],
    [248, 120, 8],   // orange
    [229, 0, 0],     // red
    [165, 0, 32],    // deep red
    [141, 14, 54],   // dark magenta
    [197, 26, 129],  // purple (high)
  ],
};

export const COLORMAP_KEYS = Object.keys(STOPS) as ColormapKey[];

function sampleStops(stops: RGB[], t01: number): RGB {
  const t = Math.max(0, Math.min(1, t01));
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function colorAtRGB(key: ColormapKey, t01: number): RGB {
  return sampleStops(STOPS[key], t01);
}

export function colorAt(key: ColormapKey, t01: number): string {
  const [r, g, b] = colorAtRGB(key, t01);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Theme adaptation.
// ---------------------------------------------------------------------------

export function isLightTheme(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
  );
}

/** Blend a palette colour toward white by `amount` in [0,1]. */
export function lightenToTheme(rgb: RGB, light: boolean, amount = 0.62): RGB {
  if (!light) return rgb;
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * amount),
    Math.round(rgb[1] + (255 - rgb[1]) * amount),
    Math.round(rgb[2] + (255 - rgb[2]) * amount),
  ];
}

/** Palettes that keep their full saturation on a light background. */
const NO_LIGHTEN: ReadonlySet<ColormapKey> = new Set<ColormapKey>(['heat', 'gray']);

export function colorForTheme(key: ColormapKey, t01: number): RGB {
  const rgb = colorAtRGB(key, t01);
  if (NO_LIGHTEN.has(key)) return rgb;
  return lightenToTheme(rgb, isLightTheme());
}

export function cssColor(rgb: RGB, alpha = 1): string {
  const [r, g, b] = rgb;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
