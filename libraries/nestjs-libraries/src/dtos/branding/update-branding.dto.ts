import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { HEX_COLOR_REGEX } from '@gitroom/nestjs-libraries/utils/color.utils';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brandName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'accentColor must be a valid hex color (e.g. #cd2628)' })
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'aiAccentColor must be a valid hex color' })
  aiAccentColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  loginHeroText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  emailFromName?: string | null;
}

export const BRANDING_ASSET_TYPES = [
  'logoLight',
  'logoDark',
  'logoTextLight',
  'logoTextDark',
  'favicon',
  'ogImage',
  'loginBg',
] as const;

export type BrandingAssetType = (typeof BRANDING_ASSET_TYPES)[number];

export const BRANDING_ASSET_COLUMN: Record<BrandingAssetType, string> = {
  logoLight: 'logoLightPath',
  logoDark: 'logoDarkPath',
  logoTextLight: 'logoTextLightPath',
  logoTextDark: 'logoTextDarkPath',
  favicon: 'faviconPath',
  ogImage: 'ogImagePath',
  loginBg: 'loginBgPath',
};
