import {
  deriveAccentVariants,
  isValidHexColor,
  mixHex,
  normalizeHex,
  pickContrast,
} from '../color.utils';

describe('color.utils', () => {
  describe('isValidHexColor', () => {
    it('accepts 6-digit hex', () => {
      expect(isValidHexColor('#cd2628')).toBe(true);
      expect(isValidHexColor('#CD2628')).toBe(true);
    });

    it('accepts 8-digit hex with alpha', () => {
      expect(isValidHexColor('#cd2628ff')).toBe(true);
    });

    it('rejects 3-digit shorthand, missing hash, and random strings', () => {
      expect(isValidHexColor('#abc')).toBe(false);
      expect(isValidHexColor('cd2628')).toBe(false);
      expect(isValidHexColor('not-a-color')).toBe(false);
      expect(isValidHexColor('')).toBe(false);
    });
  });

  describe('normalizeHex', () => {
    it('lowercases valid hex', () => {
      expect(normalizeHex('#CD2628')).toBe('#cd2628');
    });

    it('throws on invalid input', () => {
      expect(() => normalizeHex('red')).toThrow();
    });
  });

  describe('mixHex', () => {
    it('darkens towards black', () => {
      expect(mixHex('#ffffff', 'black', 1)).toBe('#000000');
      expect(mixHex('#ffffff', 'black', 0)).toBe('#ffffff');
    });

    it('lightens towards white', () => {
      expect(mixHex('#000000', 'white', 1)).toBe('#ffffff');
    });
  });

  describe('pickContrast', () => {
    it('returns white for dark backgrounds', () => {
      expect(pickContrast('#000000')).toBe('#ffffff');
      expect(pickContrast('#cd2628')).toBe('#ffffff');
    });

    it('returns black for light backgrounds', () => {
      expect(pickContrast('#ffffff')).toBe('#000000');
      expect(pickContrast('#ffff00')).toBe('#000000');
    });
  });

  describe('deriveAccentVariants', () => {
    it('produces base, hover, and contrast from a valid hex', () => {
      const v = deriveAccentVariants('#CD2628');
      expect(v.base).toBe('#cd2628');
      expect(v.contrast).toBe('#ffffff');
      expect(v.hover).not.toBe(v.base);
      expect(v.hover).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('throws on invalid hex', () => {
      expect(() => deriveAccentVariants('purple')).toThrow();
    });
  });
});
