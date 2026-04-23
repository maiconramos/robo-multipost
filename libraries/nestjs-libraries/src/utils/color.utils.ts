export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/;

export interface AccentVariants {
  base: string;
  hover: string;
  contrast: string;
}

export function isValidHexColor(value: string): boolean {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value);
}

export function normalizeHex(value: string): string {
  if (!isValidHexColor(value)) {
    throw new Error(`Invalid hex color: ${value}`);
  }
  return value.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').slice(0, 6);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mixHex(hex: string, target: 'black' | 'white', weight: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = target === 'white' ? 255 : 0;
  return rgbToHex(
    r + (t - r) * weight,
    g + (t - g) * weight,
    b + (t - b) * weight
  );
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function pickContrast(hex: string): '#000000' | '#ffffff' {
  return relativeLuminance(hex) > 0.5 ? '#000000' : '#ffffff';
}

export function deriveAccentVariants(hex: string): AccentVariants {
  const base = normalizeHex(hex);
  return {
    base,
    hover: mixHex(base, 'black', 0.15),
    contrast: pickContrast(base),
  };
}
